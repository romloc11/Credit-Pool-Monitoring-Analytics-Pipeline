-- Silver: catalogos limpios y tipados.
-- vendedores.usuario se normaliza aqui (minusculas, sin espacios,
-- guion bajo -> punto) porque asi es como se va a buscar el match
-- contra pedidos_pool.usuario_libero mas adelante -- ambos lados
-- tienen que quedar en el mismo formato o el join no pega.

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
