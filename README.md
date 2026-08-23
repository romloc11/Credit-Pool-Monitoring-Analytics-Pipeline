# Order Pool Monitoring Pipeline

Pipeline de datos y dashboard para monitorear el pool de crédito de una empresa: pedidos bloqueados por límite de crédito, saldo vencido o bloqueo SAP, y qué tan rápido el equipo de crédito los libera o los cancela.

Este fue uno de mis primeros proyectos con SQL y Power BI, construido originalmente en SQL Server contra un sistema real de la empresa donde trabajo. Lo reconstruí completo — lógica, modelo de datos y reporte — aplicando lo que he aprendido desde entonces en proyectos posteriores (medallion architecture, star schema, DAX).

## Problema y objetivo

Cuando un pedido se bloquea por crédito, entra a un "pool" hasta que un analista lo libera o se cancela. El equipo necesita saber tres cosas en cualquier momento: cuántos pedidos siguen atorados, qué tan rápido se están resolviendo, y si el backlog está creciendo o bajando. Sin eso, un pedido se puede quedar semanas en revisión sin que nadie lo note.

## Dataset

Los datos reales de la empresa no se pueden publicar, así que este repo usa un generador sintético (`python/generate_source_data.py`) que reproduce la misma forma y las mismas inconsistencias que tenía el dato original:

- 3,712 pedidos a lo largo de 180 días, 200 clientes, 10 analistas de crédito
- Motivo de bloqueo no equiprobable (límite excedido es el más común, como en el negocio real)
- Un lote de pedidos con `estatus` fuera de catálogo en las primeras dos semanas (simula un problema real de captura que hubo que resolver en Silver, no descartar)
- Formato de usuario inconsistente (mayúsculas, guion bajo vs. punto) para poder mostrar la limpieza real que hace la capa Silver

Semilla fija — correr el generador dos veces da exactamente los mismos datos.

## Arquitectura

```
Python (datos sintéticos)
        │
        ▼
Bronze (DuckDB, todo VARCHAR, sin limpiar nada)
        │
        ▼
Silver (tipado, estatus reconstruido, un registro por pedido)
        │
        ▼
Gold (star schema: 5 dimensiones + 2 tablas de hechos)
        │
        ▼
Power BI (modelo semántico + 2 páginas de reporte)
```

## Por qué DuckDB y no SQL Server

La versión original corría contra SQL Server con un linked server a MariaDB — fiel al entorno real de la empresa, pero imposible de clonar y correr para cualquiera que revise el repo. DuckDB no necesita instalación ni infraestructura, corre local desde un archivo, y su sintaxis SQL es lo bastante parecida a T-SQL que la lógica de negocio se tradujo casi directo. Para el volumen de este proyecto (unos cuantos miles de filas) no hay ninguna razón para algo más pesado.

## Pipeline y decisiones técnicas

**Bronze:** las tres tablas fuente (`pedidos_pool_clientes`, `estatus_pool`, `vendedores`) se cargan tal cual, todo como texto. Bronze no decide tipos ni corrige nada — si algo llega mal formado del origen, aquí se debe seguir viendo mal formado. Esa disciplina es la que permite que Silver tenga un trabajo real y verificable que hacer.

**Silver:** aquí corregí dos cosas que en la versión original quedaban mal resueltas:

- El `estatus` que llega del origen a veces es inválido (fuera de catálogo). La versión original simplemente filtraba esas fechas en la extracción (`WHERE creado_en >= '...'`), perdiendo esos pedidos para siempre. La nueva versión reconstruye el estatus a partir de las fechas de liberación/cancelación, que son un dato más confiable que un campo categórico mal capturado, y marca cuáles fueron reconstruidos (`estatus_fue_reconstruido`) en vez de esconderlo.
- La lógica original usaba `IFNULL(v.nombre, 'Sistema')`, que mezclaba dos casos completamente distintos bajo la misma etiqueta: un pedido que **todavía no se libera** y un pedido liberado por **alguien que no está en el catálogo de analistas**. Ahora son dos campos separados (`nombre_analista` nulo vs. `usuario_no_catalogado` = true), y el segundo se expone como medida de calidad de dato en el dashboard en vez de ocultarse.

**Gold:** el cambio más grande fue reemplazar el TRUNCATE + INSERT del diseño original. Ese patrón sobrescribía la tabla completa en cada carga — funcionaba para ver el estado *actual* del pool, pero hacía imposible ver cómo había evolucionado. La solución fue separar dos grados distintos en dos tablas de hechos:

- `fact_pedido_pool` — un registro por pedido (el equivalente directo del diseño original, pero como fact de un star schema).
- `fact_pool_snapshot_diario` — un registro por día con el estado del pool tal como se veía ese día (pedidos nuevos, liberados, cancelados, y cuántos seguían abiertos al cierre). Esta es la tabla que resuelve el problema de historial: en producción correría una vez al día agregando la fila de "hoy" (INSERT, nunca TRUNCATE).

## Calidad de datos

Dos medidas del dashboard existen específicamente para exponer, no esconder, los límites del dato:

- **% de pedidos con estatus reconstruido** (~1.2%): cuántos registros llegaron con un código inválido y se reconstruyeron a partir de fechas.
- **% de pedidos con usuario no catalogado**: cuántos pedidos fueron liberados por alguien que no aparece en el catálogo de analistas (en este dataset sintético da 0%, pero la medida queda lista para cuando aparezca en datos reales).

## Modelo de datos (Gold)

Star schema con dos hechos y una dimensión de calendario compartida (conformada) entre ambos:

```
        dim_cliente ─┐
      dim_analista ──┤
   dim_motivo_pool ──┼── fact_pedido_pool ──┐
       dim_estatus ──┘                       │
                                              ├── dim_calendario
                        fact_pool_snapshot_diario
```

`fact_pedido_pool` tiene tres llaves de fecha hacia `dim_calendario` (creación, liberación, cancelación) como dimensión de rol — la de creación queda activa por default, las otras dos se activan puntualmente en un par de medidas vía `USERELATIONSHIP` cuando hace falta ver "liberado en el periodo" en vez de "creado en el periodo".

## KPIs y preguntas de negocio

| Pregunta | KPI / medida |
|---|---|
| ¿Cuántos pedidos siguen atorados ahora mismo? | Pedidos en Pool al Cierre |
| ¿El backlog está creciendo o bajando? | Tendencia diaria (línea de tiempo) |
| ¿Qué proporción termina cancelándose en vez de liberándose? | % Pedidos Cancelados (con semáforo) |
| ¿Qué tan viejos son los pedidos que siguen sin resolver? | Antigüedad Promedio del Pool (con semáforo) |
| ¿Cuál es el motivo de bloqueo más frecuente? | Motivo de Bloqueo (desglose) |
| ¿Qué tan bien está funcionando cada analista? | Pedidos Liberados y Tiempo Promedio de Liberación por Analista |
| ¿Qué tan confiable es el dato? | % Estatus Reconstruido, % Usuario No Catalogado |

## Dashboard

**Página 1 — Estado del pool.** Pensada para revisar de un vistazo: 4 tarjetas KPI (dos con semáforo verde/ámbar/rojo sobre umbrales reales, dos neutrales), cuatro líneas de tendencia sincronizadas en el mismo eje de fechas, el desglose por motivo de bloqueo, y una tabla con los pedidos que llevan más tiempo abiertos — ordenados peor primero, como una cola de atención.

![Estado del pool](docs/screenshots/dashboard_estado_del_pool.png)

**Página 2 — Analistas y antigüedad.** Vista de análisis: ranking de pedidos liberados por analista, tiempo promedio de liberación, comparación de tiempos por motivo de bloqueo, y las dos medidas de calidad de dato. Con segmentadores de Analista, Motivo y Mes.

![Analistas y antigüedad](docs/screenshots/dashboard_analistas_y_antiguedad.png)

Los segmentadores de **Mes** están sincronizados entre las dos páginas (elegir un mes en una se aplica en la otra). Los de Analista y Motivo solo viven en la página 2 a propósito: en la página 1, esas dos dimensiones no aplican al pool abierto porque **un pedido que sigue abierto todavía no tiene analista asignado** — eso no es una limitación del reporte, es un hecho del negocio (el analista solo se asigna cuando el pedido se libera).

## Bugs reales que encontré construyendo esto

Documentarlos aquí porque el proceso de encontrarlos fue más instructivo que el resultado final:

1. **Medida y columna con el mismo nombre.** Tenía una medida `Pedidos en Pool al Cierre` y una columna oculta con el mismo nombre salvo mayúsculas en la misma tabla. Power BI no distingue mayúsculas para esto, y el modelo se negaba a cargar. Se resuelve renombrando la columna fuente para que no choque.
2. **Un KPI mal etiquetado.** Una tarjeta decía "pedidos liberados por día" pero en realidad sumaba el período completo seleccionado, no un promedio diario — dos cosas muy distintas. Hubo que hacer una medida de promedio real (`AVERAGEX` sobre el calendario) en vez de solo cambiar la etiqueta.
3. **Una tabla que no renderizaba.** Un visual fallaba con un genérico "problema de capacidad o licencia". Lo aislé probando 3 configuraciones distintas (con filtro, sin filtro, cambiando el campo de orden) hasta confirmar que la única constante era una medida con `CALCULATE(MAX(...), REMOVEFILTERS(...))` anidada — Power BI Desktop no la resolvía bien dentro de esa tabla en particular. Se resolvió sacando esa medida de la tabla y usando una columna simple en su lugar.

## Cómo reproducir este proyecto

```bash
# 1. Generar los datos sintéticos (misma semilla = mismos datos)
python python/generate_source_data.py

# 2. Correr el pipeline bronze -> silver -> gold en DuckDB
python python/build_database.py bronze silver gold

# 3. Regenerar el reporte de Power BI (PBIP): paginas, visuales y tema
node powerbi/build_report.js

# 4. Abrir powerbi/PoolCredito.pbip en Power BI Desktop
```

El modelo semántico (`powerbi/PoolCredito.SemanticModel/`) ya está construido y no necesita el paso 3 para funcionar — ese paso solo regenera las páginas del reporte. Los archivos `.tmdl` del modelo se pueden editar directo o reconstruir con las herramientas de modelado de Power BI.

## Limitaciones y próximos pasos

- El pool de crédito real seguramente tiene reglas de escalamiento (quién puede liberar qué monto) que este dataset sintético no modela.
- Con más tiempo, agregaría una tabla de hechos a nivel día×motivo en Gold para que los segmentadores de motivo también filtren las tarjetas de saldo en la página 1 (hoy solo lo hace Mes) — motivo sí aplica a un pedido abierto, a diferencia de analista.
- El refresh es manual (Import mode) porque este es un proyecto de portafolio con datos sintéticos, no un pipeline en producción. En un entorno real, `sql/gold/03_gold_fact_pool_snapshot_diario.sql` es exactamente la lógica que correría una vez al día.

## Herramientas utilizadas

- **DuckDB** — motor de transformación, sin necesidad de instalar un servidor de base de datos para poder correr el proyecto.
- **Python (pandas, numpy)** — generación de datos sintéticos reproducibles.
- **Power BI (PBIR/PBIP)** — modelo semántico y dashboard. El reporte se genera con un script de Node.js (`powerbi/build_report.js`) que traduce el diseño a los archivos del proyecto — así el reporte completo es reproducible desde código, igual que el resto del pipeline.