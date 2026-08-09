---
name: Grupo 3 schema decisions
description: Decisiones de diseño del esquema de DB y flujos para Créditos, Nos Debe e Historial de Precios
---

## Tablas afectadas

- `creditosTable`: añadidos `tipo` ('credito'|'nosdebe') y `concepto` (nullable, obligatorio para tipo='credito')
- `creditoLineasTable`: añadido `precioCompra` (guarda precio al momento del crédito, inmutable)
- `abonosCreditosTable`: nueva; registra historial de pagos por crédito (fecha, valorTotal, notas)
- `historialPreciosTable`: nueva; registra precios cada vez que llega una compra

## Flujo abono → ventas_diarias

- Pago **completo** de un producto: fila tipo `'venta'` con nombre real + precios originales del crédito. Referencia = `concepto + nombreAbreviado`.
- Pago **parcial**: fila tipo `'credito'` con `productoNombre = "Abono A: [producto]"`. Referencia = concepto.
- `abreviarNombre()` convierte "OTONIEL GARCIA LOPEZ" → "OTONIEL G. L."

## Separación Créditos / Nos Debe

- Misma tabla `creditosTable` filtrada por `tipo`.
- GET /creditos acepta query param `?tipo=credito|nosdebe`.
- Frontend: página `/creditos` filtra `tipo=credito`, página `/nos-debe` filtra `tipo=nosdebe`.
- `concepto` es obligatorio SOLO para `tipo='credito'`; para `nosdebe` es null.

## Historial de Precios

- Se registra SIEMPRE que llega una compra (aunque no cambie precio), con flag `actualizoPrecioInventario`.
- Popup en compras.tsx SOLO si usuario modificó los precios respecto al inventario actual.
- Popup permite decidir si actualizar inventario o solo registrar.

**Why:** permite auditar evolución de precios aunque el usuario decida no actualizar el inventario.
