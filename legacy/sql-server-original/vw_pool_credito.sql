CREATE OR ALTER VIEW dbo.vw_pool_credito
AS

SELECT *
FROM OPENQUERY(
CiosaCOM,
'
SELECT

    -- Identificación
    ppc.pedido,
    ppc.cliente,
    ppc.valor_pedido,

    -- Motivo de entrada al pool
    CASE
        WHEN ppc.bsap = 1 THEN ''Bloqueo SAP''
        WHEN ppc.bvs = 1 THEN ''Saldo vencido''
        WHEN ppc.belx = 1 THEN ''Límite excedido''
        ELSE ''Otro''
    END AS motivo_pool,

    -- Estatus
    CASE
        WHEN ppc.estatus = 0 THEN ''Retenido''
        ELSE ep.descripcion
    END AS estatus,

    -- Fechas
    ppc.creado_en,
    DATE_FORMAT(ppc.creado_en, ''%d/%m/%Y'') AS fecha_creacion,
    ppc.liberado_fecha,
    ppc.cancelado_fecha,

    -- Usuario
    LOWER(TRIM(IFNULL(v.nombre, ''Sistema''))) AS usuario_libero,

    -- Indicadores
    CASE
        WHEN ppc.liberado_fecha IS NOT NULL THEN 1
        ELSE 0
    END AS indicador_liberado,

    CASE
        WHEN ppc.cancelado_fecha IS NOT NULL THEN 1
        ELSE 0
    END AS indicador_cancelado,

    CASE
        WHEN ppc.liberado_fecha IS NULL
         AND ppc.cancelado_fecha IS NULL
        THEN 1
        ELSE 0
    END AS indicador_en_pool,

    -- Tiempos
    TIMESTAMPDIFF(MINUTE, ppc.creado_en, ppc.liberado_fecha) AS minutos_liberacion,
    TIMESTAMPDIFF(MINUTE, ppc.creado_en, ppc.cancelado_fecha) AS minutos_cancelacion,

    -- Fecha de extracción
    CURDATE() AS fecha_carga

FROM pedidos_pool_clientes ppc

LEFT JOIN estatus_pool ep
    ON ep.estatus = ppc.estatus

LEFT JOIN vendedores v
    ON v.usuario = ppc.usuario_libero

WHERE ppc.creado_en >= ''2026-03-10''

'
);

