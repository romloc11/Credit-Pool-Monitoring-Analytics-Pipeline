"use strict";
/**
 * Genera el proyecto PBIP (PoolCredito.Report + PoolCredito.pbip) a partir
 * del diseño acordado para el reporte. Determinista: correr de nuevo produce
 * el mismo reporte (salvo los IDs, que son aleatorios pero no afectan el
 * resultado visual).
 *
 * El modelo semantico (PoolCredito.SemanticModel) ya existe -- este script
 * solo escribe la carpeta de Reporte y el .pbip que lo referencia.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const REPORT_DIR = path.join(ROOT, "PoolCredito.Report");
const DEF_DIR = path.join(REPORT_DIR, "definition");
const PAGES_DIR = path.join(DEF_DIR, "pages");
const STATIC_DIR = path.join(REPORT_DIR, "StaticResources", "RegisteredResources");

const VC_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json";
const PAGE_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json";
const PAGES_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json";
const VERSION_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json";
const REPORT_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.0.0/schema.json";
const REPORT_EXTENSION_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json";

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

function id20() {
  return crypto.randomBytes(10).toString("hex");
}
function filterId() {
  return "Filter" + crypto.randomBytes(12).toString("hex");
}
function snap8(v) {
  return Math.round(v / 8) * 8;
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function lit(value) {
  return { expr: { Literal: { Value: value } } };
}
function solid(hex) {
  return { solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } } };
}
function solidPlain(hex) {
  // encoding usado dentro de gradientes / stops (sin "expr" envolvente)
  return { Literal: { Value: `'${hex}'` } };
}

// ---------------------------------------------------------------------------
// geometria: grid de 12x12 -> pixeles. la banda superior (fila 1) tiene una
// altura fija de 80px (para que los slicers en modo Dropdown quepan sin
// recortarse); el resto del contenido (filas 2-13) reparte el espacio
// restante en partes iguales.
// ---------------------------------------------------------------------------

const CANVAS = { width: 1920, height: 1080, margin: 32, gutter: 24 };
const HEADER_BAND_H = 80;
const COLS = 12;
const CONTENT_ROWS = 11; // filas 2..13

const colWidth = (CANVAS.width - 2 * CANVAS.margin) / COLS;
const contentTop = CANVAS.margin + HEADER_BAND_H + CANVAS.gutter;
const contentHeight = CANVAS.height - contentTop - CANVAS.margin;
const contentRowHeight = contentHeight / CONTENT_ROWS;

function colX(c) {
  return CANVAS.margin + (c - 1) * colWidth;
}
function rowY(r) {
  if (r <= 1) return CANVAS.margin;
  if (r === 2) return contentTop;
  return contentTop + (r - 2) * contentRowHeight;
}
function rect(c1, r1, c2, r2) {
  const x = colX(c1);
  const y = rowY(r1);
  const w = colX(c2) - colX(c1) - CANVAS.gutter;
  const h = rowY(r2) - rowY(r1) - CANVAS.gutter;
  return { x: snap8(x), y: snap8(y), width: snap8(w), height: snap8(h) };
}

// ---------------------------------------------------------------------------
// expresiones de campo
// ---------------------------------------------------------------------------

function colExpr(entity, property) {
  return { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } };
}
function measureExpr(entity, property) {
  return { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } };
}
function projCol(entity, property, active) {
  const p = {
    field: colExpr(entity, property),
    queryRef: `${entity}.${property}`,
    nativeQueryRef: property,
  };
  if (active !== undefined) p.active = active;
  return p;
}
function projMeasure(entity, property) {
  return {
    field: measureExpr(entity, property),
    queryRef: `${entity}.${property}`,
    nativeQueryRef: property,
  };
}

// ---------------------------------------------------------------------------
// constructor base de visual
// ---------------------------------------------------------------------------

function baseVisual(name, position, z, tabOrder) {
  return {
    $schema: VC_SCHEMA,
    name,
    position: { x: position.x, y: position.y, z, height: position.height, width: position.width, tabOrder },
  };
}

function hiddenHeaderVCO(extra) {
  return Object.assign(
    {
      visualHeader: [{ properties: { show: lit("false") } }],
    },
    extra || {}
  );
}

// ---------------------------------------------------------------------------
// paginas / visuales acumulados por el script
// ---------------------------------------------------------------------------

const pages = []; // { id, displayName, visuals: [visual...], order }

function newPage(displayName) {
  const p = { id: id20(), displayName, visuals: [] };
  pages.push(p);
  return p;
}

function addVisual(page, visual) {
  page.visuals.push(visual);
  return visual;
}

// ---------------------------------------------------------------------------
// builders de visuales concretos
// ---------------------------------------------------------------------------

let zCounter = 1000;
function nextZ() {
  zCounter += 1;
  return zCounter;
}

function textboxTitle(rectXY, text, opts) {
  opts = opts || {};
  const fontSize = opts.fontSize || "22px";
  const color = opts.color || "#1F2937";
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  v.visual = {
    visualType: "textbox",
    objects: {
      general: [
        {
          properties: {
            paragraphs: [
              {
                textRuns: [
                  {
                    value: text,
                    textStyle: { fontFamily: "Segoe UI Semibold", fontSize, color },
                  },
                ],
                horizontalTextAlignment: "left",
              },
            ].concat(
              opts.subText
                ? [
                    {
                      textRuns: [
                        {
                          value: opts.subText,
                          textStyle: {
                            fontFamily: "Segoe UI",
                            fontSize: opts.subFontSize || "12px",
                            color: opts.subColor || "#6B7280",
                          },
                        },
                      ],
                      horizontalTextAlignment: "left",
                    },
                  ]
                : []
            ),
          },
        },
      ],
    },
    visualContainerObjects: {
      background: [{ properties: { show: lit("false") } }],
      border: [{ properties: { show: lit("false") } }],
      padding: [
        {
          properties: {
            top: lit("4D"),
            bottom: lit("4D"),
            left: lit("0D"),
            right: lit("0D"),
          },
        },
      ],
    },
  };
  return v;
}

/** card de un solo valor, sin semaforo -- acento neutral fijo */
function cardNeutral(rectXY, entity, measure, accentHex, labelText) {
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  v.visual = {
    visualType: "cardVisual",
    query: { queryState: { Data: { projections: [projMeasure(entity, measure)] } } },
    objects: {
      value: [
        {
          properties: { fontSize: lit("28D"), bold: lit("true") },
          selector: { id: "default" },
        },
      ],
      label: [
        {
          properties: { show: lit("true"), text: lit(`'${labelText}'`), fontSize: lit("12D") },
          selector: { id: "default" },
        },
      ],
      accentBar: [
        {
          properties: { show: lit("true"), position: lit("'Left'"), width: lit("4D"), color: solid(accentHex) },
          selector: { id: "default" },
        },
      ],
      outline: [{ properties: { show: lit("false") }, selector: { id: "default" } }],
    },
    visualContainerObjects: hiddenHeaderVCO({
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [
        {
          properties: { top: lit("16D"), bottom: lit("16D"), left: lit("16D"), right: lit("12D") },
        },
      ],
    }),
  };
  return v;
}

/** card de dos valores (numero + etiqueta de estado en texto) con semaforo
 *  dinamico via Conditional.Cases sobre accentBar.color y value.fontColor.
 *  no se sobreescribe el label -- cardVisual aplica el mismo texto de label
 *  a todas las proyecciones del card, asi que forzar un texto fijo duplica
 *  la misma etiqueta en las dos mini-tarjetas. se deja el nombre de medida
 *  por defecto en cada una, que ya es distinto y suficientemente claro. */
function cardSemaphore(rectXY, entity, measure, estadoMeasure, thresholds) {
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  const cond = {
    Conditional: {
      Cases: [
        {
          Condition: {
            Comparison: {
              ComparisonKind: 4, // <=
              Left: measureExpr(entity, measure),
              Right: { Literal: { Value: thresholds.good } },
            },
          },
          Value: { Literal: { Value: `'${thresholds.goodColor}'` } },
        },
        {
          Condition: {
            Comparison: {
              ComparisonKind: 4, // <=
              Left: measureExpr(entity, measure),
              Right: { Literal: { Value: thresholds.warn } },
            },
          },
          Value: { Literal: { Value: `'${thresholds.warnColor}'` } },
        },
      ],
      DefaultValue: { Literal: { Value: `'${thresholds.critColor}'` } },
    },
  };
  v.visual = {
    visualType: "cardVisual",
    query: {
      queryState: {
        Data: { projections: [projMeasure(entity, measure), projMeasure(entity, estadoMeasure)] },
      },
    },
    objects: {
      value: [
        {
          properties: { fontSize: lit("26D"), bold: lit("true"), fontColor: { solid: { color: { expr: cond } } } },
          selector: { id: "default" },
        },
      ],
      label: [
        {
          properties: { show: lit("true"), fontSize: lit("11D") },
          selector: { id: "default" },
        },
      ],
      accentBar: [
        {
          properties: { show: lit("true"), position: lit("'Left'"), width: lit("6D"), color: { solid: { color: { expr: cond } } } },
          selector: { id: "default" },
        },
      ],
      outline: [{ properties: { show: lit("false") }, selector: { id: "default" } }],
      cardCalloutArea: [{ properties: { paddingUniform: lit("6L") } }],
    },
    visualContainerObjects: hiddenHeaderVCO({
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [
        {
          properties: { top: lit("16D"), bottom: lit("16D"), left: lit("16D"), right: lit("12D") },
        },
      ],
    }),
  };
  return v;
}

function cardQuality(rectXY, entity, measure, labelText, colorHex) {
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  v.visual = {
    visualType: "cardVisual",
    query: { queryState: { Data: { projections: [projMeasure(entity, measure)] } } },
    objects: {
      value: [
        { properties: { fontSize: lit("26D"), bold: lit("true"), fontColor: solid(colorHex) }, selector: { id: "default" } },
      ],
      label: [{ properties: { show: lit("true"), text: lit(`'${labelText}'`), fontSize: lit("11D") }, selector: { id: "default" } }],
      accentBar: [
        { properties: { show: lit("true"), position: lit("'Left'"), width: lit("4D"), color: solid(colorHex) }, selector: { id: "default" } },
      ],
      outline: [{ properties: { show: lit("false") }, selector: { id: "default" } }],
    },
    visualContainerObjects: hiddenHeaderVCO({
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [{ properties: { top: lit("16D"), bottom: lit("16D"), left: lit("16D"), right: lit("12D") } }],
    }),
  };
  return v;
}

function lineChartMini(rectXY, categoryEntity, categoryCol, entity, measure, colorHex, title) {
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  v.visual = {
    visualType: "lineChart",
    query: {
      queryState: {
        Category: { projections: [projCol(categoryEntity, categoryCol, true)] },
        Y: { projections: [projMeasure(entity, measure)] },
      },
    },
    objects: {
      categoryAxis: [{ properties: { fontSize: lit("9D"), labelColor: solid("#6B7280") } }],
      valueAxis: [
        {
          properties: {
            fontSize: lit("9D"),
            labelColor: solid("#6B7280"),
            gridlineStyle: lit("'solid'"),
            gridlineColor: solid("#E5E5E5"),
          },
        },
      ],
      lineStyles: [{ properties: { strokeWidth: lit("2D"), lineChartType: lit("'linear'") } }],
      dataPoint: [{ properties: { fill: solid(colorHex) } }],
      legend: [{ properties: { show: lit("false") } }],
    },
    visualContainerObjects: {
      title: [
        {
          properties: {
            show: lit("true"),
            text: lit(`'${title}'`),
            fontSize: lit("11D"),
            fontColor: solid("#374151"),
            alignment: lit("'left'"),
          },
        },
      ],
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [{ properties: { top: lit("8D"), bottom: lit("8D"), left: lit("8D"), right: lit("8D") } }],
    },
  };
  return v;
}

function barChartH(rectXY, categoryEntity, categoryCol, entity, measure, colorHex, title, sortDesc) {
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  v.visual = {
    visualType: "barChart",
    query: {
      queryState: {
        Category: { projections: [projCol(categoryEntity, categoryCol, true)] },
        Y: { projections: [projMeasure(entity, measure)] },
      },
      sortDefinition: {
        sort: [{ field: measureExpr(entity, measure), direction: sortDesc ? "Descending" : "Ascending" }],
        isDefaultSort: true,
      },
    },
    objects: {
      categoryAxis: [{ properties: { fontSize: lit("10D"), labelColor: solid("#374151") } }],
      valueAxis: [
        {
          properties: {
            start: lit("0D"),
            fontSize: lit("9D"),
            labelColor: solid("#6B7280"),
            gridlineStyle: lit("'solid'"),
            gridlineColor: solid("#E5E5E5"),
          },
        },
      ],
      dataPoint: [{ properties: { fill: solid(colorHex) } }],
      labels: [{ properties: { show: lit("false") } }],
      legend: [{ properties: { show: lit("false") } }],
    },
    visualContainerObjects: {
      title: [
        {
          properties: { show: lit("true"), text: lit(`'${title}'`), fontSize: lit("12D"), fontColor: solid("#374151"), alignment: lit("'left'") },
        },
      ],
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [{ properties: { top: lit("8D"), bottom: lit("8D"), left: lit("8D"), right: lit("8D") } }],
    },
  };
  return v;
}

function clusteredBarChartH(rectXY, categoryEntity, categoryCol, ySeries, title) {
  // ySeries: [{entity,measure,color}]
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  const yProjections = ySeries.map((s) => projMeasure(s.entity, s.measure));
  const dataPointEntries = ySeries.map((s) => ({
    properties: { fill: solid(s.color) },
    selector: { metadata: `${s.entity}.${s.measure}` },
  }));
  v.visual = {
    visualType: "clusteredBarChart",
    query: {
      queryState: {
        Category: { projections: [projCol(categoryEntity, categoryCol, true)] },
        Y: { projections: yProjections },
      },
      sortDefinition: {
        sort: [{ field: measureExpr(ySeries[0].entity, ySeries[0].measure), direction: "Descending" }],
        isDefaultSort: true,
      },
    },
    objects: {
      categoryAxis: [{ properties: { fontSize: lit("10D"), labelColor: solid("#374151") } }],
      valueAxis: [
        {
          properties: {
            start: lit("0D"),
            fontSize: lit("9D"),
            labelColor: solid("#6B7280"),
            gridlineStyle: lit("'solid'"),
            gridlineColor: solid("#E5E5E5"),
          },
        },
      ],
      dataPoint: dataPointEntries,
      legend: [{ properties: { show: lit("true"), position: lit("'TopCenter'"), labelColor: solid("#374151") } }],
      layout: [{ properties: { clusteredGapSize: lit("16D") } }],
    },
    visualContainerObjects: {
      title: [
        { properties: { show: lit("true"), text: lit(`'${title}'`), fontSize: lit("12D"), fontColor: solid("#374151"), alignment: lit("'left'") } },
      ],
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [{ properties: { top: lit("8D"), bottom: lit("8D"), left: lit("8D"), right: lit("8D") } }],
    },
  };
  return v;
}

function tableExBuilder(rectXY, columns, title, sortField, sortDesc, filters) {
  // columns: [{entity, property, isMeasure}]
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  const projections = columns.map((c) => (c.isMeasure ? projMeasure(c.entity, c.property) : projCol(c.entity, c.property)));
  v.visual = {
    visualType: "tableEx",
    query: {
      queryState: { Values: { projections } },
      sortDefinition: sortField
        ? {
            sort: [
              {
                field: sortField.isMeasure ? measureExpr(sortField.entity, sortField.property) : colExpr(sortField.entity, sortField.property),
                direction: sortDesc ? "Descending" : "Ascending",
              },
            ],
            isDefaultSort: true,
          }
        : undefined,
    },
    objects: {
      columnHeaders: [
        {
          properties: {
            columnAdjustment: lit("'growToFit'"),
            autoSizeColumnWidth: lit("true"),
            fontColor: solid("#1F2937"),
            backColor: solid("#F3F4F6"),
          },
        },
      ],
      values: [
        {
          properties: {
            fontColorPrimary: solid("#374151"),
            fontColorSecondary: solid("#374151"),
            backColorPrimary: solid("#FFFFFF"),
            backColorSecondary: solid("#F9FAFB"),
          },
        },
      ],
    },
    visualContainerObjects: {
      title: [
        { properties: { show: lit("true"), text: lit(`'${title}'`), fontSize: lit("12D"), fontColor: solid("#374151"), alignment: lit("'left'") } },
      ],
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("8D") } }],
      padding: [{ properties: { top: lit("8D"), bottom: lit("8D"), left: lit("8D"), right: lit("8D") } }],
      stylePreset: [{ properties: { name: lit("'None'") } }],
    },
  };
  if (filters && filters.length) {
    v.filterConfig = { filters };
  }
  return v;
}

function slicerDropdown(rectXY, entity, column, headerText, syncGroupName) {
  const v = baseVisual(id20(), rectXY, nextZ(), nextZ());
  v.visual = {
    visualType: "slicer",
    query: { queryState: { Values: { projections: [projCol(entity, column)] } } },
    objects: {
      data: [{ properties: { mode: lit("'Dropdown'") } }],
      header: [{ properties: { show: lit("true"), text: lit(`'${headerText}'`), fontColor: solid("#1F2937") } }],
      items: [{ properties: { fontColor: solid("#374151") } }],
    },
    visualContainerObjects: {
      background: [{ properties: { show: lit("true"), color: solid("#FFFFFF"), transparency: lit("0D") } }],
      border: [{ properties: { show: lit("true"), color: solid("#E0E0E0"), radius: lit("6D") } }],
      padding: [{ properties: { top: lit("8D"), bottom: lit("8D"), left: lit("8D"), right: lit("8D") } }],
    },
  };
  if (syncGroupName) {
    v.visual.syncGroup = { groupName: syncGroupName, fieldChanges: true, filterChanges: true };
  }
  return v;
}

// ---------------------------------------------------------------------------
// PAGINA 1 -- El backlog del pool crece mas rapido de lo que se libera
// ---------------------------------------------------------------------------

const page1 = newPage("El backlog del pool crece mas rapido de lo que se libera");

// header + filtro (fila 1)
// nota: en esta pagina solo se expone el segmentador de Mes -- es el
// unico que filtra los 8 visuales de forma consistente. Analista y
// Motivo se probaron aqui y se quitaron: los 4 KPI + las 4 lineas de
// tendencia salen de la tabla de snapshot diario (Historial Diario del
// Pool), que no tiene desglose por analista ni motivo (un pedido
// abierto todavia no tiene analista asignado -- no es una limitacion
// de diseno, es un hecho del negocio). Analista y Motivo se quedan en
// la pagina 2, donde el modelo si los soporta por completo.
addVisual(
  page1,
  textboxTitle(rect(1, 1, 9, 2), "El backlog del pool crece mas rapido de lo que se libera", {
    subText: "Datos sinteticos de portafolio -- cierre del dataset: 29/06/2026 (no hay refresh en vivo)",
    fontSize: "20px",
    subFontSize: "11px",
  })
);
{
  const region = rect(9, 1, 13, 2);
  const w = 160;
  addVisual(page1, slicerDropdown({ x: snap8(region.x), y: region.y, width: w, height: 80 }, "Calendario", "Nombre Mes", "Mes", "MesSync"));
}

// kpis (filas 2-4) -- 4 tarjetas
{
  const region = rect(1, 2, 13, 4);
  const gap = 24;
  const cardW = Math.floor((region.width - 3 * gap) / 4);
  const xs = [0, 1, 2, 3].map((i) => snap8(region.x + i * (cardW + gap)));

  addVisual(
    page1,
    cardNeutral(
      { x: xs[0], y: region.y, width: cardW, height: region.height },
      "Historial Diario del Pool",
      "Pedidos en Pool al Cierre",
      "#3B6E91",
      "Pedidos en pool (al cierre de datos)"
    )
  );
  addVisual(
    page1,
    cardSemaphore(
      { x: xs[1], y: region.y, width: cardW, height: region.height },
      "Pedidos",
      "% Pedidos Cancelados",
      "Estado % Pedidos Cancelados",
      { good: "0.15D", warn: "0.25D", goodColor: "#15803D", warnColor: "#B45309", critColor: "#B91C1C" }
    )
  );
  addVisual(
    page1,
    cardNeutral(
      { x: xs[2], y: region.y, width: cardW, height: region.height },
      "Historial Diario del Pool",
      "Pedidos Liberados por Dia (Promedio)",
      "#5B8CAD",
      "Pedidos liberados por dia (promedio del periodo)"
    )
  );
  addVisual(
    page1,
    cardSemaphore(
      { x: xs[3], y: region.y, width: cardW, height: region.height },
      "Historial Diario del Pool",
      "Antiguedad Promedio del Pool (Dias)",
      "Estado Antiguedad Promedio del Pool",
      { good: "10D", warn: "25D", goodColor: "#15803D", warnColor: "#B45309", critColor: "#B91C1C" }
    )
  );
}

// hero (filas 4-8) -- 4 mini lineas sincronizadas en el mismo eje de fechas
{
  const region = rect(1, 4, 13, 8);
  const gap = 24;
  const w = Math.floor((region.width - 3 * gap) / 4);
  const xs = [0, 1, 2, 3].map((i) => snap8(region.x + i * (w + gap)));

  addVisual(
    page1,
    lineChartMini(
      { x: xs[0], y: region.y, width: w, height: region.height },
      "Calendario",
      "Fecha",
      "Historial Diario del Pool",
      "Pedidos en Pool al Cierre",
      "#3B6E91",
      "Backlog: pedidos en pool al cierre"
    )
  );
  addVisual(
    page1,
    lineChartMini(
      { x: xs[1], y: region.y, width: w, height: region.height },
      "Calendario",
      "Fecha",
      "Historial Diario del Pool",
      "Pedidos Nuevos por Dia",
      "#94A3B8",
      "Pedidos nuevos por dia"
    )
  );
  addVisual(
    page1,
    lineChartMini(
      { x: xs[2], y: region.y, width: w, height: region.height },
      "Calendario",
      "Fecha",
      "Historial Diario del Pool",
      "Pedidos Liberados por Dia",
      "#5B8CAD",
      "Pedidos liberados por dia"
    )
  );
  addVisual(
    page1,
    lineChartMini(
      { x: xs[3], y: region.y, width: w, height: region.height },
      "Calendario",
      "Fecha",
      "Historial Diario del Pool",
      "Pedidos Cancelados por Dia",
      "#C8742A",
      "Pedidos cancelados por dia"
    )
  );
}

// detalle (filas 8-13): motivo de bloqueo (izq) + pedidos mas antiguos (der)
{
  const bl = rect(1, 8, 7, 13);
  const br = rect(7, 8, 13, 13);

  addVisual(
    page1,
    barChartH(bl, "Motivo de Bloqueo", "Motivo de Bloqueo", "Pedidos", "Pedidos en Pool", "#3B6E91", "Motivo de bloqueo mas frecuente en el pool", true)
  );

  const enPoolFilter = {
    name: filterId(),
    field: colExpr("Pedidos", "Indicador En Pool"),
    type: "Advanced",
    filter: {
      Version: 2,
      From: [{ Name: "p", Entity: "Pedidos", Type: 0 }],
      Where: [
        {
          Condition: {
            Comparison: {
              ComparisonKind: 0,
              Left: { Column: { Expression: { SourceRef: { Source: "p" } }, Property: "Indicador En Pool" } },
              Right: { Literal: { Value: "true" } },
            },
          },
        },
      ],
    },
    howCreated: "User",
  };

  // nota: se probaron 3 variantes de esta tabla incluyendo la medida
  // "Dias en Pool al Cierre de Datos" (que hace CALCULATE(MAX(...),
  // REMOVEFILTERS('Calendario')) puertas adentro) como columna -- con
  // filtro, sin filtro, ordenando por la medida y ordenando por otra
  // columna. Las 3 fallaron igual en Desktop con un error generico de
  // "capacidad o licencia". La medida era la unica constante en las 3,
  // asi que se saco de esta tabla -- se usa la columna de fecha de
  // creacion en su lugar, que logra el mismo propósito (mas viejo
  // primero) sin el problema.
  addVisual(
    page1,
    tableExBuilder(
      br,
      [
        { entity: "Pedidos", property: "Pedido" },
        { entity: "Cliente", property: "Cliente" },
        { entity: "Motivo de Bloqueo", property: "Motivo de Bloqueo" },
        { entity: "Pedidos", property: "Fecha de Creacion" },
      ],
      "Pedidos abiertos mas antiguos (los que mas tiempo llevan en el pool)",
      { entity: "Pedidos", property: "Fecha de Creacion" },
      false,
      [enPoolFilter]
    )
  );
}

// ---------------------------------------------------------------------------
// PAGINA 2 -- Desempeno de analistas y antiguedad de los pedidos abiertos
// ---------------------------------------------------------------------------

const page2 = newPage("Desempeno de analistas y antiguedad de los pedidos abiertos");

// header + filtros (fila 1)
addVisual(page2, textboxTitle(rect(1, 1, 9, 2), "Desempeno de analistas y antiguedad de los pedidos abiertos", { fontSize: "22px" }));
{
  const region = rect(9, 1, 13, 2);
  const w = 160;
  const gap = 16;
  const x1 = region.x;
  const x2 = x1 + w + gap;
  const x3 = x2 + w + gap;
  addVisual(page2, slicerDropdown({ x: snap8(x1), y: region.y, width: w, height: 80 }, "Analista", "Nombre del Analista", "Analista", "AnalistaSync"));
  addVisual(page2, slicerDropdown({ x: snap8(x2), y: region.y, width: w, height: 80 }, "Motivo de Bloqueo", "Motivo de Bloqueo", "Motivo de bloqueo", "MotivoSync"));
  addVisual(page2, slicerDropdown({ x: snap8(x3), y: region.y, width: w, height: 80 }, "Calendario", "Nombre Mes", "Mes", "MesSync"));
}

// hero (filas 2-6)
addVisual(
  page2,
  barChartH(
    rect(1, 2, 13, 6),
    "Analista",
    "Nombre del Analista",
    "Pedidos",
    "Pedidos Liberados",
    "#5B8CAD",
    "Pedidos liberados por analista",
    true
  )
);

// soporte (filas 6-9): 3 paneles
{
  const supp1 = rect(1, 6, 5, 9);
  const supp2 = rect(5, 6, 9, 9);
  const supp3 = rect(9, 6, 13, 9);

  addVisual(
    page2,
    barChartH(
      supp1,
      "Analista",
      "Nombre del Analista",
      "Pedidos",
      "Tiempo Promedio de Liberacion (Horas)",
      "#5B8CAD",
      "Tiempo promedio de liberacion por analista (horas)",
      false
    )
  );

  addVisual(
    page2,
    clusteredBarChartH(
      supp2,
      "Motivo de Bloqueo",
      "Motivo de Bloqueo",
      [
        { entity: "Pedidos", measure: "Tiempo Promedio de Liberacion (Horas)", color: "#5B8CAD" },
        { entity: "Pedidos", measure: "Tiempo Promedio de Cancelacion (Horas)", color: "#C8742A" },
      ],
      "Tiempo promedio por motivo de bloqueo (horas)"
    )
  );

  // supp3: 2 cards de calidad de dato, lado a lado
  const gap = 16;
  const cw = Math.floor((supp3.width - gap) / 2);
  addVisual(
    page2,
    cardQuality(
      { x: supp3.x, y: supp3.y, width: cw, height: supp3.height },
      "Pedidos",
      "% Pedidos con Estatus Reconstruido",
      "% con estatus reconstruido (limpieza en Silver)",
      "#64748B"
    )
  );
  addVisual(
    page2,
    cardQuality(
      { x: snap8(supp3.x + cw + gap), y: supp3.y, width: cw, height: supp3.height },
      "Pedidos",
      "% Pedidos con Usuario No Catalogado",
      "% con usuario no catalogado",
      "#64748B"
    )
  );
}

// detalle (filas 9-13)
addVisual(
  page2,
  tableExBuilder(
    rect(1, 9, 13, 13),
    [
      { entity: "Analista", property: "Nombre del Analista" },
      { entity: "Pedidos", property: "Pedidos Liberados", isMeasure: true },
      { entity: "Pedidos", property: "Tiempo Promedio de Liberacion (Horas)", isMeasure: true },
      { entity: "Pedidos", property: "Valor Liberado en el Periodo", isMeasure: true },
    ],
    "Detalle completo por analista",
    { entity: "Pedidos", property: "Pedidos Liberados", isMeasure: true },
    true
  )
);

// ---------------------------------------------------------------------------
// escritura a disco: paginas + visuales
// ---------------------------------------------------------------------------

ensureDir(PAGES_DIR);

for (const page of pages) {
  const pageDir = path.join(PAGES_DIR, page.id);
  const visualsDir = path.join(pageDir, "visuals");
  ensureDir(visualsDir);

  writeJson(path.join(pageDir, "page.json"), {
    $schema: PAGE_SCHEMA,
    name: page.id,
    displayName: page.displayName,
    displayOption: "FitToPage",
    height: CANVAS.height,
    width: CANVAS.width,
    objects: {
      background: [{ properties: { color: solid("#FAFAFA"), transparency: lit("0D") } }],
      outspace: [{ properties: { color: solid("#EDEDED"), transparency: lit("0D") } }],
    },
  });

  for (const visual of page.visuals) {
    const visualDir = path.join(visualsDir, visual.name);
    writeJson(path.join(visualDir, "visual.json"), visual);
  }
}

writeJson(path.join(PAGES_DIR, "pages.json"), {
  $schema: PAGES_SCHEMA,
  pageOrder: pages.map((p) => p.id),
  activePageName: pages[0].id,
});

// ---------------------------------------------------------------------------
// theme.json -- Analyst Workbench (claro, denso, serio)
// ---------------------------------------------------------------------------

const THEME_NAME = "AnalystWorkbench-7f2c19e4";
const themeJson = {
  name: `${THEME_NAME}.json`,
  dataColors: [
    "#3B6E91",
    "#C8742A",
    "#5B8CAD",
    "#94A3B8",
    "#64748B",
    "#2C5578",
    "#15803D",
    "#B91C1C",
    "#B45309",
    "#A8763E",
  ],
  good: "#15803D",
  neutral: "#B45309",
  bad: "#B91C1C",
  maximum: "#3B6E91",
  center: "#94A3B8",
  minimum: "#F3F4F6",
  null: "#E5E5E5",
  foreground: "#1F2937",
  background: "#FAFAFA",
  tableAccent: "#3B6E91",
  firstLevelElements: "#1F2937",
  secondLevelElements: "#6B7280",
  thirdLevelElements: "#E5E5E5",
  fourthLevelElements: "#94A3B8",
  secondaryBackground: "#FFFFFF",
  textClasses: {
    label: { fontFace: "Segoe UI", fontSize: 10, color: "#374151" },
    title: { fontFace: "Segoe UI Semibold", fontSize: 12, color: "#1F2937" },
    header: { fontFace: "Segoe UI Semibold", fontSize: 12, color: "#1F2937" },
    callout: { fontFace: "Segoe UI Semibold", fontSize: 28, color: "#1F2937" },
  },
  visualStyles: {
    "*": {
      "*": {
        title: [
          { show: true, fontFamily: "Segoe UI Semibold", fontSize: 12, fontColor: { solid: { color: "#1F2937" } } },
        ],
        background: [{ show: true, color: { solid: { color: "#FFFFFF" } }, transparency: 0 }],
        border: [{ show: true, color: { solid: { color: "#E0E0E0" } }, radius: 8, width: 1 }],
        visualHeader: [{ show: false }],
        padding: [{ top: 8, bottom: 8, left: 8, right: 8 }],
      },
    },
    tableEx: {
      "*": {
        columnHeaders: [{ autoSizeColumnWidth: true, columnAdjustment: "growToFit" }],
      },
    },
    pivotTable: {
      "*": {
        columnHeaders: [{ autoSizeColumnWidth: true, columnAdjustment: "growToFit" }],
      },
    },
    slicer: {
      "*": {
        header: [{ fontFamily: "Segoe UI Semibold", textSize: 10, fontColor: { solid: { color: "#1F2937" } } }],
        items: [{ fontFamily: "Segoe UI", textSize: 9, fontColor: { solid: { color: "#374151" } }, padding: 2 }],
      },
    },
    cardVisual: {
      "*": {
        value: [{ bold: true, $id: "default" }],
        label: [{ show: true, $id: "default" }],
        cardCalloutArea: [{ paddingUniform: 0 }],
        spacing: [{ verticalSpacing: 2, $id: "default" }],
      },
    },
  },
};

writeJson(path.join(STATIC_DIR, `${THEME_NAME}.json`), themeJson);

// ---------------------------------------------------------------------------
// scaffolding: .platform, definition.pbir, version.json, report.json, .pbip
// ---------------------------------------------------------------------------

writeJson(path.join(REPORT_DIR, ".platform"), {
  $schema: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
  metadata: { type: "Report", displayName: "PoolCredito" },
  config: { version: "2.0", logicalId: crypto.randomUUID() },
});

writeJson(path.join(REPORT_DIR, "definition.pbir"), {
  $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
  version: "4.0",
  datasetReference: { byPath: { path: "../PoolCredito.SemanticModel" } },
});

writeJson(path.join(DEF_DIR, "version.json"), { $schema: VERSION_SCHEMA, version: "2.0.0" });

writeJson(path.join(DEF_DIR, "report.json"), {
  $schema: REPORT_SCHEMA,
  themeCollection: {
    customTheme: {
      name: `${THEME_NAME}.json`,
      reportVersionAtImport: { visual: "2.6.0", report: "3.0.0", page: "2.1.0" },
      type: "RegisteredResources",
    },
  },
  resourcePackages: [
    {
      name: "RegisteredResources",
      type: "RegisteredResources",
      items: [{ name: `${THEME_NAME}.json`, path: `${THEME_NAME}.json`, type: "CustomTheme" }],
    },
  ],
  settings: { useStylableVisualContainerHeader: true },
});

writeJson(path.join(ROOT, "PoolCredito.pbip"), {
  $schema: "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
  version: "1.0",
  artifacts: [{ report: { path: "PoolCredito.Report" } }],
  settings: { enableAutoRecovery: true },
});

console.log(`Reporte generado: ${pages.length} paginas, ${pages.reduce((n, p) => n + p.visuals.length, 0)} visuales.`);
for (const p of pages) console.log(`  - ${p.displayName} (${p.id}): ${p.visuals.length} visuales`);
