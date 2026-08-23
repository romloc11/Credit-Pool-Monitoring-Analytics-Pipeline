-- Raw load: one COPY per table, no transformation.
-- The destination columns are already VARCHAR (see
-- 01_create_bronze_tables.sql), so DuckDB loads the text as-is, without
-- inferring types on its own -- silver is the only source of truth on types.

COPY bronze.pedidos_pool_clientes
FROM 'data/bronze/pedidos_pool_clientes.csv' (HEADER TRUE);

COPY bronze.estatus_pool
FROM 'data/bronze/estatus_pool.csv' (HEADER TRUE);

COPY bronze.vendedores
FROM 'data/bronze/vendedores.csv' (HEADER TRUE);
