-- Bronze: estructura identica a lo que entrega el sistema origen.
-- Todo se guarda como texto a proposito. Bronze no decide tipos ni
-- corrige nada -- esa responsabilidad es de silver. Si algo llega mal
-- formado del origen, aqui debe seguir viendose mal formado.

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
