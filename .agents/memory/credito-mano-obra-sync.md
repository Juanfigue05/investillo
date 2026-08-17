---
name: Mano de obra vinculada a créditos
description: Invariante contable de la mano de obra de Créditos/Nos Debe
---
**Invariante:** la mano de obra de un crédito/Nos Debe, sus distribuciones y el `totalGanado` de los trabajadores deben cambiar solo juntos y en una transacción, vía el API de créditos. Los registros de mano de obra vinculados a un crédito son inmutables por el API genérico de mano de obra.

**Why:** flujos separados (frontend creando mano de obra aparte, o edición directa del registro vinculado) dejan pagos de trabajadores huérfanos o duplicados al editar/eliminar el crédito.

**How to apply:** cualquier feature que toque mano de obra de créditos pasa por el campo `manoObra` del API de créditos; nunca crear/editar registros de mano de obra vinculados por otra vía.
