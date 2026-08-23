-- Silver: pedidos_pool
-- Un registro limpio y tipado por pedido. Se corrige aqui, en un solo
-- lugar y con reglas explicitas, todo lo que en el diseno original
-- quedaba mezclado dentro del OPENQUERY o resuelto de forma implicita:
--
--   1. estatus fuera de catalogo (99) ya no se descarta con un WHERE
--      en la extraccion -- se reconstruye a partir de las fechas.
--   2. "no liberado" y "liberado por alguien fuera de catalogo" eran
--      el mismo valor ('Sistema') en el diseno original. Aqui quedan
--      separados: nombre_analista NULL vs. usuario_no_catalogado TRUE.
--
-- Va en pasos (CTE por CTE) para poder revisar cada transformacion
-- por separado si algo no cuadra, en vez de depurar un SELECT gigante.

CREATE OR REPLACE TABLE silver.pedidos_pool AS

WITH bronze_deduplicado AS (
    -- defensivo: si algun dia bronze llega a tener el mismo pedido
    -- dos veces (por ejemplo, una recarga que no se trunco bien),
    -- silver se queda con la version mas reciente en vez de duplicar
    -- el pedido en las capas de arriba.
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY pedido
            ORDER BY creado_en DESC
        ) AS rn
    FROM bronze.pedidos_pool_clientes
),

tipado AS (
    -- paso 1: solo conversion de tipos. ninguna regla de negocio todavia.
    SELECT
        pedido,
        cliente,
        CAST(valor_pedido AS DECIMAL(15,2)) AS valor_pedido,
        CAST(bsap AS BOOLEAN)               AS bloqueo_sap,
        CAST(bvs AS BOOLEAN)                AS saldo_vencido,
        CAST(belx AS BOOLEAN)               AS limite_excedido,
        CAST(estatus AS INTEGER)            AS estatus_origen,
        CAST(creado_en AS TIMESTAMP)        AS creado_en,
        CAST(liberado_fecha AS TIMESTAMP)   AS liberado_fecha,
        CAST(cancelado_fecha AS TIMESTAMP)  AS cancelado_fecha,
        TRIM(usuario_libero)                AS usuario_libero_crudo
    FROM bronze_deduplicado
    WHERE rn = 1
),

usuario_normalizado AS (
    -- paso 2: mismo criterio de normalizacion que silver.vendedores.
    SELECT
        *,
        LOWER(REPLACE(usuario_libero_crudo, '_', '.')) AS usuario_libero
    FROM tipado
),

estatus_reconstruido AS (
    -- paso 3: si el codigo que llego de origen no existe en catalogo,
    -- se reconstruye a partir de las fechas, que son un dato mas
    -- confiable que un campo categorico mal capturado.
    SELECT
        *,
        CASE
            WHEN estatus_origen IN (0, 1, 2, 3, 4) THEN estatus_origen
            WHEN liberado_fecha IS NOT NULL THEN 1   -- Liberado
            WHEN cancelado_fecha IS NOT NULL THEN 2  -- Cancelado
            ELSE 3                                   -- En revision
        END AS estatus_codigo,
        estatus_origen NOT IN (0, 1, 2, 3, 4) AS estatus_fue_reconstruido
    FROM usuario_normalizado
)

SELECT
    e.pedido,
    e.cliente,
    e.valor_pedido,

    CASE
        WHEN e.limite_excedido THEN 'Limite excedido'
        WHEN e.saldo_vencido   THEN 'Saldo vencido'
        WHEN e.bloqueo_sap     THEN 'Bloqueo SAP'
        ELSE 'Otro'
    END AS motivo_pool,

    CASE e.estatus_codigo
        WHEN 0 THEN 'Retenido'
        ELSE ep.descripcion
    END AS estatus,
    e.estatus_fue_reconstruido,

    e.creado_en,
    e.liberado_fecha,
    e.cancelado_fecha,

    e.liberado_fecha IS NOT NULL AS indicador_liberado,
    e.cancelado_fecha IS NOT NULL AS indicador_cancelado,
    e.liberado_fecha IS NULL AND e.cancelado_fecha IS NULL AS indicador_en_pool,
    e.liberado_fecha IS NOT NULL AND e.cancelado_fecha IS NOT NULL AS inconsistencia_fechas,

    DATE_DIFF('minute', e.creado_en, e.liberado_fecha)  AS minutos_liberacion,
    DATE_DIFF('minute', e.creado_en, e.cancelado_fecha) AS minutos_cancelacion,

    e.usuario_libero,
    v.nombre AS nombre_analista,
    e.usuario_libero IS NOT NULL AND v.nombre IS NULL AS usuario_no_catalogado

FROM estatus_reconstruido e
LEFT JOIN silver.estatus_pool ep
    ON ep.estatus = e.estatus_codigo
LEFT JOIN silver.vendedores v
    ON v.usuario = e.usuario_libero;
