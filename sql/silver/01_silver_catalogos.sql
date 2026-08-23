-- Silver: clean, typed catalogs.
-- vendedores.usuario is normalized here (lowercase, no spaces, underscore
-- -> period) because that's how it will need to be matched against
-- pedidos_pool.usuario_libero later on -- both sides have to end up in
-- the same format or the join won't hit.

CREATE SCHEMA IF NOT EXISTS silver;

CREATE OR REPLACE TABLE silver.estatus_pool AS
SELECT
    CAST(estatus AS INTEGER) AS estatus,
    TRIM(descripcion)        AS descripcion
FROM bronze.estatus_pool;

CREATE OR REPLACE TABLE silver.vendedores AS
SELECT
    LOWER(TRIM(REPLACE(usuario, '_', '.'))) AS usuario,
    TRIM(nombre)                            AS nombre
FROM bronze.vendedores;
