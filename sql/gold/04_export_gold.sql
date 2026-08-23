-- Exporta las tablas gold a CSV para que Power BI las importe
-- directamente, sin depender de un driver de DuckDB instalado en la
-- maquina de quien clone el repo.

COPY gold.dim_cliente              TO 'data/gold/dim_cliente.csv' (HEADER, DELIMITER ',');
COPY gold.dim_analista             TO 'data/gold/dim_analista.csv' (HEADER, DELIMITER ',');
COPY gold.dim_motivo_pool          TO 'data/gold/dim_motivo_pool.csv' (HEADER, DELIMITER ',');
COPY gold.dim_estatus              TO 'data/gold/dim_estatus.csv' (HEADER, DELIMITER ',');
COPY gold.dim_calendario           TO 'data/gold/dim_calendario.csv' (HEADER, DELIMITER ',');
COPY gold.fact_pedido_pool         TO 'data/gold/fact_pedido_pool.csv' (HEADER, DELIMITER ',');
COPY gold.fact_pool_snapshot_diario TO 'data/gold/fact_pool_snapshot_diario.csv' (HEADER, DELIMITER ',');
