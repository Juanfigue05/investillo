---
name: Rebuild de Ventas al editar/eliminar pagos
description: Por qué editar/eliminar un abono debe reconstruir TODAS las filas de Ventas del crédito, no solo las suyas.
---
La regla: al editar o eliminar cualquier abono de un crédito/Nos Debe, hay que reconstruir todas las filas de ventas_diarias de todos los abonos del crédito en orden cronológico (replay de lineaDetalle), no solo borrar/recrear las del abono tocado.

**Why:** el estado "pago completo" de un abono depende de los abonos anteriores; cambiar uno puede convertir la fila "venta" de otro abono en parcial (o viceversa). Un enfoque incremental deja Ventas sobreestimada (fila venta de $100 aunque la línea ya no esté saldada). Fue rechazado en code review por esto.

**How to apply:** helper de rebuild en la ruta de créditos; solo abonos con lineaDetalle son reconstruibles; punto de partida por línea = valorAbonado − suma de detalles (cubre abono inicial). MO saldada → fila tipoLinea "manoobra" con trabajadores; nunca "venta".
