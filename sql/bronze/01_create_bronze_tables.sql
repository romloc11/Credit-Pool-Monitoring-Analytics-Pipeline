-- Bronze: structure identical to what the source system delivers.
-- Everything is stored as text on purpose. Bronze doesn't decide types or
-- fix anything -- that responsibility belongs to silver. If something
-- arrives malformed from the source, it should still look malformed here.

CREATE SCHEMA IF NOT EXISTS bronze;

CREATE OR REPLACE TABLE bronze.pedidos_pool_clientes (
    pedido           VARCHAR,
    cliente          VARCHAR,
    valor_pedido     VARCHAR,
    bsap             VARCHAR,
    bvs              VARCHAR,
    belx             VARCHAR,
    estatus          VARCHAR,
    creado_en        VARCHAR,
    liberado_fecha   VARCHAR,
    cancelado_fecha  VARCHAR,
    usuario_libero   VARCHAR
);

CREATE OR REPLACE TABLE bronze.estatus_pool (
    estatus      VARCHAR,
    descripcion  VARCHAR
);

CREATE OR REPLACE TABLE bronze.vendedores (
    usuario  VARCHAR,
    nombre   VARCHAR
);
