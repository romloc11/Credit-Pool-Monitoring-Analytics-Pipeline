# Business Logic

## Pool Entry Reasons

- Bloqueo SAP
- Saldo vencido
- Límite excedido

## Status Logic

- Retenido when estatus = 0
- Otherwise mapped from estatus_pool

## Indicators

- indicador_liberado → order released
- indicador_cancelado → order canceled
- indicador_en_pool → still pending

## Time Metrics

- minutos_liberacion
- minutos_cancelacion
