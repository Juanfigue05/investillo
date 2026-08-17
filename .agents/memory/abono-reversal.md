---
name: Abono reversal linkage
description: Cómo están enlazados los abonos de créditos con ventas_diarias para poder revertirlos.
---

## La regla

`abonosCreditosTable.lineaDetalle` (text, JSON) y `ventasDiariasTable.creditoAbonoId` (integer, nullable) son los dos campos que permiten revertir exactamente un abono.

**Why:** Al registrar un abono se crean filas en ventas_diarias. Para poder eliminar o editar ese abono (y revertir sus efectos en ventas), necesitamos saber qué filas creó. `lineaDetalle` guarda `[{lineaId, valor}]` para revertir el `valorAbonado` de cada línea; `creditoAbonoId` en ventas_diarias apunta al abono para poder borrar esas filas con un DELETE WHERE.

**How to apply:**
- POST /creditos/:id/abono: insertar abonosCreditosTable con `.returning()`, usar el id resultante para setear `creditoAbonoId` en cada fila de ventasDiariasTable.
- DELETE /creditos/:id/abono/:abonoId: usar `revertirAbono()` helper (en creditos.ts) que parsea `lineaDetalle`, revierte `valorAbonado` en líneas y crédito, borra filas de ventas por `creditoAbonoId`.
- PUT /creditos/:id/abono/:abonoId: llama a `revertirAbono()` + re-aplica el nuevo abono en la misma transacción.
