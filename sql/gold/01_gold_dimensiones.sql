-- Gold: star schema dimensions.
-- Silver already arrives clean, so this is just about pulling unique
-- values and giving them a surrogate key -- no new business rules in
-- this file.

CREATE SCHEMA IF NOT EXISTS gold;

CREATE OR REPLACE TABLE gold.dim_cliente AS
SELECT
    ROW_NUMBER() OVER (ORDER BY cliente) AS cliente_key,
    cliente
FROM (SELECT DISTINCT cliente FROM silver.pedidos_pool);

CREATE OR REPLACE TABLE gold.dim_analista AS
SELECT
    ROW_NUMBER() OVER (ORDER BY usuario) AS analista_key,
    usuario,
    nombre
FROM silver.vendedores;

CREATE OR REPLACE TABLE gold.dim_motivo_pool AS
SELECT
    ROW_NUMBER() OVER (ORDER BY motivo_pool) AS motivo_key,
    motivo_pool
FROM (SELECT DISTINCT motivo_pool FROM silver.pedidos_pool);

CREATE OR REPLACE TABLE gold.dim_estatus AS
SELECT
    ROW_NUMBER() OVER (ORDER BY estatus) AS estatus_key,
    estatus
FROM (SELECT DISTINCT estatus FROM silver.pedidos_pool);

-- dim_calendario: covers from the oldest order to the most recent event
-- (creation / release / cancellation) present in the data, not a fixed
-- range -- this way the dimension always matches what's actually in
-- the facts.
CREATE OR REPLACE TABLE gold.dim_calendario AS
WITH rango AS (
    SELECT
        CAST(MIN(creado_en) AS DATE) AS fecha_min,
        CAST(MAX(COALESCE(cancelado_fecha, liberado_fecha, creado_en)) AS DATE) AS fecha_max
    FROM silver.pedidos_pool
),
dias AS (
    SELECT CAST(unnest(generate_series(fecha_min, fecha_max, INTERVAL 1 DAY)) AS DATE) AS fecha
    FROM rango
)
SELECT
    fecha AS fecha_key,
    fecha,
    EXTRACT(YEAR FROM fecha)  AS anio,
    EXTRACT(MONTH FROM fecha) AS mes,
    EXTRACT(DAY FROM fecha)   AS dia,
    CASE EXTRACT(MONTH FROM fecha)
        WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
        WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
        WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
        WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
    END AS nombre_mes,
    ISODOW(fecha) AS dia_semana_num,  -- 1 = Monday ... 7 = Sunday
    CASE ISODOW(fecha)
        WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miercoles'
        WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sabado'
        WHEN 7 THEN 'Domingo'
    END AS nombre_dia,
    ISODOW(fecha) IN (6, 7) AS es_fin_de_semana
FROM dias;
