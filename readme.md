# 📦 Investillo

**Investillo** es un sistema para llevar el control de un negocio: qué productos hay en la bodega, qué se vende cada día, quién debe dinero, qué se compra, cuánto se le paga a cada trabajador, y mucho más — todo en un solo lugar, sin necesidad de cuadernos ni hojas de Excel sueltas.

Funciona incluso **sin conexión a internet** (los datos se guardan en el computador y se sincronizan solos cuando vuelve la señal), y se puede **instalar como una app** en Windows, con su propio ícono, como si fuera un programa normal.


## 🗺️ Tabla de contenidos

1. [¿Qué hace cada página del sistema?](#seccion-1)
2. [Autor](#seccion-2)
3. [¿Con qué está construido? (para curiosos)](#seccion-3)
4. [Instalar el sistema desde cero](#seccion-4)
5. [Comandos que vas a usar seguido](#seccion-5)
6. [Bases de datos y respaldo](#seccion-6)
7. [Usarlo día a día en la oficina](#seccion-7)
8. [Ponerlo en internet y respaldarlo](#seccion-8)
9. [Reiniciar la base de datos](#seccion-9)
10. [Cosas que el sistema todavía NO hace](#seccion-10)
11. [Consejos para que todo funcione bien](#seccion-11)
12. [Referencia de costos](#seccion-12)
13. [Mapa de sincronización](#seccion-13)
14. [Garantías y resolución de conflictos](#seccion-14)
15. [CI, respaldos y mantenimiento](#seccion-15)
16. [Variables de entorno](#seccion-16)


<a id="seccion-1"></a>
## 1. 🧭 ¿Qué hace cada página del sistema?

Cuando abres Investillo, en el lado izquierdo de la pantalla ves un menú. Aquí te explico qué hace cada opción, como si nunca lo hubieras visto:

| Página                      | ¿Para qué sirve?                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📊 **Dashboard**            | La pantalla principal — un resumen rápido: cuánto se vendió hoy, cuánto deben los clientes, cuánto se ha comprado, una gráfica de ventas, y una tarjeta para instalar la app.        |
| 🚚 **Compras**              | Registra lo que compras a proveedores, con fecha de llegada elegible, registro en lote (varios productos del mismo proveedor a la vez), e historial agrupado por año y mes.          |
| 🛒 **Ventas Diarias**       | Cada venta del día — qué se vendió, a cómo, y cómo te pagaron (Efectivo / Cuenta Ernesto / Cuenta Olga / Cuenta Juan). El stock baja solo, descontando primero de Local y luego de Bodega si hace falta. |
| 💳 **Créditos**             | Para cuando un cliente se lleva algo y paga después — con filtros por fecha y por placa, y forma de pago registrada al abonar.                                                       |
| 🤝 **Nos Debe**             | Igual que Créditos, pero para cuando es el negocio el que le debe/fía a alguien más.                                                                                                  |
| 📦 **Inventario**           | Todos tus productos, con el stock dividido entre **Local** y **Bodega**, botón de **Trasladar Stock** entre los dos, Estado Activo/Inactivo, pestaña de **Remachadas**, y exportación/importación completa con vista previa de cambios antes de aplicar nada. |
| 🧮 **Cierre Diario**        | Cuánto le toca pagar a cada trabajador, con el seguro social, el conteo de caja, y los **Grupos de Trabajo** para repartir la mano de obra entre varios trabajadores que trabajaron en compañía. |
| 👥 **Clientes**             | Tus clientes, con hasta 2 teléfonos cada uno (el sistema avisa si un número ya está usado por otro cliente) y sus vehículos.                                                          |
| 📖 **Historial de Ventas**  | El resumen de días de venta pasados.                                                                                                                                                  |
| 🕐 **Historial Cierres**    | Lo mismo, pero de los Cierres Diarios ya guardados.                                                                                                                                   |
| 📈 **Historial de Precios** | Gráfica de cómo han subido o bajado los precios de compra.                                                                                                                            |
| 💰 **Reporte de Pagos**     | Cuánto ha entrado por cada forma de pago (Efectivo y las 3 cuentas), por día y por mes, con gráfica de los últimos 6 meses.                                                           |
| 🔧 **Trabajadores**         | El perfil de cada trabajador: seguro social, si se le descuenta o no, y los grupos permanentes de "trabajo en compañía".                                                              |

### La "Calculadora de Cierre"

Hay un botón con un ícono de calculadora en la barra de arriba (visible desde cualquier página) — se usa para cuadrar la caja del día: sumar lo que entró, restar lo que se pagó por fuera, contar monedas y billetes, y ver si "cuadra" con lo esperado. El recuadro de "Diferencia" cambia de color según el resultado: verde apagado si cuadra exacto, verde fuerte si sobra dinero, rojo si falta. También incluye una consulta rápida de "Remachadas" (precio de remachar bandas por número) y un conteo persistente de monedas repartido entre Bolsa y Caja.

---

<a id="seccion-2"></a>
## 2. Autor

|              |                                             |
| ------------ | ------------------------------------------- |
| **Rol**      | Propietario / Product Owner / Desarrollador |
| **Nombre**   | Responsable del proyecto                    |
| **Contacto** | Solicitar al propietario                     |

---

<a id="seccion-3"></a>
## 3. 🛠️ ¿Con qué está construido? (para curiosos)

No necesitas entender esto para usar el sistema — es información para quien quiera dar mantenimiento al código más adelante.

Investillo es un **monorepo** (varios proyectos relacionados guardados juntos en una sola carpeta):

| Parte        | Dónde está             | Qué es, en simple                                                                                                  |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `gestion`    | `artifacts/gestion`    | Lo que ves en pantalla (el "frontend") — hecho con React, Vite y Tailwind CSS.                                     |
| `api-server` | `artifacts/api-server` | El "cerebro" que atiende las peticiones y habla con la base de datos (el "backend") — hecho con Node.js y Express. |
| `db`         | `lib/db`               | La definición de cómo se guardan los datos — usa una herramienta llamada Drizzle ORM.                              |
| `scripts`    | `scripts/`             | Programas de apoyo, como el que hace los respaldos automáticos.                                                    |

Todo el código está escrito en **TypeScript** (una versión de JavaScript que ayuda a detectar errores antes de que pasen).

**La base principal es PostgreSQL en Aiven**. Supabase es una réplica auxiliar que se actualiza al hacer un respaldo; Cloudflare R2 conserva archivos de respaldo y el computador mantiene su propia base local.

### 3.1 Cómo se relacionan las piezas

El flujo normal de una operación es:

```text
Navegador (React/Vite)
  │  HTTP /api
  ▼
API Express (api-server)
  │  Drizzle ORM
  ▼
PostgreSQL (Aiven, producción)
```

- `artifacts/gestion` es la interfaz. Las consultas principales usan el cliente generado desde OpenAPI.
- `artifacts/api-server` registra las rutas bajo `/api`, valida reglas de negocio y sirve el frontend compilado en producción.
- `lib/db` contiene las tablas y la configuración de Drizzle.
- `lib/api-spec/openapi.yaml` es el contrato de las rutas que se generan automáticamente.
- `lib/api-client-react` genera hooks para React Query y `lib/api-zod` genera esquemas Zod.
- Algunas funciones especiales, como importaciones, reportes y ciertos formularios, usan `fetch` manual. Es importante mantener sus respuestas y payloads sincronizados con el backend.

En producción, `pnpm run build` compila el frontend y el backend; luego Express sirve ambos desde el puerto definido en `PORT`.

### 3.2 Requisitos técnicos comprobados

| Requisito                               | Uso                                          |
| --------------------------------------- | --------------------------------------------- |
| Node.js 24.x                            | Ejecutar las herramientas y servidores       |
| pnpm                                    | Instalar dependencias y ejecutar el monorepo |
| PostgreSQL accesible                    | Guardar los datos del sistema                |
| PostgreSQL client tools 18.x o superior | Crear respaldos con `pg_dump` y `pg_restore` |
| Navegador moderno                       | Usar React, PWA e IndexedDB                  |

El backend requiere `DATABASE_URL` incluso para importar módulos en pruebas. Si no existe esa variable, las pruebas del API fallarán al arrancar.

### 3.3 Funciones visuales y de usabilidad

- **Tema claro/oscuro:** botón en la barra superior (ícono de sol/luna) — útil sobre todo si hay mucha luz o reflejo de sol sobre la pantalla, ya que el modo oscuro se ve mal en esas condiciones. Recuerda tu elección entre sesiones.
- **Barra de navegación colapsable:** se ve angosta (solo íconos) por defecto para dejar más espacio a la pantalla, y se expande sola al poner el mouse encima — se vuelve a encoger 5 segundos después de que el mouse se aleja.
- **Buscador de productos mejorado:** al buscar un producto en Ventas, Créditos o Nos Debe, se puede buscar por nombre, código o marca, y se ve el stock y el precio antes de seleccionar.
- **Instalable como PWA:** desde el Dashboard o desde la barra de direcciones del navegador (Chrome/Edge).

### 3.4 Cómo funciona el modo sin conexión y la sincronización

- La computadora de la oficina trabaja contra su PostgreSQL local. Por eso, una caída de internet no debe detener las operaciones normales ni borrar las ventas que ya estaban registradas.
- Si una operación del navegador no logra comunicarse con el API, queda guardada en IndexedDB como `pendiente`. Cuando vuelve la conexión, se intenta sincronizar inmediatamente y también cada 30 segundos mientras la aplicación está abierta.
- La tarea programada de Windows ejecuta `pnpm.cmd run sync:all` cada 5 minutos. Funciona aunque la aplicación web esté cerrada: primero sube las operaciones locales pendientes y con error, y después descarga cambios remotos.
- Cada operación tiene un `operationId` único. El API conserva ese identificador y, si la misma operación se reintenta, devuelve el resultado anterior en lugar de crear otra venta. Las ventas nuevas se agregan; no reemplazan las ventas anteriores.
- Las operaciones se procesan en orden. Un error de conexión se reintenta automáticamente; un error real del servidor queda marcado como `error` con su motivo para revisarlo antes de volver a intentar.
- Antes de usar una computadora sin internet, la base local debe tener una carga inicial de los datos históricos. No se debe restaurar una copia completa de Aiven encima de una base local que ya tenga operaciones nuevas.

### Tareas automáticas recomendadas (Programador de Tareas de Windows)

| Tarea                               | Frecuencia        | Comando (en "Acción" → "Iniciar un programa")                                                                     |
| ----------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Respaldo PostgreSQL local            | Diaria            | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run backup:local >> logs\backup-local.txt 2>&1`                    |
| Verificación PostgreSQL local        | Diaria            | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run verificar:local >> logs\consistencia-local.txt 2>&1`           |
| Sincronización local ↔ Render/Aiven   | Cada 5 minutos    | `cmd.exe /c cd /d "C:\ruta\investillo" && if not exist logs mkdir logs && pnpm.cmd run sync:all >> logs\sincronizacion.txt 2>&1` |
| Limpieza de eventos sincronizados    | Mensual           | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run limpiar-operaciones:local >> logs\limpieza-local.txt 2>&1`    |
| Inicio automático del sistema local | Al iniciar sesión | Ver abajo — versión más confiable que un simple acceso directo                                                    |

**Inicio automático más confiable (en vez de solo la carpeta de Inicio):**

1. Abre **Programador de tareas** → **Crear tarea básica** → nombre `Iniciar Investillo`.
2. Desencadenador: **Al iniciar sesión**.
3. Acción → Programa: `cmd.exe` → Argumentos: `/c cd /d "C:\ruta\investillo" && call investillo.bat >> logs\sistema.txt 2>&1`
4. En **Propiedades** de la tarea (después de crearla) → pestaña **General** → marca **"Ejecutar tanto si el usuario inició sesión como si no"** — así arranca incluso si nadie ha entrado a Windows todavía.

Esto es más confiable que un acceso directo en la carpeta de Inicio porque **queda registrado en un log** si algo falla al arrancar, en vez de fallar en silencio.

### Paso a paso para crear cada tarea en el Programador de Tareas de Windows

Las tareas de respaldo, verificación, sincronización y limpieza se crean de la misma forma — solo cambia el nombre, la frecuencia y el comando. Aquí está el proceso completo, usando el **Respaldo diario local** como ejemplo:

1. Presiona `Win + R`, escribe `taskschd.msc` y da Enter (o busca "Programador de tareas" en el menú Inicio).
2. En el panel derecho, clic en **"Crear tarea básica..."**.
3. **Nombre:** escribe algo claro, por ejemplo `Investillo - Respaldo Semanal`. Clic en **Siguiente**.
4. **Desencadenador** (cuándo se ejecuta): elige la frecuencia según la tabla de arriba:
  - Respaldo local → **Diariamente**
  - Verificación local → **Diariamente**
  - Sincronización → **Diariamente**, configurando después la repetición cada 5 minutos
  - Limpieza de operaciones → **Mensualmente**

   Clic en **Siguiente**.
5. Según lo que elegiste, Windows te pregunta el día y la hora exacta (ej. "todos los lunes a las 7:00 a.m."). Complétalo y clic en **Siguiente**.
6. **Acción:** deja seleccionado **"Iniciar un programa"** y clic en **Siguiente**.
7. En esta pantalla se llenan **2 campos por separado** — no pegues todo el comando junto en el primero:
   - **Programa o script:** escribe únicamente `cmd.exe`
   - **Agregar argumentos (opcional):** aquí sí va el resto del comando completo, por ejemplo:

 /c cd /d "C:\ruta\investillo" && if not exist logs mkdir logs && pnpm.cmd run backup:local >> logs\backup-local.txt 2>&1

     (cambia `C:\ruta\investillo` por la carpeta real donde tengas el proyecto, y usa el comando correspondiente de la tabla según la tarea que estés creando)
8. Clic en **Siguiente**, revisa el resumen, y clic en **Finalizar**.
9. **Paso extra importante:** busca la tarea recién creada en la lista del Programador de Tareas, haz doble clic para abrir sus **Propiedades**, y en la pestaña **General** marca la casilla **"Ejecutar tanto si el usuario inició sesión como si no"** — así la tarea corre igual aunque nadie haya iniciado sesión en Windows en ese momento (por ejemplo, de madrugada).
10. Repite estos pasos para verificación, sincronización y limpieza, cambiando el nombre, la frecuencia y el comando de "Agregar argumentos" según la tabla. Para sincronización, abre las propiedades de la tarea, pestaña **Desencadenadores**, edita el desencadenador y marca **"Repetir la tarea cada 5 minutos durante 1 día"**. Usa `pnpm.cmd` porque el Programador de tareas ejecuta comandos de Windows directamente.

La tarea `sync:all` comprueba que el API remoto esté disponible, sube primero las operaciones locales pendientes o con error y después descarga cambios remotos. Si la subida termina con código `1` (Render no disponible) o `2` (llave rechazada), no inicia la descarga; con código `3` (quedaron errores o conflictos) sí continúa con ella. Los conflictos no se reintentan automáticamente ni bloquean la descarga. Para probarla sin esperar, ejecuta la tarea con clic derecho → **Ejecutar** y revisa `logs\sincronizacion.txt`.

Antes de ejecutar la sincronización en la PC después de actualizar el sistema, despliega primero la API nueva en Render. Para modificaciones y borrados, la subida consulta si hay un cambio remoto posterior al cursor de descarga por el mismo endpoint o una subruta suya; no compara las fechas de los relojes de ambos equipos. Si existe ese cambio, la modificación local queda guardada como conflicto para revisión y no se envía; la descarga aplica el cambio de Render. La comparación no detecta cambios remotos en otras rutas relacionadas; ese caso queda para revisión manual. Los eventos POST no necesitan esa consulta.

**Cómo confirmar que sí están funcionando:** haz clic derecho sobre cualquiera de las tareas creadas → **"Ejecutar"** — esto la corre de inmediato, sin esperar a la fecha programada, para que puedas revisar los archivos de log (`logs\backup-local.txt`, `logs\consistencia-local.txt`, `logs\sincronizacion.txt`, etc.).

---

<a id="seccion-4"></a>
## 4. 💻 Instalar el sistema desde cero

Sigue esto en orden si vas a poner Investillo en un computador que nunca lo ha tenido — ya sea el tuyo o el de la empresa.

### Paso 1 — Instalar Node.js

Node.js es el programa que permite correr este tipo de sistemas.

1. Entra a **[nodejs.org/en/download](https://nodejs.org/en/download)** y descarga la versión **24.x**.
2. Instálalo dejando todo como viene por defecto (solo dale "Siguiente" varias veces).
3. Abre PowerShell y comprueba la versión:
   ```powershell
   node -v
   ```
   Si te responde algo como `v24.x.x`, ya quedó instalado.

### Paso 2 — Activar pnpm

`pnpm` es el programa que descarga todas las "piezas" que necesita el sistema para funcionar.

```powershell
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm -v
```

### Paso 3 — Instalar Git

Git sirve para descargar y actualizar el código del proyecto.

1. Descárgalo de **[git-scm.com/download/win](https://git-scm.com/download/win)**.
2. Instálalo dejando las opciones por defecto.

### Paso 4 — Instalar PostgreSQL local y sus herramientas

Instala PostgreSQL 18 o posterior en el computador de la oficina para que pueda operar sin internet. Si otro computador solo ejecutará respaldos, instala allí las herramientas de línea de comandos.

1. Descarga el instalador desde **[postgresql.org/download/windows](https://www.postgresql.org/download/windows/)**.
2. Para la oficina, instala el servidor PostgreSQL y las herramientas de línea de comandos. Para un equipo dedicado solo a respaldos, basta con **Command Line Tools**.

### Paso 5 — Descargar el proyecto

```cmd
cd C:\Users\TuUsuario\Documents
git clone https://github.com/Juanfigue05/investillo.git
cd investillo
pnpm install
```

Este último comando puede tardar unos minutos — está descargando todas las piezas necesarias.

### Paso 6 — Crear los archivos de configuración

El sistema necesita saber a qué base de datos conectarse. Crea los archivos necesarios en la carpeta principal del proyecto; por seguridad, nunca vienen incluidos en el código que se descarga.

Créalos en la carpeta principal del proyecto (al lado de `package.json`), usando el explorador de archivos de VS Code (clic derecho → "New File") — **no uses el Bloc de notas de Windows**, porque a veces le agrega una extensión `.txt` escondida sin que te des cuenta.

**Archivo `.env.api`** (solo para desarrollo remoto; apunta a Aiven, la base principal):

```
DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@HOST_AIVEN:PUERTO/BASE?sslmode=require
PORT=8080
NODE_ENV=development
```

Para el trabajo normal de oficina, crea también `.env.local` siguiendo el ejemplo seguro de [`docs/local.env.example`](./docs/local.env.example); `DATABASE_URL` debe apuntar a PostgreSQL local, no a Aiven.

**Archivo `.env.web`:**

```
PORT=5173
BASE_PATH=/
```

**Archivo `.env.backup`** (solo si vas a hacer respaldos desde este computador):

```
SOURCE_DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@HOST_AIVEN:PUERTO/BASE?sslmode=require
AIVEN_DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@HOST_SUPABASE:PUERTO/BASE?sslmode=require
R2_ACCOUNT_ID=<tu-id-de-cuenta>
R2_ACCESS_KEY_ID=<tu-llave>
R2_SECRET_ACCESS_KEY=<tu-llave-secreta>
R2_BUCKET=MI_BUCKET_DE_RESPALDOS
PG_BIN_PATH=C:\Program Files\PostgreSQL\18\bin
```

> `SOURCE_DATABASE_URL` es la base principal de Aiven; `AIVEN_DATABASE_URL` conserva su nombre histórico, pero apunta a la réplica auxiliar de Supabase. Si no se configura la segunda o las variables de R2, ese destino de respaldo se omite.

### Paso 7 — Crear las tablas en PostgreSQL local (solo la primera vez)

```powershell
pnpm run db:push:local
```

Esto usa `.env.local` y crea las tablas de la base local. `pnpm run db:push` lee `.env.api`; no lo ejecutes contra Aiven en producción.

### Paso 8 — ¡Listo! Ya puedes correrlo

```powershell
pnpm run dev
```

Esto inicia el API en `http://localhost:8080` y, cuando responde `/api/healthz`, inicia Vite normalmente en `http://localhost:5173`. Vite recarga los cambios del frontend; el backend ejecuta su compilación y arranque definidos en `artifacts/api-server/package.json`, por lo que normalmente debes reiniciarlo después de cambiar código del servidor.

---

<a id="seccion-5"></a>
## 5. ⌨️ Comandos que vas a usar seguido

Ejecuta los comandos desde la carpeta raíz del proyecto en PowerShell, salvo que se indique CMD para una tarea de Windows.

| Comando                                          | Qué hace                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm install`                                   | Descarga/actualiza todas las piezas necesarias del proyecto                              |
| `pnpm run dev`                                   | Corre el sistema en modo "estoy programando" (se actualiza solo cuando cambias código)   |
| `pnpm run start:prod`                            | Corre el sistema contra `.env.api` y la base remota; úsalo para la instancia remota o una prueba conectada |
| `pnpm run start:local`                           | Corre el sistema contra `.env.local` y PostgreSQL local; es el comando de la oficina |
| `pnpm run setup:local`                           | Crea `investillo_local` si todavía no existe                                     |
| `pnpm run db:push:local`                         | Crea/actualiza las tablas de PostgreSQL local                                     |
| `pnpm run db:push`                               | Actualiza una base de desarrollo con el esquema Drizzle; no usar para migrar Aiven       |
| `pnpm run backup`                                | Crea una copia local y, si están configurados, la replica en Aiven y Cloudflare R2       |
| `pnpm run backup:local`                          | Crea un respaldo `.dump` de PostgreSQL local                                            |
| `pnpm run verificar`                             | Revisa consistencia de datos (stock negativo, créditos sobre-abonados, precios invertidos, etc.) |
| `pnpm run verificar:local`                       | Ejecuta la misma revisión contra PostgreSQL local                                      |
| `pnpm run sync:local`                            | Intenta subir eventos locales pendientes al API remoto configurado en `SYNC_REMOTE_API_URL` |
| `pnpm run sync:init`                             | Inicializa una sola vez el punto de partida para descargar cambios desde Render |
| `pnpm run sync:pull`                             | Descarga cambios registrados en Render y los aplica al API local                    |
| `pnpm run sync:all`                              | Sube primero operaciones locales y luego descarga cambios remotos, en ese orden     |
| `pnpm run sync:status`                           | Muestra pendientes, errores y eventos sincronizados retenidos en la cola local           |
| `pnpm run limpiar-operaciones`                   | Limpia la tabla anti-duplicados de operaciones ya sincronizadas hace más de 60 días       |
| `pnpm run limpiar-operaciones:local`             | Limpia eventos y operaciones antiguas de PostgreSQL local                               |
| `pnpm run build`                                 | Prepara el código para producción (lo "compila")                                         |
| `pnpm run typecheck`                             | Comprueba TypeScript en las librerías, API, frontend y scripts                           |
| `pnpm --filter @workspace/api-spec codegen`      | Regenera los clientes React y esquemas Zod desde OpenAPI                                 |
| `pnpm --filter @workspace/api-server test:stock` | Ejecuta la prueba de stock de créditos; necesita `DATABASE_URL`                          |

### 5.1 Validación antes de publicar cambios

Ejecuta desde la raíz del proyecto:

```cmd
pnpm install
pnpm --filter @workspace/api-spec codegen
pnpm run typecheck
pnpm run build
```

Si modificaste el backend o una regla de inventario, configura `.env.api` y ejecuta también:

```cmd
pnpm --filter @workspace/api-server test:stock
```

La prueba no sustituye una prueba contra una base de datos real. Antes de operar con información real, verifica manualmente crear, editar y eliminar un registro, refrescar el navegador y repetir la operación sin conexión.

### 5.2 Diagnóstico rápido

| # | Síntoma | Revisión segura |
|---|---|---|
| 1 | El API no inicia | Comprueba `DATABASE_URL`, `PORT`, el log de Render o que PostgreSQL local esté iniciado. |
| 2 | El frontend local no inicia | Revisa `PORT` y `BASE_PATH` en `.env.web`, y que Vite pueda llegar a `/api/healthz`. |
| 3 | `/api/healthz-db` falla | Revisa el estado del servicio Render y de Aiven; no cambies la conexión a Supabase, que es réplica. |
| 4 | Guardar muestra un rechazo `400` o `409` | Lee el aviso completo, corrige el dato o revisa si la operación ya se aplicó; no cierres el formulario ni repitas a ciegas. |
| 5 | La sincronización rechaza el token | Comprueba que `SYNC_TOKEN` coincida exactamente en Render y `.env.local`, sin compartirlo en logs. |
| 6 | `sync:init` informa que las bases no están alineadas | Detén las escrituras. Revisa la copia inicial, filas y máximos; no fuerces el cursor. |
| 7 | Hay eventos pendientes, error o conflicto | Ejecuta `pnpm run sync:status`, revisa el evento y sus logs. No borres IndexedDB ni la cola para ocultarlo. |
| 8 | Falla una migración por una llave foránea | Conserva el mensaje completo y detente. Si se usa el SQL transaccional documentado, no reintentes sin revisar la causa. |
| 9 | `pg_dump`/`pg_restore` no aparecen o tienen versión vieja | Instala PostgreSQL client tools 18 o posterior. `PG_BIN_PATH` es una carpeta; `PG_DUMP_PATH` es la ruta completa a `pg_dump.exe`. |
| 10 | Falla un workflow de respaldo o consistencia | Abre el log del job y revisa sus secretos/permisos. Confirma la copia por separado; un workflow verde no sustituye una prueba de restauración. |

---

<a id="seccion-6"></a>
## 6. 🗄️ Base principal y copias de respaldo

Aiven es la base PostgreSQL principal de producción. El sistema local tiene una base PostgreSQL propia para operar sin internet. `pnpm run backup` genera un dump desde Aiven, puede restaurarlo en la réplica auxiliar Supabase y puede subirlo a Cloudflare R2:

```
                      ┌─────────────────────┐
                      │ Aiven — producción  │
                      └──────────┬──────────┘
                                 │ backup
                ┌────────────────┼─────────────────┐
                ▼                ▼                 ▼
       dump en el equipo   Supabase — réplica   Cloudflare R2
       que ejecuta backup    auxiliar              hasta 6 dumps

       La oficina también opera con PostgreSQL local y sincroniza
       los cambios con el API desplegado en Render.
```

### 6.1 Configurar Aiven (base de producción)

1. Configura el servicio PostgreSQL de producción en Aiven y guarda la cadena de conexión de forma segura.
2. `DATABASE_URL` del servicio Render y `SOURCE_DATABASE_URL` del archivo `.env.backup` apuntan a Aiven.
3. La aplicación de oficina usa su propia base local mediante `DATABASE_URL` en `.env.local`; no conectes el uso diario de la oficina directamente a Aiven.
4. No ejecutes `pnpm run db:push` contra producción. Las migraciones de producción deben revisarse, respaldarse y aplicarse con el procedimiento correspondiente.

### 6.2 Configurar Supabase (réplica auxiliar)

Supabase no es la base principal ni debe recibir escrituras directas de la aplicación. Configura su cadena de conexión como `AIVEN_DATABASE_URL` en `.env.backup`; el nombre se conserva por compatibilidad. El respaldo la reemplaza con el dump más reciente de Aiven. Si Supabase se pausa o falla, Investillo sigue usando Aiven; la réplica puede quedar desactualizada hasta el próximo respaldo correcto.

### 6.3 Configurar Cloudflare R2 (el archivo de respaldo)

Configura un bucket privado y credenciales limitadas a ese bucket en `.env.backup`. El respaldo solo se sube si están configuradas las cuatro variables `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`. El script conserva las seis copias más recientes con prefijo `investillo_`.

### 6.4 Hacer un respaldo

```powershell
pnpm run backup
```

El dump se genera localmente desde Aiven y se comprueba su tamaño. Si `AIVEN_DATABASE_URL` está configurada, se restaura en Supabase; si el grupo de variables R2 está completo, también se sube a R2. Un error en cualquiera de los pasos ejecutados deja el comando con error; revisa el resumen antes de dar el respaldo por bueno. Programa la tarea al menos diariamente y revisa sus registros.

`pnpm run backup:local` crea un respaldo adicional de la base PostgreSQL del computador, en `LOCAL_BACKUP_DIR` (por defecto, `backups/local` dentro del paquete de scripts), y elimina dumps locales que superen `LOCAL_BACKUP_RETENTION_DAYS` (30 días por defecto).

### 6.5 Restaurar un respaldo

La restauración puede sobrescribir datos. Para recuperar un dump desde R2, descárgalo desde el panel de Cloudflare a una carpeta protegida fuera del repositorio y verifica que sea el archivo esperado. Antes de restaurarlo:

1. Detén el sistema para que nadie escriba durante la restauración.
2. Conserva un respaldo del estado actual y restaura primero en una base aislada, nunca directamente sobre producción.
3. Usa PostgreSQL client tools 18 o posterior para inspeccionar el dump y restaurarlo en una base local aislada:

   ```powershell
   $dump = 'C:\ruta\protegida\investillo_AAAA-MM-DD.dump'
   & 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list $dump
   & 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' --username postgres investillo_restore_test
   & 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --username postgres --dbname investillo_restore_test --no-owner --no-privileges $dump
   ```

4. Crea un archivo local protegido `.env.restore` con `DATABASE_URL` apuntando a `investillo_restore_test` y ejecuta la verificación sin cargar `.env.api`:

   ```powershell
   pnpm exec dotenv -e .env.restore -- pnpm --filter @workspace/scripts run verificar
   ```

   Comprueba manualmente los datos de esa base aislada antes de aprobar cualquier recuperación. No guardes `.env.restore` en Git ni compartas su contenido.

No ejecutes comandos destructivos sobre Aiven sin confirmar la base destino, disponer de otro respaldo y tener un plan de recuperación. Si la restauración es necesaria, solicita revisión técnica antes de reanudar escrituras.

### 6.6 Llaves foráneas e índices

La migración aprobada de la Orden 12 está en [`docs/sql/orden-12-llaves-foraneas-e-indices.sql`](./docs/sql/orden-12-llaves-foraneas-e-indices.sql). Antes de ejecutarla sobre una base existente, toma y valida un respaldo, detén escrituras y revisa las referencias huérfanas con `pnpm run verificar`. No ejecutes `db:push` en Aiven como sustituto de este SQL.

El SQL agrega 17 llaves foráneas y 18 índices. Conserva las filas huérfanas previas en `_respaldo_huerfanos`, desvincula las relaciones configuradas como `SET NULL` y elimina solo historiales de precio cuyo producto ya no existe. Ejecuta el archivo completo como una sola transacción y compara los resultados esperados antes de reanudar escrituras.

Si el SQL falla por cualquier llave o restricción, toda la transacción se revierte y no cambia nada. Copia el mensaje de error completo y detente; no vuelvas a ejecutarlo sin revisar la causa. No agregues `CASCADE` indiscriminadamente: compras, ventas e historiales pueden ser datos que deben conservarse.

### 6.7 Inventario: exportar, corregir y volver a subir con vista previa

Para corregir muchos productos a la vez (por ejemplo, cuadrar el stock de Local/Bodega de todo el inventario), Inventario tiene un flujo pensado para volúmenes grandes (probado con casi 3.000 productos a la vez):

1. **"Exportar Inventario"** descarga un Excel con **todos** los productos y **todos** los campos (nombre, marca, tipo, referencia, precios, IVA, Stock Local, Stock Bodega, stock mínimo).
2. Corriges lo que necesites en el Excel — **una celda vacía significa "no tocar ese campo"**, así que solo hace falta escribir lo que realmente quieres cambiar.
3. **"Importar y Revisar Cambios"** sube el archivo completo (sin límite de filas) y compara contra la base de datos — pero **no cambia nada todavía**.
4. Se abre una vista previa mostrando, producto por producto, exactamente qué campo cambiaría y de qué valor a cuál (ej. "Stock Local: 10 → 45"), además de cuáles productos son nuevos.
5. Solo al darle **"Aplicar cambios"** se actualiza la base de datos, de una sola vez.

El botón **"Importar Excel"** (el original, más simple) sigue disponible aparte, para cuando solo necesitas subir/corregir cantidades rápido sin revisar cambio por cambio.

---

<a id="seccion-7"></a>
## 7. 🏢 Usarlo día a día en la oficina

Cuando ya no estás programando, sino simplemente **usando** el sistema en el negocio, no uses `pnpm run dev` ni `pnpm run start:prod`. En esta computadora usa PostgreSQL local:

```cmd
pnpm run start:local
```

Esto compila el sistema y lo deja funcionando como **un solo programa**, disponible en `http://localhost:8080` (o el puerto definido en `.env.local`). `pnpm run start:prod` queda reservado para un entorno que deba usar `.env.api` y la base remota.

### Preparar esta computadora para trabajar varios días sin internet

La instalación local usa PostgreSQL en este computador. Esto evita que las operaciones normales dependan de internet durante un corte. Las operaciones cubiertas por el registro de eventos se conservan localmente y se sincronizan con el API de Render cuando vuelve la conexión; el API escribe en Aiven.

#### Qué significa cada variable

- `DATABASE_URL` es una conexión de PostgreSQL. En `.env.local` apunta a la base instalada en este computador, por ejemplo `localhost:5432/investillo_local`.
- `SYNC_REMOTE_API_URL` **no** es una conexión de PostgreSQL. Es la dirección HTTPS del API publicado en Render, normalmente con `/api` al final, por ejemplo `https://TU-SERVICIO.onrender.com/api`.
- `SYNC_TOKEN` es un secreto aleatorio compartido por Render, `.env.local` y el servidor local. Los scripts lo envían en la cabecera `X-Sync-Token`; debe tener al menos 32 bytes.
- En Render, `DATABASE_URL` apunta a Aiven. En `.env.backup`, `SOURCE_DATABASE_URL` también apunta a Aiven; `AIVEN_DATABASE_URL` es el nombre histórico de la conexión de destino Supabase.
- Nunca pongas una cadena PostgreSQL ni una contraseña en `SYNC_REMOTE_API_URL`.

1. Confirma que el servicio PostgreSQL local esté iniciado en Windows.
2. Copia `docs\local.env.example` como `.env.local` y cambia:
   - `CAMBIE_ESTA_CONTRASENA` por la contraseña del usuario local `postgres`.
   - `TU-SERVICIO.onrender.com` por el dominio real de Render.
   No compartas `.env.local` ni lo subas a Git.
3. Crea automáticamente la base local desde PowerShell:
  ```powershell
  pnpm run setup:local
  ```
   El comando se conecta a la base administrativa `postgres`, crea `investillo_local` si no existe y no borra una base existente. Si prefieres hacerlo manualmente, usa `createdb.exe` como se explica más abajo.
4. Crea las tablas en la base local:
  ```powershell
  pnpm run db:push:local
  ```
5. Arranca Investillo localmente:
  ```powershell
  pnpm run start:local
  ```
6. Cuando la conexión vuelva, prueba manualmente la sincronización completa con:
  ```powershell
  pnpm run sync:all
  ```
  Para automatizarla, crea la tarea de Windows descrita en la sección 3.4 y ejecútala cada 5 minutos. La tarea debe usar la misma carpeta del proyecto para encontrar `.env.local`.
  Antes o después puedes revisar la cola con `pnpm run sync:status`. El resultado esperado cuando no hay trabajo pendiente es `Pendientes: 0`, `Con error: 0` y `Conflictos: 0`. Antes de subir una modificación o borrado, `sync:local` consulta si hay un cambio remoto sin descargar sobre el mismo endpoint o recurso. Si lo hay, guarda la operación local como `conflicto` y no la envía; `sync:all` continúa con la descarga para aplicar el cambio de Render y la operación local queda para revisión manual.

7. Programa también un respaldo local diario con `cmd.exe` y estos argumentos:
    `/c cd /d "C:\ruta\investillo" && pnpm run backup:local`.
    El respaldo queda en `scripts\backups\local` y conserva por defecto 30 días. No guardes la única copia en el mismo disco: copia periódicamente esa carpeta a un USB o disco externo.

El paso 3 crea la **base vacía**. El paso 4 crea las **tablas**. Son cosas distintas. Para que la computadora tenga los datos históricos antes de desconectarla, primero debes importar una copia de la base remota o ejecutar una carga inicial controlada; no empieces a trabajar offline con la base local vacía.

#### Cargar los datos iniciales desde Aiven

Hazlo una sola vez, antes de usar la oficina sin internet y después de tener un respaldo. Este procedimiento copia una copia completa de Aiven a la base local; no lo ejecutes mientras haya operaciones locales que quieras conservar.

1. Confirma que `investillo_local` esté creada y que el servicio PostgreSQL esté iniciado.
2. Ejecuta `pnpm run backup`, que obtiene el dump de Aiven con las variables de `.env.backup`. Revisa el resumen y elige el archivo `.dump` recién generado en `scripts\backups`.
3. Confirma cuidadosamente que el destino sea `investillo_local`. El siguiente ejemplo restaura el dump elegido en esa base local; no uses la URL de Aiven como destino:
  ```powershell
  & 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --host localhost --port 5432 --username postgres --dbname investillo_local --clean --if-exists --no-owner --no-privileges 'C:\ruta\protegida\investillo_AAAA-MM-DD.dump'
  ```
4. Ejecuta la verificación contra la base local:
  ```powershell
  dotenv -e .env.local -- pnpm --filter @workspace/scripts run verificar
  ```
  Revisa también manualmente productos, clientes, ventas y créditos.
5. Ejecuta `pnpm run backup:local` para conservar una copia de la base local inicial.

Después de esta carga, no vuelvas a restaurar un dump completo sobre la base local si ya existen operaciones offline. Para actualizar una base local que ya tiene trabajo propio se usa la sincronización, no una restauración completa.

El acceso directo `investillo.bat` ya exige `.env.local` y usa `start:local`; no arranca accidentalmente contra la base remota. Conserva `.env.api` solo para tareas que deban conectarse a Aiven.

El trabajo de sincronización se ejecuta en este orden: registro durable de operaciones, subida idempotente al API de Render/Aiven, descarga de cambios y resolución de conflictos. Las operaciones con conflicto quedan retenidas y no se sobrescriben automáticamente.

**Estado actual de esta implementación:** PostgreSQL local, creación automática de la base, estructura local, respaldos locales, registro de eventos y sincronización por módulos están implementados. La sincronización debe probarse contra el API remoto y la tarea debe conservar sus logs; no borres la base remota ni restaures una copia completa sobre una base local que ya tenga trabajo propio.

#### Recuperar la base local

Si PostgreSQL local se daña, detén Investillo y conserva la carpeta de respaldos. Lista los archivos `.dump`, elige uno anterior al problema y ejecuta desde PowerShell:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\dropdb.exe' --username postgres --if-exists investillo_local
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' --username postgres investillo_local
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --username postgres --dbname investillo_local --clean --if-exists --no-owner --no-privileges 'scripts\backups\local\ELEGIR_RESPALDO.dump'
```

Después ejecuta la verificación apuntando a la base local antes de volver a operar. No restaures sobre Aiven o Supabase con estos comandos.

### Crear un acceso directo para no escribir el comando cada vez

1. En el Escritorio, crea un archivo nuevo llamado `Iniciar Investillo.bat`.
2. Ábrelo con el Bloc de notas y pega esto (cambiando la ruta por la real):
   ```bat
   @echo off
   cd /d "C:\Users\TuUsuario\Documents\investillo"
  pnpm run start:local
   ```
3. Guarda. Desde ahora, con doble clic en ese archivo arranca todo el sistema.

### Instalarlo como si fuera una app de Windows

Con el sistema corriendo, ábrelo en Google Chrome o Microsoft Edge — en la barra de direcciones (o en una tarjeta dentro del propio Dashboard) va a aparecer la opción **"Instalar aplicación"**. Al instalarlo, se abre en su propia ventana, con su propio ícono, sin verse como una página web — funciona como cualquier otro programa de Windows.

### Que arranque solo al prender el computador

1. Presiona `Win + R`, escribe `shell:startup` y da Enter.
2. Copia ahí un acceso directo del archivo `.bat` que creaste arriba.

### Pasar el sistema a otro computador (por ejemplo, el de la oficina)

1. Repite los Pasos 1 a 5 de la sección 4 en ese computador.
2. Para una computadora de oficina offline, crea su propio `.env.local` con su propio PostgreSQL local. No copies contraseñas sin necesidad y no sobrescribas `.env.local` con `.env.api`.
3. Ejecuta `pnpm install`, `pnpm run setup:local`, `pnpm run db:push:local` y luego `pnpm run start:local`.
4. Carga en esa base local una copia inicial verificada de los datos antes de desconectar el equipo.
5. **No uses `pnpm run db:push` para la base local**: ese comando usa `.env.api` y puede apuntar a Aiven. Para la oficina usa siempre `pnpm run db:push:local`.

---

<a id="seccion-8"></a>
## 8. 🌐 Ponerlo en internet y respaldarlo (Render + Aiven + R2)

Render ejecuta el API y Aiven conserva la base PostgreSQL principal. El computador de la oficina también puede seguir operando contra su PostgreSQL local cuando no tiene internet; luego sincroniza los cambios.

### 8.1 Papel de cada servicio

- **Render:** ejecuta el servicio API y sirve el frontend.
- **Aiven:** base PostgreSQL principal de producción; `DATABASE_URL` del servicio apunta a ella.
- **Supabase:** réplica auxiliar que recibe una copia mediante el proceso de respaldo. No es un destino de escrituras de la aplicación.
- **Cloudflare R2:** almacena los dumps de respaldo, conservando hasta seis copias.

### 8.2 Desplegar en Render

1. Crea cuenta en **[render.com](https://render.com)** (puedes entrar directo con tu cuenta de GitHub).
2. Clic en **"New +"** → **"Web Service"** → conecta tu repositorio de GitHub.
3. Llena el formulario así:
   - **Build Command:** `pnpm install && pnpm run build`
   - **Start Command:** `pnpm --filter @workspace/api-server run start`
   - **Instance Type:** `Free`
4. En **"Environment Variables"**, agrega:
   | Nombre | Valor |
   |---|---|
   | `DATABASE_URL` | cadena PostgreSQL de Aiven |
   | `NODE_ENV` | `production` |
   | `SYNC_CAPTURE_REMOTE` | `true` |
   | `CLAVE_ACCESO_REMOTO` | una clave privada para abrir la aplicación |
   | `SYNC_TOKEN` | secreto aleatorio de al menos 32 bytes; también se configura en `.env.local` |
   | `TRUST_PROXY_HOPS` | `1` para Render detrás de un proxy |
5. Clic en **"Create Web Service"** y espera a que termine; Render te mostrará la dirección pública de tu servicio.

Genera el token con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Guarda el mismo valor en Render y en `.env.local`, y no lo publiques ni lo subas a Git. Los scripts `sync:local` y `sync:pull` lo envían como `X-Sync-Token`; sin este token la sincronización se rechaza. El límite de intentos de acceso es de 5 fallos por IP cada 15 minutos y se guarda en memoria, por lo que está pensado para una sola instancia. `TRUST_PROXY_HOPS` debe corresponder al número real de proxies confiables; verifica esa configuración antes de usar el límite en producción.

La dirección que Render entrega, seguida de `/api`, es la que se debe poner en `SYNC_REMOTE_API_URL` del computador local. No pongas allí `DATABASE_URL` ni una URL de PostgreSQL, Cloudflare o Supabase.

Después de desplegar, prueba desde el navegador:

```text
https://TU-SERVICIO.onrender.com/api/healthz
```

Debe responder con un estado correcto. Si no responde, no programes todavía `sync:local`.

#### Acceso remoto y sincronización autenticada

- Configura `CLAVE_ACCESO_REMOTO` en Render para proteger la aplicación. Tras iniciar sesión, el navegador recibe una cookie `investillo_sesion` aleatoria, `HttpOnly`, `SameSite=Lax` y con expiración de 30 días; el servidor guarda solo el hash en `sesiones_acceso`. Cerrar sesión revoca la sesión de ese navegador/perfil. La tabla se crea automáticamente al iniciar sesión y la limpieza periódica de operaciones elimina sesiones vencidas.
- Configura `SYNC_TOKEN` con el mismo secreto aleatorio en Render y `.env.local`. Genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y no lo compartas ni lo subas a Git. Se necesita para subir y descargar cambios; los scripts lo envían mediante `X-Sync-Token` y, sin él, la API rechaza las solicitudes de sincronización.
- Para preparar la primera sincronización Aiven→PC, sigue completo el procedimiento **[Primer arranque de la sincronización (Aiven a PC)](#primer-arranque-aiven-a-pc)**. No basta con copiar los datos: también hay que migrar el esquema y reiniciar el estado antiguo de sincronización en ambas bases.
- `sync:init` compara en las dos bases la cantidad de filas y el ID máximo de cada tabla de negocio. Solo guarda el cursor y las 21 huellas iniciales si coinciden. No hay una opción para saltarse esa comprobación; si ya hay cursor sin punto de partida completo, el comando se detiene sin borrar ni modificar datos.
- `sync:status` informa si el punto de partida está ausente, incompleto o completo; muestra el cursor remoto, los eventos por origen y estado, y advierte si hay eventos anteriores a la fecha guardada en la huella base.
- La descarga confirma a Render el último cursor aplicado (`/api/sync/ack`). El limpiador conserva los eventos remotos mientras no tengan acuse; una vez confirmados, quedan sujetos a la retención normal de 60 días. Esta confirmación está diseñada para una sola PC sincronizadora.
- En Render configura `TRUST_PROXY_HOPS` con el número real de proxies confiables. Para la configuración habitual de Render se usa `1`; verifica el recorrido de red antes de habilitar el servicio. Es obligatorio en producción cuando `CLAVE_ACCESO_REMOTO` está activa. El límite de acceso es de cinco fallos por IP en 15 minutos y se mantiene en memoria, adecuado para una sola instancia.
- La política CSP de Helmet se mantiene desactivada para no interferir con los estilos, fuentes ni PWA; se habilitan las demás cabeceras de seguridad y `Referrer-Policy: same-origin`.

<a id="primer-arranque-aiven-a-pc"></a>
#### Primer arranque de la sincronización (Aiven a PC)

Este procedimiento se usa una sola vez para preparar la sincronización bidireccional entre la base de Aiven y la copia de trabajo de la PC; Render ejecuta el API que conecta ambas. No lo ejecutes con cambios pendientes ni con las bases desalineadas. El reinicio borra solo metadata de sincronización, no tablas de negocio.

1. **Comprueba los requisitos.**
   - Render ya debe tener desplegada la versión nueva de la aplicación, con `SYNC_CAPTURE_REMOTE=true` y `SYNC_TOKEN` configurado. Usa el mismo `SYNC_TOKEN` en Render y en `.env.local`; configura `SYNC_REMOTE_API_URL` con la URL del API de Render.
   - La PC debe tener PostgreSQL 18 instalado, el código actualizado y sus variables locales correctas.
   - Confirma que la base local de trabajo es la que vas a usar y que hay espacio suficiente para restaurar el respaldo.

2. **Haz un respaldo de Aiven antes de cambiar nada.** Guarda el dump en una ubicación protegida fuera del repositorio y comprueba que el archivo se pueda leer. No compartas ni registres credenciales en comandos, capturas o logs.

3. **Detén todas las escrituras.** Desde que se toma el respaldo hasta que `sync:init` termine correctamente, no se deben crear, editar ni borrar datos en Aiven/Render ni en la PC. Pausa también importaciones, tareas programadas y cualquier otra aplicación que escriba en esas bases.

4. **Copia Aiven a la PC.** En el equipo local, si la base ya contiene tablas, elimina primero solo su esquema y restáuralo sin `--clean`. Ejemplo para la base local; sustituye la ruta por la ubicación protegida del dump:

   ```sql
   DROP SCHEMA public CASCADE;
   ```

   ```powershell
   & 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --host localhost --port 5433 --username postgres --dbname investillo_sync_local --no-owner 'C:\ruta\protegida\aiven.dump'
   ```

   No ejecutes `pg_restore --clean`: el esquema se acaba de eliminar y el dump crea los objetos. Verifica que el destino sea la base local correcta. No restaures el dump encima de Aiven.

5. **Aplica la migración en Aiven y en la PC.** En cada base, ejecuta primero este SQL. La consulta de duplicados debe devolver cero filas; si devuelve alguna, detente y resuelve los duplicados con respaldo antes de crear el índice único.

   ```sql
   ALTER TABLE cursos_sincronizacion
     ADD COLUMN IF NOT EXISTS operacion_id text;

   CREATE TABLE IF NOT EXISTS base_sincronizacion (
     tabla text PRIMARY KEY,
     total bigint NOT NULL,
     maximo_id bigint NOT NULL,
     creado_en timestamp NOT NULL DEFAULT now()
   );

   SELECT entidad, id_remoto, array_agg(id_local ORDER BY id_local) AS ids_local
   FROM referencias_sincronizacion
   GROUP BY entidad, id_remoto
   HAVING count(*) > 1;

   CREATE UNIQUE INDEX IF NOT EXISTS referencias_sincronizacion_entidad_remoto_uidx
     ON referencias_sincronizacion (entidad, id_remoto);
   ```

6. **Reinicia la metadata antigua en las dos bases.** Puede haber eventos pendientes históricos del sistema anterior antes de este paso. Solo después de validar el respaldo, detener las escrituras y confirmar la alineación, ejecuta tanto en Aiven como en la PC estas sentencias en este orden y dentro de una transacción. No borres `operaciones_sincronizadas` ni ninguna tabla de negocio:

   ```sql
   BEGIN;
   DELETE FROM cursos_sincronizacion;
   DELETE FROM eventos_sincronizacion;
   DELETE FROM referencias_sincronizacion;
   DELETE FROM base_sincronizacion;
   COMMIT;
   ```

   Comprueba que las cuatro tablas quedaron sin filas en ambas bases. Este paso evita reaplicar eventos del sistema anterior; no lo omitas ni ejecutes `sync:local` antes de inicializar.

7. **Verifica la alineación con `sync:init`.** Mantén detenidas las escrituras y, desde la PC, ejecuta:

   ```powershell
   pnpm run sync:init
   ```

   El comando consulta la huella remota y la compara con la local para cada tabla: cantidad de filas e ID máximo. Esas medidas deben coincidir en las 21 tablas; no son un hash criptográfico del contenido. Si falta una tabla o una medida difiere, el comando falla y no guarda un cursor parcial. No fuerces el avance: vuelve a detener escrituras, identifica cuál base es la fuente correcta, alinéala y repite desde la copia y el reinicio.

8. **Revisa el estado antes de reabrir escrituras.** Ejecuta `pnpm run sync:status` en la PC. Debe indicar punto de partida completo (21/21 tablas), cursor remoto y cantidades de eventos por origen/estado. Después del reinicio no deben quedar eventos viejos pendientes; si hay eventos con fecha anterior a la huella o cuya antigüedad no se puede determinar, detente e investiga.

9. **Haz una prueba controlada.** Crea un registro de prueba identificable en Render, ejecuta `pnpm run sync:all` en la PC y comprueba que el registro y su equivalencia llegaron a la base local. Luego crea otro registro de prueba en la PC, vuelve a ejecutar `sync:all` y comprueba que llegó a Render. Ejecuta `sync:all` una segunda vez: no debe volver a aplicar ninguno de los cambios. Borra los registros de prueba mediante la aplicación sincronizada y verifica que ya no existan en ninguna base.

10. **Reanuda las escrituras solo tras verificar ambos sentidos.** Si cualquier comprobación falla, detén la sincronización y conserva los respaldos y los mensajes de error. No borres cursores manualmente, no fuerces `sync:init`, no vuelvas a ejecutar una subida sobre una base desalineada y no reanudes las escrituras hasta confirmar cuál es la copia válida y volver a alinear las bases.

#### Llaves foráneas e índices

- **Nunca ejecutes `db:push` contra Aiven.** Espera a que la sincronización lleve al menos una semana estable; esta orden no forma parte del primer arranque ni se ejecuta durante la inicialización.
- Antes de aplicarla, toma un respaldo verificado y detén todas las escrituras. Ejecuta manualmente [el SQL de la Orden 12](./docs/sql/orden-12-llaves-foraneas-e-indices.sql) tanto en Aiven como en la copia local. Si primero vas a copiar una base sobre la otra, aplícalo a la fuente antes de copiarla y verifica luego ambas.
- El SQL conserva en `_respaldo_huerfanos` las filas huérfanas de historial de precios y mano de obra. Desvincula los historiales sin compra y la mano de obra sin venta; elimina los historiales cuyo producto ya no existe. Ese borrado cambia el conteo y la huella de `historial_precios`, por eso debe hacerse fuera del primer arranque de sincronización.
- Si el SQL falla por cualquier llave, toda la transacción se revierte y no cambia nada. Copia el mensaje completo y no lo reintentes sin revisarlo.
- Para comprobar cada base, confirma 17 llaves foráneas y 18 índices de esta orden, y revisa cuántas filas se respaldaron:

  ```sql
  SELECT count(*) AS llaves_foraneas
  FROM pg_constraint
  WHERE contype = 'f'
    AND connamespace = 'public'::regnamespace
    AND conname = ANY (ARRAY[
      'abonos_creditos_credito_id_fk', 'credito_lineas_credito_id_fk',
      'credito_lineas_producto_id_fk', 'compras_producto_id_fk',
      'descuentos_inventario_producto_id_fk',
      'distribuciones_mano_obra_mano_obra_fk',
      'distribuciones_mano_obra_trabajador_fk',
      'historial_precios_compra_id_fk', 'historial_precios_producto_id_fk',
      'mano_obra_credito_id_fk', 'mano_obra_venta_id_fk',
      'obra_electronica_trabajador_id_fk', 'pagos_seguro_trabajador_id_fk',
      'vehiculos_cliente_cliente_id_fk', 'ventas_diarias_credito_abono_id_fk',
      'ventas_diarias_mano_obra_id_fk', 'ventas_diarias_producto_id_fk'
    ]);

  SELECT count(*) AS indices
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = ANY (ARRAY[
      'ventas_diarias_fecha_idx', 'ventas_diarias_credito_abono_id_idx',
      'ventas_diarias_producto_id_idx', 'ventas_diarias_mano_obra_id_idx',
      'abonos_creditos_credito_id_idx', 'credito_lineas_credito_id_idx',
      'credito_lineas_producto_id_idx', 'creditos_tipo_idx',
      'compras_producto_id_idx', 'distribuciones_mano_obra_mo_idx',
      'distribuciones_mano_obra_trab_idx', 'mano_obra_credito_id_idx',
      'mano_obra_venta_id_idx', 'mano_obra_fecha_idx',
      'historial_precios_producto_id_idx', 'obra_electronica_trabajador_id_idx',
      'pagos_seguro_trabajador_id_idx', 'vehiculos_cliente_cliente_id_idx'
    ]);

  SELECT origen, count(*) AS filas_respaldadas
  FROM _respaldo_huerfanos
  GROUP BY origen
  ORDER BY origen;
  ```

- Los primeros resultados deben ser 17 y 18. Compara los conteos de filas de negocio en ambas bases después de aplicar el SQL; investiga cualquier diferencia antes de reanudar escrituras.

### 8.3 Comprobación periódica del API

El workflow existente `.github/workflows/keep-alive.yml` consulta `/api/healthz-db` cada diez minutos y también puede ejecutarse manualmente. Sirve para detectar que API y base respondan; no garantiza disponibilidad ni reemplaza los respaldos. Si falla, revisa los logs del workflow y el panel de Render/Aiven antes de reintentar operaciones.

### 8.3.1 Revisión de consistencia automática en la nube

Además del respaldo semanal (que depende de que el portátil esté prendido), `pnpm run verificar` también puede correr en GitHub Actions — así funciona aunque el portátil esté apagado:

**`.github/workflows/verificar-consistencia.yml`**

```yaml
name: Verificar Consistencia

on:
  schedule:
    - cron: "0 13 * * *"   # todos los días a las 8:00 a.m. hora Colombia
  workflow_dispatch: {}

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: corepack enable && corepack prepare pnpm@11.22.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm run verificar
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Necesita que guardes tu `DATABASE_URL` como **Secret** del repositorio: **Settings → Secrets and variables → Actions → New repository secret**.

### 8.4 Actualizaciones automáticas

Cada vez que subas cambios nuevos (`git push`), Render puede desplegar automáticamente los cambios según la configuración del servicio. Confirma el despliegue y el health check antes de ejecutar la tarea de sincronización desde la oficina.

### 8.5 Rutas y contrato API

Las rutas principales se registran en `artifacts/api-server/src/routes/index.ts`. El contrato OpenAPI cubre los hooks generados, pero algunas rutas de importación, reportes y funciones auxiliares se consumen desde el frontend con `fetch` manual. Después de cambiar una ruta documentada, regenera los clientes con `pnpm --filter @workspace/api-spec codegen` y ejecuta `pnpm run typecheck`.

### 8.6 Reiniciar o reactivar manualmente (cuando algo falla)

Si el workflow de comprobación falla o el sistema no responde, revisa primero los logs del workflow, Render y Aiven. No asumas que una operación fallida se guardó ni repitas escrituras hasta consultar el estado de sincronización.

#### La réplica Supabase está pausada o desactualizada

La aplicación principal usa Aiven, no Supabase. Si la réplica está pausada, revisa el estado del servicio y reactívala según las indicaciones del proveedor; después ejecuta un respaldo y comprueba su resumen. No apuntes la aplicación a una réplica antigua.

#### Render dejó de responder o se quedó "atascado"

1. Entra a **[dashboard.render.com](https://dashboard.render.com)** e inicia sesión.
2. Abre tu servicio (`investillo` o el nombre que le hayas puesto).
3. Si se ve "Suspended" o con un ícono de error: clic en **"Manual Deploy"** (arriba a la derecha) → **"Deploy latest commit"** — esto vuelve a desplegar tu código desde cero, tal como está en GitHub ahora mismo.
4. Si necesitas ver qué pasó exactamente, revisa la pestaña **"Logs"** de ese mismo panel — ahí queda el detalle de cualquier error del servidor.

#### El sistema local (portátil de la oficina) no arrancó solo

1. Revisa el archivo de log que configuramos en el Programador de Tareas (`logs\sistema.txt`) — ahí debería decir por qué falló, si falló.
2. Abre el **Símbolo del sistema (CMD)**, ve a la carpeta del proyecto, y corre `pnpm run start:local` a mano — si arranca bien así, el problema fue puntual (por ejemplo, el equipo tardó en iniciar PostgreSQL o la tarea automática corrió antes de tiempo).
3. Si sigue sin arrancar, revisa que `.env.local` exista y que PostgreSQL local esté iniciado; no reemplaces ese archivo por `.env.api`.

#### Aiven no responde (base principal)

1. Entra a **[console.aiven.io](https://console.aiven.io)**.
2. Revisa el estado del servicio y sus métricas; sigue el procedimiento de recuperación del proveedor.
3. No cambies `DATABASE_URL` a Supabase: esa es una réplica auxiliar y puede estar desactualizada. Conserva los logs y los respaldos, y valida la base antes de reanudar escrituras.

---

<a id="seccion-9"></a>
## 9. 🧹 Reiniciar la base de datos antes de empezar de verdad

Todo lo que hay guardado hasta ahora (productos, ventas, trabajadores) fue de **prueba**, mientras se construía el sistema. Antes de usarlo con datos reales del negocio, hay que reiniciar la base.

⚠️ **Esto borra todo permanentemente. No hay forma de deshacerlo. Haz un respaldo antes (`pnpm run backup`) y confirma que estás conectado al proyecto correcto.**

### 9.1 Opción recomendada: vaciar las tablas existentes

Esta opción conserva las tablas y sus permisos. Solo úsala en una base que se haya confirmado como la correcta; para producción, coordina la operación y el respaldo antes de borrar nada. Abre el editor SQL del proveedor de la base destino y ejecuta:

1. Confirma el proveedor y el nombre de la base destino; no te guíes solo por la pestaña del navegador.
2. Abre el editor SQL de esa base y crea una consulta nueva.
3. Pega y ejecuta esto:

```sql
TRUNCATE TABLE
  productos,
  ventas_diarias,
  creditos,
  credito_lineas,
  abonos_creditos,
  compras,
  historial_precios,
  historial_dias,
  trabajadores,
  pagos_seguro,
  mano_obra,
  distribuciones_mano_obra,
  clientes,
  vehiculos_cliente,
  cierre_diario,
  remachadas,
  grupos_trabajo_default,
  descuentos_inventario,
  obra_electronica,
  operaciones_sincronizadas,
  notas,
  conteo_monedas
RESTART IDENTITY CASCADE;
```

4. Confirma que se ejecutó sin errores (mensaje verde de éxito).
5. Abre el sistema — todas las listas deberían aparecer vacías, listas para empezar con información real.

Con las llaves foráneas de la Orden 12, `CASCADE` también vaciaría `descuentos_inventario` y `obra_electronica` junto a productos y trabajadores; por eso aparecen explícitamente en la lista.

**¿Qué significa cada palabra del comando?**

- `TRUNCATE TABLE` → "vacía estas tablas por completo".
- `RESTART IDENTITY` → "vuelve a poner el contador de números en 1" (el próximo producto que crees será el #1, no el #847 de las pruebas).
- `CASCADE` → limpia también cualquier cosa que dependiera de esos datos, para no dejar nada "suelto".

Si quieres conservar algo (por ejemplo, si ya cargaste trabajadores reales), quita esa tabla de la lista antes de ejecutar.

### 9.2 Recrear completamente el esquema `public`

Usa esta opción únicamente si quieres eliminar también tablas, índices, secuencias y restricciones creadas anteriormente. Es destructiva. **No ejecutes `DROP DATABASE`**: mantén seleccionada la base correcta y no realices esta operación en producción sin aprobación y respaldo verificado.

En el editor SQL de la base destino, ejecuta:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
```

Después, desde la carpeta raíz del proyecto, con `.env.api` apuntando exactamente a esa base:

```powershell
pnpm install
pnpm run db:push
```

`db:push` lee `DATABASE_URL` desde `.env.api`, usa `lib/db/src/schema/index.ts` y crea las tablas definidas en `lib/db/src/schema`. No uses `db:push` para alterar Aiven en producción; las migraciones productivas deben tener SQL revisado y un plan de respaldo. No uses `push-force` como primera opción.

### 9.3 Comprobar que la recreación terminó bien

En el editor SQL de la base destino puedes comprobar las tablas con:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Luego, desde el proyecto, ejecuta:

```powershell
pnpm run verificar
pnpm run typecheck
pnpm run build
```

`pnpm run verificar` necesita `DATABASE_URL` y revisa datos inconsistentes y referencias huérfanas. Si la base está recién creada, debe terminar sin registros problemáticos.

---

<a id="seccion-10"></a>
## 10. 🚧 Límites conocidos

Para que sepas qué esperar y qué no:

- La oficina está documentada para Windows y PowerShell; CI también ejecuta validaciones en Linux. Usa PostgreSQL client tools 18 o posterior.
- **No existe integración con contabilidad formal (PUC/NIIF) ni facturación electrónica DIAN** — se decidió, por ahora, que el sistema se enfoque solo en control interno.
- La base PostgreSQL local permite operar sin internet. La sincronización cubre las rutas descritas en [`docs/referencias-sincronizacion.md`](./docs/referencias-sincronizacion.md); revisa los logs y el estado de la cola antes de asumir que una operación llegó a Aiven.
- Render ejecuta el API; Aiven es la base principal. Supabase es solamente una réplica auxiliar de respaldo y puede no tener el último estado si un respaldo falla.
- La importación masiva de clientes detecta duplicados por nombre y por teléfono (compara solo los dígitos, sin importar el formato) — si un número ya está en uso, esa fila queda separada para revisión manual, no se omite en silencio. Correo no se valida contra duplicados.
- Las respuestas de sincronización HTTP `409` quedan en conflicto y no se reintentan solas. Los errores transitorios se reintentan según su tipo; las operaciones con error deben revisarse antes de reactivarlas.
- Códigos de salida de `sync:local`: `0` todo bien; `1` Render no disponible (se reintenta en la próxima corrida); `2` Render rechazó `SYNC_TOKEN` (revisar la llave); `3` terminó la subida, pero quedaron operaciones en error o conflicto. Las respuestas `409` quedan en conflicto y no se reintentan solas; otros errores `5xx` se reintentan hasta dos veces antes de quedar en error, excepto `502`, `503` y `504`, que interrumpen la corrida. El panel **Copia local** permite revisar y reactivar operaciones con error; no debe asumirse que fueron aplicadas hasta comprobarlo.
- Las pruebas del API necesitan PostgreSQL 18 disponible y una `DATABASE_URL` de pruebas válida. CI prepara una base aislada; no uses producción para correr pruebas.
- La suite de sincronización usa bases aisladas `investillo_sync_local` e `investillo_sync_remote`. Configura `SYNC_TEST_DATABASE_LOCAL` y `SYNC_TEST_DATABASE_REMOTE` y ejecuta `pnpm --filter @workspace/scripts run test:sync`; nunca apuntes esas variables a producción ni a una base de trabajo.
- Las pruebas integrales de la subida usan el servidor HTTP falso y `investillo_sync_local`; configura `SYNC_TEST_DATABASE_LOCAL` con su URL local y ejecuta `pnpm --filter @workspace/scripts run test:sync-local`. La prueba limpia únicamente sus eventos identificados y el cursor remoto de la base aislada.
- La prueba de `sync:init` también usa `investillo_sync_local` y un servidor falso; configura `SYNC_TEST_DATABASE_LOCAL` y ejecuta `pnpm --filter @workspace/scripts run test:sync-init`. Verifica la comparación de huellas, la inicialización sin cambios parciales y el caso de cursor existente.
- El contrato OpenAPI y las rutas implementadas no son idénticos: las funciones que usan `fetch` manual deben probarse además de ejecutar el codegen.
- La PWA usa `BASE_PATH` para `base`, `start_url`, `scope` y `navigateFallback`. Para desplegar bajo una subruta, configura esa variable durante el build y verifica que el proxy publique `/api` en la misma URL esperada por el frontend.

---

<a id="seccion-11"></a>
## 11. ✅ Consejos para que todo funcione bien

- Programa `pnpm run backup` al menos una vez al día y revisa que los pasos local, réplica y R2 terminen como se espera.
- Conserva respaldos fuera del computador y realiza una prueba periódica de restauración en una base aislada.
- Antes de actualizar el esquema, confirma la base destino, toma un respaldo y sigue el procedimiento de migración documentado.
- Después de un cambio importante, ejecuta `pnpm run typecheck` y `pnpm run build` antes de reiniciar producción.
- **No borres "Cookies y datos de sitios"** del navegador en el computador principal — ahí es donde vive la información guardada mientras no hay internet. Borrar solo el historial de navegación sí es seguro.
- Si aparece una operación pendiente, no borres los datos del sitio ni reinstales el navegador hasta confirmar si ya se sincronizó o si debes exportar una copia local.
- Usa el botón **"Guardar copia local"** de la barra superior antes de apagar el equipo, si trabajaste sin conexión y no alcanzaste a confirmar que sincronizó.
- Antes de construir cualquier módulo de contabilidad en el futuro, **defínelo primero con un contador certificado** — evita errores costosos de mapeo frente a la DIAN.

---

<a id="seccion-12"></a>
## 12. 💰 Referencia de costos

Los precios, límites de almacenamiento, retención y condiciones de suspensión de Aiven, Supabase, Cloudflare y Render cambian. Consulta las tarifas vigentes de cada proveedor antes de contratar o cambiar el servicio. No se fija aquí un costo ni se asume que un plan gratuito incluya disponibilidad o recuperación garantizadas.

| Servicio | Función en Investillo |
|---|---|
| Aiven | Base de datos principal de producción |
| Render | API y frontend |
| Supabase | Réplica auxiliar de respaldo |
| Cloudflare R2 | Almacenamiento de dumps |

<a id="seccion-13"></a>
## 13. 🔄 Mapa de sincronización

```text
Ventas en la oficina
        │
        ▼
API local ── transacción ── fila de negocio + evento + operationId
        │
        ├── sin internet: el evento queda pendiente en PostgreSQL local
        │
        ▼
sync:all (primero subir; después descargar)
        │
        ▼
API de Render ── transacción ── Aiven
        │
        └── pull de eventos remotos y acuse del cursor
```

- Las rutas con sincronización guardan el cambio de negocio, el evento de `eventos_sincronizacion` y el registro en `operaciones_sincronizadas` en la misma transacción. Si una parte falla, no se confirma ninguna.
- `operationId` identifica una petición lógica. Reintentar la misma operación no vuelve a crear el registro; el servidor entrega la respuesta que quedó guardada para esa operación.
- `referencias_sincronizacion` relaciona IDs locales y remotos. Para filas anidadas, las referencias de endpoint y respuesta permiten traducir relaciones sin adivinar IDs.
- `sync:init` es una operación inicial única: compara cantidad de filas e ID máximo en 21 tablas, y guarda el punto de partida solo si ambas bases están alineadas. No es un hash del contenido ni debe forzarse para ocultar diferencias.
- `sync:local` sube eventos locales pendientes o con error. `sync:pull` descarga eventos de Render; `sync:all` ejecuta la subida antes de la descarga. La descarga confirma el cursor para que el servidor pueda retener y, tras el plazo establecido, limpiar eventos ya procesados.
- `sync:status` muestra el punto de partida, el cursor y los eventos por origen/estado. La confirmación del cursor está diseñada para una sola PC sincronizadora; no inicialices una segunda oficina con el mismo estado sin un diseño y una prueba aparte.

El inventario de endpoints, entidades, referencias y respuestas está en [`docs/referencias-sincronizacion.md`](./docs/referencias-sincronizacion.md). No edites directamente una base mientras el outbox tenga eventos sin procesar: podrías crear divergencias difíciles de resolver.

<a id="seccion-14"></a>
## 14. ✅ Garantías y resolución de conflictos

### Escrituras e idempotencia

- En las rutas integradas, la fila de negocio, el evento de salida y la operación procesada se confirman juntos. Los fallos simulados de las pruebas verifican que no queden escrituras parciales.
- Si llega dos veces el mismo `operationId`, incluso en paralelo, la API responde con el resultado ya registrado y no duplica el cambio.
- En mano de obra, `total_ganado` se actualiza junto con las distribuciones; al reemplazar o borrar, se descuentan las distribuciones anteriores y se suman las nuevas dentro de la misma transacción.
- Las respuestas de conflicto `409` se conservan como conflicto y no se reintentan automáticamente. La cola local no se debe borrar para "resolver" un conflicto.

### Qué hacer ante error o conflicto

1. Deja abierta la pantalla y lee el aviso completo. Si la petición fue rechazada, corrige el dato antes de volver a guardar.
2. Ejecuta `pnpm run sync:status` en la PC. Para una operación con error o conflicto, conserva su `operationId`, el endpoint y el mensaje; no la reactives sin confirmar primero el estado de la fila remota.
3. Si Render o Aiven no responden, conserva la operación pendiente y el log. La próxima ejecución puede reintentar un error transitorio; no copies datos manualmente entre bases.
4. Si el mismo recurso se modificó remotamente después del último pull, la edición o eliminación local puede quedar en conflicto para evitar sobrescribir cambios no descargados. Ejecuta la descarga y resuelve el caso manualmente antes de volver a subir.

La comprobación diaria revisa referencias huérfanas, diferencias entre `total_ganado` y sus distribuciones, eventos de sincronización en error/conflicto o pendientes por más de 72 horas, stock negativo, créditos sobre-abonados, líneas de crédito desalineadas y precios de venta inferiores al costo. El reporte señala problemas; no los corrige automáticamente.

<a id="seccion-15"></a>
## 15. 🧰 CI, respaldos y mantenimiento

El resumen de cambios de esta rama respecto a `main` está en [`docs/cambios-de-la-rama.md`](./docs/cambios-de-la-rama.md).

### Integración continua

`.github/workflows/ci.yml` corre en cada push y pull request. Usa PostgreSQL 18 aislado, Node.js 24 y pnpm 11.22.0; valida el esquema de prueba, el typecheck, el build, las pruebas del API y las pruebas de scripts. Un job separado crea bases aisladas de sincronización y ejecuta `test:sync`. Un resultado verde no valida una migración aplicada a producción.

### Respaldos automáticos

`.github/workflows/backup-automatico.yml` puede ejecutarse manualmente y está programado dos veces al día (14:00 y 01:00 UTC). Ejecuta el respaldo desde `SOURCE_DATABASE_URL` (Aiven), puede restaurar en `AIVEN_DATABASE_URL` (réplica Supabase) y sube a R2 cuando están configurados sus cuatro secretos. El workflow instala PostgreSQL client tools 18. El historial de R2 conserva seis dumps.

Después de cada ejecución, abre el log y confirma por separado los estados **Local**, **Réplica** y **R2**. Una réplica omitida por falta de variables no equivale a un respaldo completo; un fallo en cualquiera de los pasos ejecutados requiere revisión.

### Revisión diaria

`.github/workflows/verificar-consistencia.yml` ejecuta `pnpm run verificar` una vez al día a las 13:00 UTC, y también admite ejecución manual. El secreto de Actions `DATABASE_URL` debe apuntar a Aiven. Un resultado fallido indica hallazgos o un problema de conexión; abre el log y revisa cada mensaje.

`.github/workflows/keep-alive.yml` consulta el endpoint de salud de Render cada diez minutos. No hace respaldo, no valida todas las reglas de negocio y no garantiza que el servicio no se suspenda.

### Cambios de esquema

1. Haz y valida un respaldo antes de tocar una base persistente.
2. Revisa las referencias huérfanas con `pnpm run verificar`.
3. Usa SQL versionado y revisado. La Orden 12 documenta las 17 llaves foráneas y 18 índices en [`docs/sql/orden-12-llaves-foraneas-e-indices.sql`](./docs/sql/orden-12-llaves-foraneas-e-indices.sql).
4. Ejecuta el SQL completo en una transacción y comprueba los resultados. Ante un error, guarda el texto completo y detente; no reintentes sin revisar.
5. Valida el esquema y la aplicación en una base aislada antes de planificar el despliegue. No uses `db:push` directamente en Aiven.

<a id="seccion-16"></a>
## 16. 🔐 Variables de entorno

No escribas valores reales en el README, en capturas, tickets ni commits. Usa los archivos locales ignorados por Git y los Secrets de GitHub/Render. Las cadenas PostgreSQL contienen credenciales: no las pases como argumentos visibles en scripts ni las publiques en logs.

| Variable | Dónde | Propósito y requisito |
|---|---|---|
| `DATABASE_URL` | `.env.local`, `.env.api`, Render y GitHub Actions | Obligatoria para API y scripts que acceden a PostgreSQL. `.env.local` apunta a PostgreSQL local; `.env.api`/Render y el secret de verificación apuntan a Aiven; CI usa una base efímera. |
| `PORT` | `.env.api`, `.env.local`, `.env.web`, Render | Puerto del API; es obligatorio para el servidor. Vite también puede usarlo para su servidor de desarrollo. |
| `NODE_ENV` | local y Render | Selecciona comportamiento de desarrollo/producción. En Render usa `production`; `test` habilita ajustes reservados para pruebas. |
| `CORS_ORIGINS` | API | Lista opcional, separada por comas, de orígenes web permitidos. El frontend servido por el mismo API no necesita agregarse. |
| `CLAVE_ACCESO_REMOTO` | Render | Clave de acceso a la aplicación remota. Configúrala en producción; nunca la publiques. |
| `TRUST_PROXY_HOPS` | Render | Número de proxies confiables. Debe corresponder a la topología real; el despliegue documentado en Render usa `1`. |
| `SYNC_TOKEN` | Render y `.env.local` | Secreto compartido obligatorio para sincronizar. Usa el mismo valor en ambos lados y al menos 32 bytes. |
| `SYNC_CAPTURE_REMOTE` | Render | Debe estar en `true` para capturar las escrituras remotas que alimentan el pull. |
| `SYNC_REMOTE_API_URL` | `.env.local` | URL HTTPS del API de Render con `/api`; no es una URL de PostgreSQL. |
| `DISABLE_BACKGROUND_JOBS` | API | Si vale `true`, desactiva los trabajos periódicos del proceso. Normalmente se deja sin configurar. |
| `LOG_LEVEL` | API | Nivel de logging opcional; por defecto es `info`. |
| `SOURCE_DATABASE_URL` | `.env.backup` y GitHub Secrets del backup | Obligatoria para generar el respaldo: conexión de origen a Aiven, la base principal. |
| `AIVEN_DATABASE_URL` | `.env.backup` y GitHub Secrets del backup | Opcional; nombre histórico de la conexión de destino a Supabase, la réplica auxiliar. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | `.env.backup` y GitHub Secrets del backup | Deben configurarse las cuatro para subir dumps a Cloudflare R2. La llave debe limitarse al bucket necesario. |
| `PG_BIN_PATH` | `.env.backup` / workflow | Carpeta que contiene `pg_dump` y `pg_restore`. En Windows apunta a `...\PostgreSQL\18\bin`; CI instala PostgreSQL 18. |
| `PG_DUMP_PATH` | `.env.local` | Ruta completa al ejecutable `pg_dump.exe` para el respaldo local. |
| `LOCAL_BACKUP_DIR` | `.env.local` | Carpeta de destino para dumps locales; si falta, el script usa `backups/local`. |
| `LOCAL_BACKUP_RETENTION_DAYS` | `.env.local` | Retención de dumps locales en días; por defecto, 30. |
| `SYNC_TEST_DATABASE_LOCAL` | pruebas de scripts | URL de la base aislada `investillo_sync_local`; no usar una base productiva ni la base de trabajo. |
| `SYNC_TEST_DATABASE_REMOTE` | prueba E2E de sincronización | URL de la base aislada `investillo_sync_remote`; solo para pruebas. |
| `SYNC_TEST_ALLOW_LOCAL_HTTP` | pruebas de scripts | Habilita HTTP local de prueba; solo se acepta con `NODE_ENV=test`. |
| `SYNC_PAGE_SIZE` | pruebas de `sync:pull` | Ajusta el tamaño de página solo en pruebas; producción lo rechaza y el valor de prueba debe estar entre 1 y 200. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PGPASSWORD` | CI | Variables exclusivas del servicio PostgreSQL efímero y del job de integración de Actions; no reutilices esos valores de prueba en producción. |
| `BASE_PATH` | build de `gestion` | Requerida para Vite/PWA; usa `/` en el despliegue raíz o el prefijo configurado por el proxy. |

`import.meta.env.BASE_URL` es un valor derivado que inyecta Vite, no una variable secreta que debas copiar a un archivo. `PATH`, `TEMP`, `TMP`, `USERPROFILE`, `SystemRoot` y `ComSpec` son variables heredadas del sistema operativo y algunas pruebas las usan para crear directorios temporales o invocar comandos; no son configuración de negocio.

Respecto a `main`, las variables añadidas para endurecer el flujo de esta rama son `SYNC_TOKEN`, `TRUST_PROXY_HOPS` y `DISABLE_BACKGROUND_JOBS`; los parámetros `SYNC_PAGE_SIZE`, `SYNC_TEST_ALLOW_LOCAL_HTTP`, `SYNC_TEST_DATABASE_LOCAL` y `SYNC_TEST_DATABASE_REMOTE` son exclusivos de pruebas. `SOURCE_DATABASE_URL` y `AIVEN_DATABASE_URL` conservan sus nombres, pero su uso documentado es Aiven como origen y Supabase como destino auxiliar.

---

_Documento actualizado como parte de la documentación técnica del proyecto Investillo._