-- Silver: pedidos_pool
-- One clean, typed record per order. Everything that the original design
-- kept mixed inside the OPENQUERY or resolved implicitly is fixed here,
-- in a single place with explicit rules:
--
--   1. out-of-catalog status (99) is no longer discarded with a WHERE
--      at extraction -- it's reconstructed from the dates.
--   2. "not released" and "released by someone outside the catalog"
--      used to be the same value ('Sistema') in the original design.
--      Here they're separated: nombre_analista NULL vs.
--      usuario_no_catalogado TRUE.
--
-- Built in steps (CTE by CTE) so each transformation can be reviewed
-- separately if something doesn't add up, instead of debugging one
-- giant SELECT.

CREATE OR REPLACE TABLE silver.pedidos_pool AS

WITH bronze_deduplicado AS (
    -- defensive: if bronze ever ends up with the same order twice (e.g.
    -- a reload that didn't truncate properly), silver keeps the most
    -- recent version instead of duplicating the order in the layers
    -- above.
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY pedido
            ORDER BY creado_en DESC
        ) AS rn
    FROM bronze.pedidos_pool_clientes
),

tipado AS (
    -- step 1: type conversion only. No business rules yet.
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
    -- step 2: same normalization criteria as silver.vendedores.
    SELECT
        *,
        LOWER(REPLACE(usuario_libero_crudo, '_', '.')) AS usuario_libero
    FROM tipado
),

estatus_reconstruido AS (
    -- step 3: if the code that came from the source doesn't exist in
    -- the catalog, it's reconstructed from the dates, which are more
    -- reliable data than a poorly captured categorical field.
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
