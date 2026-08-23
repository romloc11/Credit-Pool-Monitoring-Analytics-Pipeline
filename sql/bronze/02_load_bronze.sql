-- Carga cruda: un COPY por tabla, sin transformar nada.
-- Las columnas destino ya son VARCHAR (ver 01_create_bronze_tables.sql),
-- asi que DuckDB carga el texto tal cual llega, sin inferir tipos por
-- su cuenta -- la unica fuente de verdad sobre tipos es silver.

COPY bronze.pedidos_pool_clientes
FROM 'data/bronze/pedidos_pool_clientes.csv' (HEADER TRUE);

COPY bronze.estatus_pool
FROM 'data/bronze/estatus_pool.csv' (HEADER TRUE);

COPY bronze.vendedores
FROM 'data/bronze/vendedores.csv' (HEADER TRUE);
