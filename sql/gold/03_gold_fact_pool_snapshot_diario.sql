-- Gold: fact_pool_snapshot_diario
-- Grain: one day. This is the table that replaces the original design's
-- TRUNCATE + INSERT -- instead of overwriting the pool's state on every
-- load (losing the snapshot of previous days), this rebuilds one row
-- per day with the pool's state as it looked that day. In production
-- this same logic would run once a day, appending "today's" row
-- (INSERT, never TRUNCATE).

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

-- estado_al_cierre: for each calendar day, which orders had already
-- entered the pool and were still unresolved at that day's close (if
-- it was released or canceled the same day, it no longer counts as
-- open at close).
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
