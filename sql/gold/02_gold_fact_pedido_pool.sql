-- Gold: fact_pedido_pool
-- Grain: one order. Carries 3 keys into dim_calendario (creation,
-- release, cancellation) because it's a role-playing dimension -- the
-- same calendar answers both "orders created in March" and "orders
-- released in March" without duplicating the dimension. In Power BI
-- this is handled by activating a single relationship by default
-- (creation) and the other two via USERELATIONSHIP in the measures
-- that need them.

CREATE OR REPLACE TABLE gold.fact_pedido_pool AS
SELECT
    p.pedido,

    c.cliente_key,
    a.analista_key,
    m.motivo_key,
    e.estatus_key,

    CAST(p.creado_en AS DATE)       AS fecha_creacion_key,
    CAST(p.liberado_fecha AS DATE)  AS fecha_liberacion_key,
    CAST(p.cancelado_fecha AS DATE) AS fecha_cancelacion_key,

    p.creado_en,
    p.liberado_fecha,
    p.cancelado_fecha,

    p.valor_pedido,
    p.minutos_liberacion,
    p.minutos_cancelacion,

    p.indicador_liberado,
    p.indicador_cancelado,
    p.indicador_en_pool,

    p.estatus_fue_reconstruido,
    p.usuario_no_catalogado

FROM silver.pedidos_pool p
LEFT JOIN gold.dim_cliente     c ON c.cliente = p.cliente
LEFT JOIN gold.dim_analista    a ON a.usuario = p.usuario_libero
LEFT JOIN gold.dim_motivo_pool m ON m.motivo_pool = p.motivo_pool
LEFT JOIN gold.dim_estatus     e ON e.estatus = p.estatus;
