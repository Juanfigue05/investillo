# Inventario de referencias para sincronización

Este inventario describe los eventos con `origen: "local"` emitidos por las
rutas del API. Los endpoints con `:id` describen segmentos numéricos ya
interpolados al guardar el evento. Los literales `{id}` y `{...Id}` son
marcadores guardados en el endpoint; los valores padre se resuelven mediante
`referenciasEndpoint` y los marcadores de fila mediante `entidad_id`.

## Emisores locales

- `clientes.ts`
  - `cliente`: POST `/clientes`, sin ID en la ruta; PUT y DELETE
    `/clientes/${id}`, con `entidad_id` igual al segmento.
  - `vehiculo`: POST `/clientes/{clienteId}/vehiculos`; PUT y DELETE
    `/clientes/{clienteId}/vehiculos/{id}`. El marcador del cliente se mapea
    en `referenciasEndpoint`; para editar o borrar, `{id}` es el ID del
    vehículo y coincide con `entidad_id`. No se hallaron IDs foráneos en el
    cuerpo de estas operaciones.
- `creditos.ts`
  - `creditos_orden`: PUT `/creditos/reordenar`; no tiene ID de fila en la
    ruta y `entidad_id` es el `operationId`.
  - `credito`: POST `/creditos`, sin ID en la ruta; PUT y DELETE
    `/creditos/${id}`, con `entidad_id` igual al ID del crédito.
  - `abono_credito`: POST `/creditos/{creditoId}/abono`; DELETE y PUT
    `/creditos/{creditoId}/abono/{id}`. El crédito padre usa
    `referenciasEndpoint`; `{id}` identifica el abono y coincide con
    `entidad_id`.
- `ventas.ts`
  - `venta`: POST `/ventas`, sin ID en la ruta; PUT y DELETE
    `/ventas/${id}`, con `entidad_id` igual al ID de la venta.
  - `venta`: POST `/ventas/lote-pago-antiguo` y POST `/ventas/manoobra`, sin
    ID de fila en la ruta; `entidad_id` es el `operationId` en el lote y el
    ID de la venta creada en mano de obra.
  - `ventas_orden`: PUT `/ventas/reordenar`; `entidad_id` es el `operationId`.
  - `producto`: POST `/ventas/${id}/trasladar`; el segmento y `entidad_id`
    identifican el producto trasladado, no una venta.
- `compras.ts`
  - `compra`: POST `/compras`; PUT y DELETE `/compras/${id}`; PATCH
    `/compras/${id}/corregir`. En los métodos con segmento, `entidad_id`
    coincide con el ID de la compra. POST `/compras/lote-llegada` usa la
    entidad `compra_lote`, no tiene ID de fila en la ruta y usa
    `operationId` como `entidad_id`.
- `inventario.ts`
  - `producto`: POST `/inventario`, sin ID en la ruta; PUT
    `/inventario/${id}`, PUT `/inventario/${id}/stock`, DELETE
    `/inventario/${id}` y PUT `/inventario/${id}/reactivar`. Los segmentos
    numéricos y `entidad_id` corresponden al producto.
- `trabajadores.ts`
  - `trabajador`: POST `/trabajadores`; PUT `/trabajadores/${id}`. En PUT,
    `entidad_id` coincide con el segmento.
  - `pago_seguro`: POST `/trabajadores/{trabajadorId}/pagos-seguro` y DELETE
    `/trabajadores/{trabajadorId}/pagos-seguro/{id}`. El trabajador padre
    se resuelve mediante `referenciasEndpoint`; el marcador final de DELETE
    es el pago y coincide con `entidad_id`.
- `manoobra.ts`
  - `mano_obra`: POST `/manoobra`; PUT y DELETE `/manoobra/${id}`. PUT y
    DELETE tienen `entidad_id` igual al segmento.
- `descuentos-inventario.ts`
  - `descuento_inventario`: POST `/descuentos-inventario`, sin ID en la ruta
    y con `operationId` como `entidad_id`; PUT y DELETE
    `/descuentos-inventario/${id}`, con ID coincidente.
- `grupos-trabajo.ts`
  - `grupo_trabajo`: POST `/grupos-trabajo`; PATCH
    `/grupos-trabajo/${id}/desactivar`. En PATCH, `entidad_id` coincide con
    el segmento.
- `cierre-diario.ts`
  - `cierre_diario`: POST `/cierre-diario` para crear o actualizar un cierre,
    con el ID del cierre como `entidad_id` aunque no esté en la ruta; DELETE
    `/cierre-diario/${id}`, con ID coincidente.
- `calculadora-cierre.ts`
  - `calculadora_cierre`: PUT y DELETE `/calculadora-cierre`; entidad
    singleton con `entidad_id: "1"` y sin ID en la ruta.
- `conteo-monedas.ts`
  - `conteo_monedas`: PUT `/conteo-monedas`; entidad singleton con
    `entidad_id: "1"` y sin ID en la ruta.
- `historial.ts`
  - `historial`: POST `/historial`; PUT y DELETE `/historial/${id}`. En
    edición y borrado, `entidad_id` coincide con el segmento.
- `historial-precios.ts`
  - `historial_precios`: DELETE `/historial-precios/producto/${productoId}`
    y DELETE `/historial-precios/${id}`. El primer endpoint usa el ID del
    producto asociado como `entidad_id`, no el ID de una fila de historial;
    el segundo sí usa el ID de la fila.
- `notas.ts`
  - `nota`: PUT `/notas`; no incluye ID en la ruta y `entidad_id` es el ID
    de la fila guardada.
- `remachadas.ts`
  - `remachada`: POST `/remachadas`; PUT y DELETE `/remachadas/${id}`. En
    edición y borrado, `entidad_id` coincide con el segmento.
- `obra-electronica.ts`
  - `obra_electronica`: POST `/obra-electronica`; PUT y DELETE
    `/obra-electronica/${id}`. En edición y borrado, `entidad_id` coincide
    con el segmento.
- `tensionadas.ts`
  - `tensionada`: POST `/tensionadas`; PATCH y DELETE
    `/tensionadas/${id}`. En PATCH y DELETE, `entidad_id` coincide con el
    segmento.
- `reportes.ts`
  - `cierre_diario`: PATCH `/reportes/nomina/dia`; endpoint singleton sin ID,
    con `entidad_id` igual al ID del cierre actualizado.
- `clientes-import.ts`
  - `clientes_import`: POST `/clientes-import/sincronizar` para importar y
    resolver; sin ID de fila en la ruta y con `operationId` como
    `entidad_id`.
- `inventario-import.ts`
  - `inventario_import`: POST `/inventario-import/sincronizar` para importar,
    confirmar productos nuevos y resolver; POST
    `/inventario-import/resolver-cantidades`; POST
    `/inventario-import/aplicar-completo`. Todas son rutas sin ID de fila y
    usan `operationId` como `entidad_id`.

## IDs de otros registros en el payload

Las rutas no enumeradas aquí no mostraron IDs foráneos en el payload de sus
eventos locales; las referencias de entidades padre que aparecen en la ruta
se guardan en `referenciasEndpoint`.

- POST `/ventas` y POST `/compras`: `productoId` → `producto`.
- POST `/ventas/lote-pago-antiguo`: `items[].productoId` → `producto`.
- POST `/ventas/manoobra`, PUT `/ventas/:id` cuando incluye distribuciones,
  y POST/PUT `/manoobra`: `distribuciones[].trabajadorId` → `trabajador`.
- POST/PUT `/creditos`: `lineas[].productoId` → `producto`;
  `manoObra.trabajadores[].id` → `trabajador`. En PUT,
  `lineas[].id` identifica una línea existente → `credito_linea`.
- POST/PUT `/creditos/:creditoId/abono/:id` (POST sin el segmento final):
  `lineas[].lineaId` → `credito_linea`. DELETE envía `{}`; el crédito padre
  se referencia en `referenciasEndpoint`.
- POST `/compras/lote-llegada`: `items[].id` → `compra`.
- POST `/descuentos-inventario`: `items[].productoId` → `producto`.
- PUT `/ventas/reordenar` y PUT `/creditos/reordenar`: `ids[]` → `venta` o
  `credito`, respectivamente.
- POST `/grupos-trabajo`: `trabajadorIds[]` → `trabajador`.
- POST `/obra-electronica` y PATCH `/reportes/nomina/dia`:
  `trabajadorId` → `trabajador`.
- POST `/cierre-diario`: `datos[].trabajadorId` o
  `datos.trabajadores[].trabajadorId` → `trabajador`.
- Los payloads de importación representan productos por `codigo` y clientes
  por sus datos en el orden de entrada. Las respuestas de las rutas que crean
  o actualizan esas filas incluyen sus IDs para registrar las equivalencias.

## Respuestas de POST y IDs anidados

- Una creación individual normalmente devuelve un objeto con `id`: clientes,
  vehículos, créditos, abonos (incluido `_syncNuevoAbonoId`), ventas, ventas
  de mano de obra, traslados de producto, compras, productos, trabajadores,
  pagos de seguro, mano de obra, grupos, cierres, historial, remachadas,
  obra electrónica y tensionadas.
- Las operaciones por lote de ventas, compras y descuentos devuelven
  colecciones con IDs de filas creadas. Las respuestas de importación
  conservan sus conteos, estado y datos de conflicto, y agregan los IDs de las
  filas afectadas en `_syncProductos` o `_syncClientes` cuando corresponde.
- Las respuestas de clientes incluyen IDs de vehículos. Las respuestas de
  mano de obra incluyen IDs de distribuciones y trabajadores. Los mapeadores
  de créditos incluyen IDs de líneas, mano de obra y abonos.
- `referenciasRespuesta` registra las filas secundarias que se pueden volver
  a identificar mediante una ruta:
  - POST `/clientes` → `vehiculos.{index}.id` (`vehiculo`).
  - POST `/ventas/manoobra` → `_syncManoObraId` (`mano_obra`).
  - POST `/ventas/lote-pago-antiguo` → `{index}.id` (`venta`).
  - POST `/descuentos-inventario` → `{index}.id` (`descuento_inventario`).
  - PUT `/compras/:id` y POST `/compras/lote-llegada` → el ID de cada fila
    `historial_precios` en `_syncHistorialPrecioId`.
  - POST/PUT `/creditos` → líneas nuevas en `lineas.{index}.id`
    (`credito_linea`), mano de obra en `_syncManoObraId` cuando existe y
    filas de ventas generadas en `_syncVentasGeneradas.{index}.id` (`venta`).
  - POST/PUT `/creditos/:id/abono` → filas de ventas generadas en
    `_syncVentasGeneradas.{index}.id` (`venta`). POST `/creditos` mantiene
    además `_syncNuevoAbonoId` para el abono inicial.
  - POST `/inventario-import`, `/inventario-import/sincronizar`,
    `/inventario-import/confirmar-nuevos`, `/inventario-import/resolver`,
    `/inventario-import/resolver-cantidades` y
    `/inventario-import/aplicar-completo` → productos afectados en
    `_syncProductos.{index}.id` (`producto`). Los IDs se correlacionan en el
    orden de las filas afectadas; si un producto ya existe en el destino, se
    actualiza por `codigo` y se devuelve su ID existente, sin duplicarlo. Si
    un código no devuelve fila en un lado, se conserva su posición con `null`;
    esa posición no crea equivalencia y la sincronización emite una advertencia
    sin bloquear el cursor.
  - POST `/clientes-import`, `/clientes-import/sincronizar` y
    `/clientes-import/resolver-telefonos` → clientes insertados en
    `_syncClientes.{index}.id` (`cliente`). Se insertan en una transacción,
    fila por fila, para garantizar que el orden de IDs coincida con el orden
    del payload. En clientes no hay clave natural para correlacionar filas.
- Las respuestas conservan sus campos previos. Los IDs que antes no estaban
  disponibles para una correlación de sincronización se exponen como campos
  adicionales con prefijo `_sync`.
- Al crear un crédito con abono inicial, `id` identifica el crédito y
  `_syncNuevoAbonoId` identifica el abono. La sincronización elige el ID
  principal según la entidad del evento (`credito` o `abono_credito`); no debe
  tratar el ID del abono como el del crédito. Las pruebas cubren subida y
  descarga con IDs distintos y la traducción inversa entre ambos lados.
- La captura remota de peticiones multipart no reemplaza el payload ni las
  referencias que guardó la ruta de importación con el mismo `operationId`.
  Si falla el registro adicional de una captura, el error queda en el log y
  no se propaga a la respuesta de la petición.

## Filas secundarias revisadas

| Ruta que las crea | Tabla y respuesta | ¿Otro endpoint puede nombrar la fila? |
|---|---|---|
| POST `/clientes` con `vehiculos` | `vehiculos_cliente`; la respuesta ya incluye `vehiculos[].id`. | Sí: PUT/DELETE `/clientes/:clienteId/vehiculos/:id`. |
| POST `/ventas/manoobra` | `mano_obra`; la respuesta anterior solo devolvía la venta. Se agrega `_syncManoObraId`. | Sí: PUT/DELETE `/manoobra/:id`. |
| POST `/ventas/lote-pago-antiguo` | Varias `ventas_diarias`; la respuesta ya es un arreglo de ventas con `id`. | Sí: PUT/DELETE `/ventas/:id`. Cada elemento queda asociado por su índice. |
| POST `/creditos` | `credito_lineas` y el abono inicial ya incluyen sus IDs; se registran como `lineas.{index}.id` y `_syncNuevoAbonoId`. La mano de obra vinculada se expone como `_syncManoObraId`. Las ventas de los abonos se exponen en `_syncVentasGeneradas`. | Sí: PUT/DELETE `/creditos/:id` para líneas; PUT/DELETE `/creditos/:id/abono/:id` para abonos; PUT/DELETE `/ventas/:id` para ventas. La ruta directa `/manoobra/:id` rechaza la edición de mano de obra perteneciente a un crédito, pero se mapea para conservar la identidad. |
| POST `/creditos/:id/abono` | Abono con ID en `_syncNuevoAbonoId`; puede crear varias `ventas_diarias`, ahora expuestas en `_syncVentasGeneradas`. | Sí: PUT/DELETE `/creditos/:id/abono/:id` y PUT/DELETE `/ventas/:id`. |
| PUT `/creditos/:id` y PUT `/creditos/:id/abono/:id` | La reconstrucción de abonos elimina y vuelve a crear filas `ventas_diarias`; los IDs nuevos se devuelven en `_syncVentasGeneradas`. | Sí: PUT/DELETE `/ventas/:id`. |
| PUT `/compras/:id` y POST `/compras/lote-llegada` | Cada llegada puede crear una `historial_precios`; se agrega `_syncHistorialPrecioId` a la respuesta o al resultado del lote. | Sí: DELETE `/historial-precios/:id`. |
| POST `/descuentos-inventario` | Varias `descuentos_inventario`; la respuesta ya incluye el ID de cada elemento. | Sí: PUT/DELETE `/descuentos-inventario/:id`. |

Las rutas de importación crean o actualizan las entidades principales de sus
lotes (`clientes` o `productos`) y ahora publican IDs para mantener su
equivalencia. Los borradores del cierre diario son filas temporales de otra
tabla sin ID usado por los endpoints de sincronización. Las distribuciones de
mano de obra se dejan fuera porque son filas dependientes sin endpoint que
acepte su ID.

## Dudas y casos raros

- Las importaciones de clientes y las operaciones de inventario que se
  reproducen mediante `/clientes-import/sincronizar` o
  `/inventario-import/sincronizar` guardan sus IDs de respuesta en
  `referenciasRespuesta`; la resolución de cantidades y la aplicación
  completa de inventario conservan sus propios endpoints.
- `/cierre-diario` es POST pero puede actualizar un cierre existente o
  crear uno nuevo (`cierre-diario.ts:149–157`).
- El borrado de un abono emite `entidad: "abono_credito"` y el ID del abono,
  pero la operación idempotente asociada se registra como tipo `credito`
  con el ID del crédito (`creditos.ts:945–946`).
- El payload de cierre acepta dos formas para trabajadores; su tipo de
  entrada es `unknown`, por lo que no está claro si hay otras formas
  admitidas (`cierre-diario.ts:65,76–85`).

## Manifiesto de cobertura de emisores

Cada par método-endpoint de este bloque debe tener una regla en
`scripts/src/lib/referencias-payload.ts`. Los marcadores `:id` y `:parametro`
representan segmentos completos.

<!-- sync-emitters:start -->
POST /clientes
PUT /clientes/:id
DELETE /clientes/:id
POST /clientes/:clienteId/vehiculos
PUT /clientes/:clienteId/vehiculos/:id
DELETE /clientes/:clienteId/vehiculos/:id
POST /creditos
PUT /creditos/:id
DELETE /creditos/:id
PUT /creditos/reordenar
POST /creditos/:creditoId/abono
PUT /creditos/:creditoId/abono/:id
DELETE /creditos/:creditoId/abono/:id
POST /ventas
PUT /ventas/:id
DELETE /ventas/:id
POST /ventas/lote-pago-antiguo
POST /ventas/manoobra
PUT /ventas/reordenar
POST /ventas/:id/trasladar
POST /compras
PUT /compras/:id
DELETE /compras/:id
PATCH /compras/:id/corregir
POST /compras/lote-llegada
POST /inventario
PUT /inventario/:id
PUT /inventario/:id/stock
PUT /inventario/:id/reactivar
DELETE /inventario/:id
POST /trabajadores
PUT /trabajadores/:id
POST /trabajadores/:trabajadorId/pagos-seguro
DELETE /trabajadores/:trabajadorId/pagos-seguro/:id
POST /manoobra
PUT /manoobra/:id
DELETE /manoobra/:id
POST /descuentos-inventario
PUT /descuentos-inventario/:id
DELETE /descuentos-inventario/:id
POST /grupos-trabajo
PATCH /grupos-trabajo/:id/desactivar
POST /obra-electronica
PUT /obra-electronica/:id
DELETE /obra-electronica/:id
POST /remachadas
PUT /remachadas/:id
DELETE /remachadas/:id
POST /tensionadas
PATCH /tensionadas/:id
DELETE /tensionadas/:id
POST /historial
PUT /historial/:id
DELETE /historial/:id
DELETE /historial-precios/producto/:productoId
DELETE /historial-precios/:id
PUT /notas
POST /cierre-diario
DELETE /cierre-diario/:id
PUT /calculadora-cierre
DELETE /calculadora-cierre
PUT /conteo-monedas
PATCH /reportes/nomina/dia
POST /clientes-import/sincronizar
POST /inventario-import/sincronizar
POST /inventario-import/resolver-cantidades
POST /inventario-import/aplicar-completo
<!-- sync-emitters:end -->
