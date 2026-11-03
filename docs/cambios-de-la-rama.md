# Cambios de la rama respecto a `main`

Este resumen reúne los cambios funcionales y operativos de la rama. No incluye credenciales, cadenas de conexión reales ni datos de negocio.

## Sincronización bidireccional

- Se implementó un outbox transaccional: las mutaciones cubiertas guardan el dato, su evento de sincronización y el registro de operación procesada en una sola transacción.
- `operationId` permite reintentar una operación sin duplicar la escritura y recuperar la respuesta original. El middleware serializa en memoria solicitudes simultáneas con el mismo identificador, consulta y guarda respuestas con consultas breves del pool, y conserva la protección final de la base de datos.
- El candado en memoria supone una sola instancia del API. Con dos instancias, la clave primaria de `operaciones_sincronizadas` y la comprobación transaccional evitan duplicar la mutación, aunque una carrera entre instancias puede terminar en un conflicto HTTP en vez de repetir la primera respuesta.
- Las respuestas exitosas se conservan en `eventos_sincronizacion`; solo se guarda `respuesta_remota` al actualizar un evento existente. Las filas `api_idempotente` sincronizadas no son eventos remotos ni operaciones locales pendientes, y la limpieza las elimina tras 60 días.
- Se añadieron subida, descarga y coordinación de cambios (`sync:local`, `sync:pull`, `sync:all`), autenticación con `SYNC_TOKEN`, control de conflictos y acuse del cursor remoto.
- `sync:init` compara filas e IDs máximos en las tablas cubiertas antes de guardar el punto de partida. Las equivalencias de IDs y las referencias de endpoint/respuesta permiten traducir relaciones entre bases.
- El mapa de emisores, endpoints y relaciones está en [`referencias-sincronizacion.md`](./referencias-sincronizacion.md).

## API, integridad y acceso

- Se reforzaron las escrituras de compras, ventas, créditos, historiales, trabajadores y otras rutas para mantener juntas las mutaciones y su evento de sincronización.
- Mano de obra actualiza los totales de trabajadores dentro de la transacción, bloquea IDs en orden ascendente y conserva el rechazo de operaciones no permitidas en créditos.
- Se añadieron validación de cuerpos y carga de archivos, importación de Excel con vista previa, rechazo de cuerpos comprimidos no admitidos y manejo centralizado de errores.
- Se agregó el acceso remoto con sesiones, límites de intentos y configuración de proxies confiables.
- El esquema Drizzle declara relaciones e índices; el SQL de migración de la Orden 12 para bases existentes está en [`sql/orden-12-llaves-foraneas-e-indices.sql`](./sql/orden-12-llaves-foraneas-e-indices.sql). Ese SQL agrega 17 llaves foráneas y 18 índices, respalda ciertas filas huérfanas y aplica las políticas de borrado documentadas. Debe revisarse y ejecutarse como migración, no sustituirse por `db:push` en producción.

## Interfaz y operación offline

- Se incorporó un helper de respuesta HTTP para presentar rechazos del servidor. Las pantallas afectadas conservan el formulario ante error, evitan dobles envíos mientras guardan y muestran avisos comprensibles.
- La calculadora de cierre admite importes abreviados en miles, y los buscadores de productos muestran más coincidencias con los formatos de detalle acordados.
- La cola global de IndexedDB guarda mutaciones del API cuando falta la red o falla la conexión. El cuadro offline informa si la operación quedó en cola o si no se pudo guardar; una operación encolada se trata como terminada en la pantalla y no se vuelve a encolar al capturar su error.
- La oficina puede operar con PostgreSQL local y conserva sus operaciones pendientes. La sincronización reconcilia cambios cuando vuelve la conexión.

### Pruebas manuales de la cola offline

1. Abre Investillo, desconecta internet y registra una venta. Confirma el aviso de que quedó guardada en este dispositivo.
2. Sin reconectar, registra una compra y un abono; confirma el mismo aviso en cada operación.
3. Reconecta internet, espera a que termine la sincronización y revisa ventas, compras y abonos. Cada registro debe aparecer una sola vez.

## Importaciones y reportes

- La importación de clientes e inventario valida lotes, conserva conflictos para revisión y registra operaciones aptas para sincronización sin enviar archivos binarios.
- Se añadieron comprobaciones de referencias, cálculos de nómina y consistencia de créditos e inventario; los reportes de verificación señalan hallazgos, no los corrigen automáticamente.
- El verificador exige `SYNC_ENTORNO` (`servidor` o `portatil`), informa el desglose de eventos por origen/estado y aplica `SYNC_FECHA_CORTE` (por defecto `2026-11-01`) a la alerta de pendientes locales mayores de 72 horas. También muestra la fecha del pendiente más antiguo desde el corte y cuántos pendientes históricos ignora.
- Las pruebas de borrado por producto de historial de precios verifican rollback y que los historiales de otros productos permanezcan intactos.
- Una prueba de scripts comprueba que los comandos `pnpm run` documentados en el README existan en los `package.json` correspondientes.

## Respaldos, CI y mantenimiento

- El respaldo se genera desde Aiven, la base de producción. Puede restaurarse en la réplica auxiliar Supabase y subirse a Cloudflare R2; R2 conserva seis dumps.
- Se agregaron respaldos locales, comprobación de destino para evitar sobreescribir el origen, estado de sincronización y tareas para inicializar, limpiar y verificar.
- El respaldo local usa PostgreSQL client tools 18 por defecto; `PG_DUMP_PATH` permite elegir otra ruta compatible.
- GitHub Actions valida con Node.js 24 y PostgreSQL 18: typecheck, build, pruebas del API y scripts, además de una integración de sincronización con bases aisladas.
- Workflows separados ejecutan el respaldo programado, la revisión diaria de consistencia y el health check de Render. Sus logs deben revisarse; no reemplazan una prueba de restauración.

## Documentación

- Se corrigió el README para reflejar Aiven como base principal, Supabase como réplica auxiliar y R2 como almacenamiento de dumps; se actualizaron requisitos y procedimientos de PowerShell.
- Se documentaron el flujo de sincronización, sus garantías y conflictos, las llaves foráneas, CI, respaldos, recuperación y el inventario de variables de entorno.
- El procedimiento de primer arranque restaura una copia nueva de Aiven en una base local, archiva y aparta los pendientes históricos solo en el portátil, y reinicia únicamente allí el cursor, la huella y las equivalencias de IDs. Aiven queda intacta.
- El índice y los enlaces internos del README se hicieron explícitos. Una prueba valida que los comandos `pnpm run` documentados existan.
- Este archivo agrupa por tema los cambios respecto a `main`; no contiene cadenas de conexión reales ni datos de negocio.

## Despliegue y bases de datos

- **Aiven** es la base PostgreSQL principal. El servicio API de **Render** usa Aiven; la PC de la oficina trabaja con su PostgreSQL local y sincroniza con el API.
- **Supabase** es una réplica auxiliar que recibe un dump desde Aiven. No se debe cambiar la conexión de producción a Supabase cuando la réplica esté atrasada.
- **Cloudflare R2** almacena copias en formato custom. Para recuperar una copia, descargarla a un área protegida, restaurarla primero en una base aislada y verificarla antes de decidir una recuperación productiva.
- PostgreSQL client tools 18 o posterior se usan para los respaldos de Aiven y el entorno de CI. `PG_DUMP_PATH` permite seleccionar el ejecutable de respaldo local.

## Variables de entorno

Variables de configuración añadidas respecto a `main`:

| Variable | Uso |
|---|---|
| `SYNC_TOKEN` | Autentica la sincronización entre la PC y el API; debe coincidir en ambos lados. |
| `TRUST_PROXY_HOPS` | Define los saltos de proxy confiables para el acceso remoto. |
| `DISABLE_BACKGROUND_JOBS` | Permite desactivar explícitamente los trabajos periódicos del API. |

Variables añadidas solo para pruebas y no destinadas a producción:

| Variable | Uso |
|---|---|
| `SYNC_PAGE_SIZE` | Ajusta el tamaño de página de pull en pruebas. |
| `SYNC_TEST_ALLOW_LOCAL_HTTP` | Permite HTTP local únicamente con `NODE_ENV=test`. |
| `SYNC_TEST_DATABASE_LOCAL` | URL de la base aislada local de pruebas de sincronización. |
| `SYNC_TEST_DATABASE_REMOTE` | URL de la base aislada remota de la prueba E2E. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PGPASSWORD` | Configuración del servicio PostgreSQL efímero en GitHub Actions; no son valores para producción. |

`SOURCE_DATABASE_URL` y `AIVEN_DATABASE_URL` conservan sus nombres. El significado operativo documentado es `SOURCE_DATABASE_URL` como origen Aiven y `AIVEN_DATABASE_URL` como destino auxiliar Supabase. Las demás variables y su ámbito se detallan en la sección [Variables de entorno](../readme.md#seccion-16).

Las variables heredadas del sistema operativo usadas en pruebas (`PATH`, `TEMP`, `TMP`, `USERPROFILE`, `SystemRoot` y `ComSpec`) no son configuración de Investillo ni deben agregarse a archivos `.env`.

## Qué aplicar al desplegar y en qué orden

### Antes de iniciar la versión nueva en Render

Configura estas variables en el servicio de Render antes de desplegar o reiniciar el API:

- `SYNC_TOKEN`: secreto aleatorio de al menos 32 caracteres; debe coincidir exactamente con el de `.env.local` en la laptop.
- `SYNC_CAPTURE_REMOTE=true`: habilita la captura de escrituras remotas que se descargan después en la PC.
- `TRUST_PROXY_HOPS=1`: para el recorrido usual de un proxy en Render; verifica la topología real si cambia.
- `CORS_ORIGINS`: origen HTTPS real desde el que se abrirá la aplicación. No uses un valor de ejemplo ni agregues una conexión PostgreSQL.
- `CLAVE_ACCESO_REMOTO`: secreto de acceso remoto; consérvalo únicamente en la configuración privada de Render.
- `NODE_VERSION=24`: versión de Node.js solicitada a Render.

Cada arranque del API **no ejecuta migraciones ni crea las tablas núcleo de sincronización**. `eventos_sincronizacion`, `operaciones_sincronizadas`, `referencias_sincronizacion`, `cursos_sincronizacion` y `base_sincronizacion` pertenecen al esquema Drizzle y deben existir por la migración aprobada correspondiente. Ya con esas tablas instaladas, el middleware de idempotencia registra respuestas exitosas en `eventos_sincronizacion`, y `SYNC_CAPTURE_REMOTE=true` registra las mutaciones remotas en esa misma tabla; no son pasos de creación de esquema. Algunas tablas auxiliares, como `sesiones_acceso` y `cierre_diario_borradores`, se crean de forma diferida al usar su ruta, pero eso no aprovisiona el esquema de sincronización. No ejecutes `db:push` contra Aiven para resolver una tabla faltante.

### SQL de llaves foráneas e índices de la Orden 12

El archivo [`sql/orden-12-llaves-foraneas-e-indices.sql`](./sql/orden-12-llaves-foraneas-e-indices.sql) se aplica como migración separada, después de que la sincronización bidireccional lleve al menos una semana estable, de acuerdo con la guía del README. Antes, genera y verifica un respaldo reciente, pausa todas las escrituras y ejecuta la revisión de consistencia contra las bases que se van a migrar. Revisa cada huérfano, diferencia de `total_ganado`, conflicto y error; el verificador informa problemas, no los corrige.

Aplica el archivo completo en cada base requerida, respetando su `BEGIN` y `COMMIT`, y valida las 17 llaves foráneas, los 18 índices y la tabla `_respaldo_huerfanos` antes de reanudar escrituras. Si ocurre un error antes de `COMMIT`, la transacción completa se revierte; conserva el mensaje y no reintentes sin revisarlo. Después de un `COMMIT` no hay una reversión automática segura: el SQL conserva y cambia datos huérfanos y elimina historiales cuyo producto ya no existe. No ejecutes un `DROP CONSTRAINT` improvisado; restaura el respaldo previo en una base aislada y planifica una recuperación revisada.

### Orden recomendado

1. Genera un respaldo fresco de Aiven hacia R2 y guarda otra copia verificada fuera del repositorio. Confirma que el archivo se pueda leer y que exista espacio para recuperar.
2. Configura en Render las seis variables indicadas arriba, manteniendo sus valores secretos fuera del código, los comandos y los logs.
3. Fusiona la rama aprobada en `main` y deja que Render despliegue el código nuevo.
4. Comprueba `/api/healthz` y `/api/healthz-db`; no continúes si el API o la conexión a Aiven no responden.
5. Prepara la laptop con PostgreSQL 18 en el puerto local `5433`, copia y verifica la base siguiendo [el primer arranque de sincronización](../readme.md#primer-arranque-aiven-a-pc), y realiza el paso 6 de ese procedimiento solo con respaldo validado y todas las escrituras detenidas. Ese paso reinicia la metadata antigua en las dos bases; no borra tablas de negocio.
6. Ejecuta `sync:init`, revisa `sync:status` y completa la prueba controlada en ambos sentidos antes de reanudar escrituras. La migración de llaves de la Orden 12 se hace después de al menos una semana estable, en una ventana aparte y con los pasos de verificación anteriores.

El workflow de verificación diaria está programado y GitHub ejecuta su horario desde la rama predeterminada (`main`); no es un monitor continuo de una rama de trabajo. Durante la primera puesta en marcha pueden existir eventos históricos antiguos en Aiven hasta completar el paso 6. Si llega una alerta en esa ventana planificada, conserva el log y confirma que el respaldo, la pausa de escrituras y el reinicio de metadata siguen pendientes o ya se completaron correctamente. Fuera de esa ventana, o si la alerta continúa después del reinicio, revisa `sync:status` y la verificación; no borres eventos para silenciar el aviso.

Las respuestas exitosas de `X-Operation-Id` se guardan para que un reintento reciba el mismo estado y cuerpo. `limpiar-operaciones` elimina las operaciones anti-duplicado y los eventos sincronizados que superaron 60 días; no lo ejecutes contra una base equivocada y conserva los respaldos antes de cualquier mantenimiento.

### Límites conocidos

- La guarda del respaldo que evita restaurar sobre el origen compara host, puerto y nombre de base; no reconoce que un alias de pooler y una conexión directa puedan terminar en la misma base.
- No hay pruebas automáticas de interfaz que validen los mensajes y el estado visual de los formularios.
- El candado de `X-Operation-Id` vive en memoria y presupone una sola instancia del API. En dos instancias la base impide duplicar la mutación, pero puede responder un conflicto en vez de reproducir la primera respuesta.
