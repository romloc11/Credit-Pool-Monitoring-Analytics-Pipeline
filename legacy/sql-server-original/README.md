# Version original (SQL Server)

Esto es lo que habia antes del rediseno: un solo view (`vw_pool_credito.sql`)
que hacia extraccion y transformacion en el mismo OPENQUERY contra un linked
server de MariaDB, cargado con TRUNCATE + INSERT a una tabla plana en SQL
Server via un job de SQL Server Agent.

Lo dejo aqui como referencia, no como parte activa del proyecto. El repo
principal ahora usa DuckDB (ver `sql/`, `python/`, `powerbi/` en la raiz) por
las razones que explico en el README principal -- basicamente, TRUNCATE +
INSERT no dejaba ver la evolucion del pool en el tiempo, y la logica de
negocio metida dentro del string de OPENQUERY era dificil de depurar por
partes.
