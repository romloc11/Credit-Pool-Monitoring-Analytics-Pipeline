CREATE TABLE dbo.pool_credito (

    -- Identificación
    pedido VARCHAR(50),
    cliente VARCHAR(20),
    valor_pedido DECIMAL(15,2),

    -- Motivo
    motivo_pool VARCHAR(50),

    -- Estatus
    estatus VARCHAR(100),

    -- Fechas
    creado_en DATETIME,
    fecha_creacion DATE,
    liberado_fecha DATETIME,
    cancelado_fecha DATETIME,

    -- Usuario
    usuario_libero VARCHAR(100),

    -- Indicadores
    indicador_liberado INT,
    indicador_cancelado INT,
    indicador_en_pool INT,

    -- Tiempos
    minutos_liberacion INT,
    minutos_cancelacion INT,

    -- Fecha de carga
    fecha_carga DATE

);
