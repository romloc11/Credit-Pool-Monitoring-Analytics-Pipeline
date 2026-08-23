-- Gold: fact_pool_snapshot_diario
-- Grano: un dia. Esta es la tabla que reemplaza al TRUNCATE + INSERT
-- del diseno original -- en vez de sobreescribir el estado del pool
-- en cada carga (perdiendo la foto de dias anteriores), aqui se
-- reconstruye una fila por dia con el estado del pool tal como se
-- veia ese dia. En produccion esta misma logica correria una vez al
-- dia, agregando la fila de "hoy" (INSERT, nunca TRUNCATE).

CREATE OR REPLACE TABLE gold.fact_pool_snapshot_diario AS

WITH nuevos AS (
    SELECT fecha_creacion_key AS fecha, COUNT(*) AS pedidos_nuevos
    FROM gold.fact_pedido_pool
    GROUP BY 1
),

liberados AS (
    SELECT fecha_liberacion_key AS fecha, COUNT(*) AS pedidos_liberados
    FROM gold.fact_pedido_pool
    WHERE fecha_liberacion_key IS NOT NULL
    GROUP BY 1
),

cancelados AS (
    SELECT fecha_cancelacion_key AS fecha, COUNT(*) AS pedidos_cancelados
    FROM gold.fact_pedido_pool
    WHERE fecha_cancelacion_key IS NOT NULL
    GROUP BY 1
),

-- estado_al_cierre: para cada dia del calendario, que pedidos ya
-- habian entrado al pool y todavia no se habian resuelto al cierre
-- de ese dia (si se libero o cancelo el mismo dia, ya no cuenta como
-- abierto al cierre).
estado_al_cierre AS (
    SELECT
        cal.fecha,
        COUNT(*)                                            AS pedidos_en_pool_al_cierre,
        SUM(f.valor_pedido)                                 AS valor_en_pool_al_cierre,
        AVG(DATE_DIFF('day', f.creado_en, cal.fecha))        AS edad_promedio_dias_en_pool
    FROM gold.dim_calendario cal
    JOIN gold.fact_pedido_pool f
        ON CAST(f.creado_en AS DATE) <= cal.fecha
       AND (f.fecha_liberacion_key  IS NULL OR f.fecha_liberacion_key  > cal.fecha)
       AND (f.fecha_cancelacion_key IS NULL OR f.fecha_cancelacion_key > cal.fecha)
    GROUP BY cal.fecha
)

SELECT
    cal.fecha                                       AS fecha_key,
    COALESCE(n.pedidos_nuevos, 0)                    AS pedidos_nuevos,
    COALESCE(l.pedidos_liberados, 0)                 AS pedidos_liberados,
    COALESCE(c.pedidos_cancelados, 0)                AS pedidos_cancelados,
    COALESCE(ec.pedidos_en_pool_al_cierre, 0)        AS pedidos_en_pool_al_cierre,
    COALESCE(ec.valor_en_pool_al_cierre, 0)          AS valor_en_pool_al_cierre,
    ec.edad_promedio_dias_en_pool
FROM gold.dim_calendario cal
LEFT JOIN nuevos            n  ON n.fecha  = cal.fecha
LEFT JOIN liberados         l  ON l.fecha  = cal.fecha
LEFT JOIN cancelados        c  ON c.fecha  = cal.fecha
LEFT JOIN estado_al_cierre  ec ON ec.fecha = cal.fecha;
