# Cambios de la rama respecto a `main`

Este resumen reúne los cambios funcionales y operativos de la rama. No incluye credenciales, cadenas de conexión reales ni datos de negocio.

## Sincronización bidireccional

- Se implementó un outbox transaccional: las mutaciones cubiertas guardan el dato, su evento de sincronización y el registro de operación procesada en una sola transacción.
- `operationId` permite reintentar una operación sin duplicar la escritura y recuperar la respuesta original. El middleware serializa solicitudes simultáneas con el mismo identificador y libera el bloqueo al terminar la petición.
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
- La oficina puede operar con PostgreSQL local y conserva sus operaciones pendientes. La cola de IndexedDB y la lógica offline existente se mantienen; la sincronización reconcilia cambios cuando vuelve la conexión.

## Importaciones y reportes

- La importación de clientes e inventario valida lotes, conserva conflictos para revisión y registra operaciones aptas para sincronización sin enviar archivos binarios.
- Se añadieron comprobaciones de referencias, cálculos de nómina y consistencia de créditos e inventario; los reportes de verificación señalan hallazgos, no los corrigen automáticamente.
- La revisión marca como problema un evento local pendiente por más de 72 horas. La consulta usa el umbral como parámetro SQL.
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
