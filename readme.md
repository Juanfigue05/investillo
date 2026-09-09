# 📦 Investillo

**Investillo** es un sistema para llevar el control de un negocio: qué productos hay en la bodega, qué se vende cada día, quién debe dinero, qué se compra, cuánto se le paga a cada trabajador, y mucho más — todo en un solo lugar, sin necesidad de cuadernos ni hojas de Excel sueltas.

Funciona incluso **sin conexión a internet** (los datos se guardan en el computador y se sincronizan solos cuando vuelve la señal), y se puede **instalar como una app** en Windows, con su propio ícono, como si fuera un programa normal.


## 🗺️ Tabla de contenidos

1. [¿Qué hace cada página del sistema?](#1--qué-hace-cada-página-del-sistema)
2. [Autor](#2-autor)
3. [¿Con qué está construido? (para curiosos)](#3--con-qué-está-construido-para-curiosos)
4. [Instalar el sistema desde cero](#4--instalar-el-sistema-desde-cero)
5. [Comandos que vas a usar seguido](#5--comandos-que-vas-a-usar-seguido)
6. [Las bases de datos — por qué hay 3](#6--las-bases-de-datos--por-qué-hay-3)
7. [Usarlo día a día en la oficina (Modo producción)](#7--usarlo-día-a-día-en-la-oficina-modo-producción)
8. [Ponerlo en internet, con respaldo (Render + Railway)](#8--ponerlo-en-internet-con-respaldo-render--railway)
9. [Reiniciar la base de datos antes de empezar de verdad](#9--reiniciar-la-base-de-datos-antes-de-empezar-de-verdad)
10. [Cosas que el sistema todavía NO hace](#10--cosas-que-el-sistema-todavía-no-hace)
11. [Consejos para que todo funcione bien](#11--consejos-para-que-todo-funcione-bien)
12. [Referencia de costos](#12--referencia-de-costos)


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

## 2. Autor

|              |                                             |
| ------------ | ------------------------------------------- |
| **Rol**      | Propietario / Product Owner / Desarrollador |
| **Nombre**   | Juan David Figueroa                         |
| **Contacto** | +57 314 537 0182                            |

---

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

**La base de datos es PostgreSQL**, alojada en 3 lugares distintos por seguridad (ver sección 6).

### 3.1 Cómo se relacionan las piezas

El flujo normal de una operación es:

```text
Navegador (React/Vite)
  │  HTTP /api
  ▼
API Express (api-server)
  │  Drizzle ORM
  ▼
PostgreSQL (Supabase)
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
| PostgreSQL client tools 17.x o superior | Crear respaldos con `pg_dump` y `pg_restore` |
| Navegador moderno                       | Usar React, PWA e IndexedDB                  |

El backend requiere `DATABASE_URL` incluso para importar módulos en pruebas. Si no existe esa variable, las pruebas del API fallarán al arrancar.

### 3.3 Funciones visuales y de usabilidad

- **Tema claro/oscuro:** botón en la barra superior (ícono de sol/luna) — útil sobre todo si hay mucha luz o reflejo de sol sobre la pantalla, ya que el modo oscuro se ve mal en esas condiciones. Recuerda tu elección entre sesiones.
- **Barra de navegación colapsable:** se ve angosta (solo íconos) por defecto para dejar más espacio a la pantalla, y se expande sola al poner el mouse encima — se vuelve a encoger 5 segundos después de que el mouse se aleja.
- **Buscador de productos mejorado:** al buscar un producto en Ventas, Créditos o Nos Debe, se puede buscar por nombre, código o marca, y se ve el stock y el precio antes de seleccionar.
- **Instalable como PWA:** desde el Dashboard o desde la barra de direcciones del navegador (Chrome/Edge).

### Tareas automáticas recomendadas (Programador de Tareas de Windows)

| Tarea                               | Frecuencia        | Comando (en "Acción" → "Iniciar un programa")                                                                     |
| ----------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Respaldo PostgreSQL local            | Diaria            | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run backup:local >> logs\backup-local.txt 2>&1`                    |
| Verificación PostgreSQL local        | Diaria            | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run verificar:local >> logs\consistencia-local.txt 2>&1`           |
| Sincronización local ↔ Render/Supabase| Cada 5 minutos    | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run sync:local >> logs\sincronizacion.txt 2>&1 && pnpm run sync:pull >> logs\sincronizacion.txt 2>&1` |
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

 /c cd /d "C:\ruta\investillo" && pnpm run backup:local >> logs\backup-local.txt 2>&1

     (cambia `C:\ruta\investillo` por la carpeta real donde tengas el proyecto, y usa el comando correspondiente de la tabla según la tarea que estés creando)
8. Clic en **Siguiente**, revisa el resumen, y clic en **Finalizar**.
9. **Paso extra importante:** busca la tarea recién creada en la lista del Programador de Tareas, haz doble clic para abrir sus **Propiedades**, y en la pestaña **General** marca la casilla **"Ejecutar tanto si el usuario inició sesión como si no"** — así la tarea corre igual aunque nadie haya iniciado sesión en Windows en ese momento (por ejemplo, de madrugada).
10. Repite estos pasos para verificación, sincronización y limpieza, cambiando el nombre, la frecuencia y el comando de "Agregar argumentos" según la tabla. Para sincronización, abre las propiedades de la tarea, pestaña **Desencadenadores**, edita el desencadenador y marca **"Repetir la tarea cada 5 minutos durante 1 día"**.

**Cómo confirmar que sí están funcionando:** haz clic derecho sobre cualquiera de las tareas creadas → **"Ejecutar"** — esto la corre de inmediato, sin esperar a la fecha programada, para que puedas revisar los archivos de log (`logs\backup-local.txt`, `logs\consistencia-local.txt`, `logs\sincronizacion.txt`, etc.).

---

## 4. 💻 Instalar el sistema desde cero

Sigue esto en orden si vas a poner Investillo en un computador que nunca lo ha tenido — ya sea el tuyo o el de la empresa.

### Paso 1 — Instalar Node.js

Node.js es el programa que permite correr este tipo de sistemas.

1. Entra a **[nodejs.org/en/download](https://nodejs.org/en/download)** y descarga la versión **24.x**.
2. Instálalo dejando todo como viene por defecto (solo dale "Siguiente" varias veces).
3. Abre el **Símbolo del sistema** (búscalo como "cmd" en el menú de Windows) y escribe:
   ```cmd
   node -v
   ```
   Si te responde algo como `v24.x.x`, ya quedó instalado.

### Paso 2 — Activar pnpm

`pnpm` es el programa que descarga todas las "piezas" que necesita el sistema para funcionar.

```cmd
npm install -g pnpm
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

### Paso 3 — Instalar Git

Git sirve para descargar y actualizar el código del proyecto.

1. Descárgalo de **[git-scm.com/download/win](https://git-scm.com/download/win)**.
2. Instálalo dejando las opciones por defecto.

### Paso 4 — (Solo si vas a hacer respaldos desde este computador) Instalar PostgreSQL

Este paso es **opcional** — solo hace falta en el computador que va a correr `pnpm run backup`.

1. Descarga de **[postgresql.org/download/windows](https://www.postgresql.org/download/windows/)**, versión **17.x**.
2. Al instalar, cuando te pregunte qué componentes instalar, **desmarca** "PostgreSQL Server" y "pgAdmin 4" — deja marcado solo **"Command Line Tools"**.

### Paso 5 — Descargar el proyecto

```cmd
cd C:\Users\TuUsuario\Documents
git clone https://github.com/Juanfigue05/investillo.git
cd investillo
pnpm install
```

Este último comando puede tardar unos minutos — está descargando todas las piezas necesarias.

### Paso 6 — Crear los archivos de configuración

El sistema necesita saber a qué base de datos conectarse. Esa información va en 3 archivos que **tú mismo debes crear** (por seguridad, nunca vienen incluidos en el código que se descarga).

Créalos en la carpeta principal del proyecto (al lado de `package.json`), usando el explorador de archivos de VS Code (clic derecho → "New File") — **no uses el Bloc de notas de Windows**, porque a veces le agrega una extensión `.txt` escondida sin que te des cuenta.

**Archivo `.env.api`:**

```
DATABASE_URL=postgresql://postgres.<tu-proyecto>:<tu-contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres
PORT=8080
NODE_ENV=development
```

**Archivo `.env.web`:**

```
PORT=5173
BASE_PATH=/
```

**Archivo `.env.backup`** (solo si vas a hacer respaldos desde este computador):

```
SOURCE_DATABASE_URL=postgresql://postgres.<tu-proyecto>:<tu-contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres
AIVEN_DATABASE_URL=postgresql://avnadmin:<tu-contraseña>@<tu-servicio>.aivencloud.com:<puerto>/defaultdb?sslmode=require
R2_ACCOUNT_ID=<tu-id-de-cuenta>
R2_ACCESS_KEY_ID=<tu-llave>
R2_SECRET_ACCESS_KEY=<tu-llave-secreta>
R2_BUCKET=investillo-backups
PG_BIN_PATH=C:\Program Files\PostgreSQL\17\bin
```

> 📌 Los valores entre `< >` los reemplazas por los datos reales de tu cuenta de Supabase/Aiven/Cloudflare — todos se explican en la sección 6.

### Paso 7 — Crear las tablas en la base de datos (solo la primera vez)

```cmd
pnpm run db:push
```

Esto le dice a la base de datos "crea todas las tablas que este sistema necesita".

### Paso 8 — ¡Listo! Ya puedes correrlo

```cmd
pnpm run dev
```

Esto inicia el API en `http://localhost:8080` y, cuando responde `/api/healthz`, inicia Vite normalmente en `http://localhost:5173`. Vite recarga los cambios del frontend; el backend ejecuta su compilación y arranque definidos en `artifacts/api-server/package.json`, por lo que normalmente debes reiniciarlo después de cambiar código del servidor.

---

## 5. ⌨️ Comandos que vas a usar seguido

Todos se escriben en el **Símbolo del sistema (CMD)**, estando dentro de la carpeta del proyecto.

| Comando                                          | Qué hace                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm install`                                   | Descarga/actualiza todas las piezas necesarias del proyecto                              |
| `pnpm run dev`                                   | Corre el sistema en modo "estoy programando" (se actualiza solo cuando cambias código)   |
| `pnpm run start:prod`                            | Corre el sistema contra `.env.api` y la base remota; úsalo para la instancia remota o una prueba conectada |
| `pnpm run start:local`                           | Corre el sistema contra `.env.local` y PostgreSQL local; es el comando de la oficina |
| `pnpm run setup:local`                           | Crea `investillo_local` si todavía no existe                                     |
| `pnpm run db:push:local`                         | Crea/actualiza las tablas de PostgreSQL local                                     |
| `pnpm run db:push`                               | Actualiza la estructura de la base de datos según lo definido en el código               |
| `pnpm run backup`                                | Crea una copia local y, si están configurados, la replica en Aiven y Cloudflare R2       |
| `pnpm run backup:local`                          | Crea un respaldo `.dump` de PostgreSQL local                                            |
| `pnpm run verificar`                             | Revisa consistencia de datos (stock negativo, créditos sobre-abonados, precios invertidos, etc.) |
| `pnpm run verificar:local`                       | Ejecuta la misma revisión contra PostgreSQL local                                      |
| `pnpm run sync:local`                            | Intenta subir eventos locales pendientes al API remoto configurado en `SYNC_REMOTE_API_URL` |
| `pnpm run sync:pull`                             | Descarga cambios registrados en Render y los aplica al API local                    |
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

| Síntoma                                  | Revisión                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| El API no inicia                         | Comprueba `DATABASE_URL`, `PORT` y el log del servidor                                                        |
| El frontend no inicia                    | Comprueba `PORT` y `BASE_PATH` en `.env.web`                                                                  |
| La pantalla no actualiza                 | Revisa `/api/healthz`, la consola del navegador y la pestaña Network                                          |
| Hay datos pendientes                     | Abre el indicador de conexión y conserva el navegador con el mismo perfil; las operaciones están en IndexedDB |
| Una prueba falla antes de ejecutar casos | Configura `DATABASE_URL`; el módulo de base de datos falla al cargarse sin ella                               |

---

## 6. 🗄️ Las bases de datos — por qué hay 3

Para reducir el riesgo de pérdida de información, el respaldo se guarda localmente y puede replicarse en Aiven y Cloudflare R2:

```
┌─────────────────────────────────────┐
│  1️⃣ SUPABASE — la principal          │
│  Aquí es donde el sistema lee y      │
│  escribe todos los días              │
└─────────────────────────────────────┘
              │
              │  al correr: pnpm run backup
              ▼
┌──────────────────────┐   ┌──────────────────────┐
│ 2️⃣ AIVEN              │   │ 3️⃣ CLOUDFLARE R2      │
│ Una copia completa,   │   │ Un archivo de respaldo│
│ lista para usar si    │   │ guardado como archivo │
│ Supabase falla        │   │ comprimido             │
└──────────────────────┘   └──────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ 4️⃣ TU COMPUTADOR                     │
│ También queda una copia local del   │
│ archivo, por si acaso                │
└─────────────────────────────────────┘
```

### 6.1 Configurar Supabase (la base de datos principal)

1. Crea una cuenta gratis en **[supabase.com](https://supabase.com)** y crea un proyecto nuevo.
2. Ve a **Project Settings → Database → Connection string** y elige la opción **"Session pooler"** (no la de "Direct connection" — esa no funciona bien desde redes colombianas normales).
3. Copia esa dirección y pégala como `DATABASE_URL` en tu archivo `.env.api`.
4. Corre `pnpm run db:push` para crear las tablas.

### 6.2 Configurar Aiven (la copia de respaldo completa)

1. Crea cuenta en **[console.aiven.io](https://console.aiven.io)**.
2. Crea un servicio de tipo **PostgreSQL**, plan gratis (o el de $5/mes si quieres que nunca se pause).
3. Copia el **"Service URI"** y pégalo como `AIVEN_DATABASE_URL` en `.env.backup`.

### 6.3 Configurar Cloudflare R2 (el archivo de respaldo)

1. Crea cuenta en **[dash.cloudflare.com](https://dash.cloudflare.com)**.
2. Ve a **R2 Object Storage** → crea un "bucket" (una carpeta en la nube), por ejemplo `investillo-backups`.
3. Crea una llave de acceso (**API Token**) con permisos de lectura/escritura, solo para ese bucket.
4. Copia los 3 datos que te da (Account ID, Access Key, Secret Key) a `.env.backup`.

### 6.4 Hacer un respaldo

```cmd
pnpm run backup
```

Esto guarda una copia completa en los 3 lugares a la vez. **Recomendado: prográmalo para que corra solo, una vez por semana**, usando el Programador de Tareas de Windows (búscalo en el menú Inicio → "Crear tarea básica" → elige "Semanalmente" → en "Acción" pon el comando `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run backup`).

### 6.5 Restaurar un respaldo

La restauración es una operación administrativa y puede sobrescribir datos. Antes de hacerla:

1. Detén el sistema para que nadie escriba durante la restauración.
2. Conserva una copia del estado actual y verifica que el archivo corresponde a la base de datos correcta.
3. Usa `pg_restore` para archivos de respaldo en formato custom o el procedimiento indicado por el proveedor de PostgreSQL.
4. Ejecuta `pnpm run verificar` y comprueba manualmente inventario, ventas, clientes y créditos.

No ejecutes comandos destructivos de restauración sobre producción sin confirmar la base de datos destino y tener una copia adicional.

### 6.6 Verificar referencias de la base de datos

El esquema debe declarar claves foráneas cuando la relación y la política de borrado estén definidas. Antes de agregarlas a una base existente, ejecuta:

```cmd
pnpm run verificar
```

El script revisa referencias huérfanas en vehículos, compras, líneas y abonos de créditos, distribuciones de mano de obra y pagos de seguro. Si encuentra resultados, corrígelos o decide cómo conservarlos antes de ejecutar `pnpm run db:push`. No se recomienda añadir `CASCADE` a todas las tablas: las compras, ventas e historiales pueden ser datos contables que deben conservarse.

### 6.7 Inventario: exportar, corregir y volver a subir con vista previa

Para corregir muchos productos a la vez (por ejemplo, cuadrar el stock de Local/Bodega de todo el inventario), Inventario tiene un flujo pensado para volúmenes grandes (probado con casi 3.000 productos a la vez):

1. **"Exportar Inventario"** descarga un Excel con **todos** los productos y **todos** los campos (nombre, marca, tipo, referencia, precios, IVA, Stock Local, Stock Bodega, stock mínimo).
2. Corriges lo que necesites en el Excel — **una celda vacía significa "no tocar ese campo"**, así que solo hace falta escribir lo que realmente quieres cambiar.
3. **"Importar y Revisar Cambios"** sube el archivo completo (sin límite de filas) y compara contra la base de datos — pero **no cambia nada todavía**.
4. Se abre una vista previa mostrando, producto por producto, exactamente qué campo cambiaría y de qué valor a cuál (ej. "Stock Local: 10 → 45"), además de cuáles productos son nuevos.
5. Solo al darle **"Aplicar cambios"** se actualiza la base de datos, de una sola vez.

El botón **"Importar Excel"** (el original, más simple) sigue disponible aparte, para cuando solo necesitas subir/corregir cantidades rápido sin revisar cambio por cambio.

---

## 7. 🏢 Usarlo día a día en la oficina (Modo producción local)

Cuando ya no estás programando, sino simplemente **usando** el sistema en el negocio, no uses `pnpm run dev` ni `pnpm run start:prod`. En esta computadora usa PostgreSQL local:

```cmd
pnpm run start:local
```

Esto compila el sistema y lo deja funcionando como **un solo programa**, disponible en `http://localhost:8080` (o el puerto definido en `.env.local`). `pnpm run start:prod` queda reservado para un entorno que deba usar `.env.api` y la base remota.

### Preparar esta computadora para trabajar varios días sin internet

La instalación local usa PostgreSQL en este computador. Esto evita que las operaciones normales dependan de Supabase durante un corte, pero **todavía no significa que la sincronización con Supabase esté terminada**: esa sincronización se incorporará después de migrar todas las escrituras al registro de operaciones.

#### Qué significa cada variable

- `DATABASE_URL` es una conexión de PostgreSQL. En `.env.local` apunta a la base instalada en este computador, por ejemplo `localhost:5432/investillo_local`.
- `SYNC_REMOTE_API_URL` **no** es una conexión de PostgreSQL y **no** es una URL de Supabase. Es la dirección HTTP del sistema/API publicado en Render, normalmente con `/api` al final, por ejemplo `https://investillo.onrender.com/api`.
- La conexión de Supabase permanece en `.env.api` como `DATABASE_URL` para el servidor remoto y en `.env.backup` como `SOURCE_DATABASE_URL` para los respaldos.
- Nunca pongas la contraseña de Supabase en `SYNC_REMOTE_API_URL`.

1. Confirma que el servicio **postgresql-x64-17** esté iniciado en Windows.
2. Copia `docs\local.env.example` como `.env.local` y cambia:
   - `CAMBIE_ESTA_CONTRASENA` por la contraseña del usuario local `postgres`.
   - `TU-SERVICIO.onrender.com` por el dominio real de Render.
   No compartas `.env.local` ni lo subas a Git.
3. Crea automáticamente la base local desde CMD:
  ```cmd
  pnpm run setup:local
  ```
   El comando se conecta a la base administrativa `postgres`, crea `investillo_local` si no existe y no borra una base existente. Si prefieres hacerlo manualmente, usa `createdb.exe` como se explica más abajo.
4. Crea las tablas en la base local:
  ```cmd
  pnpm run db:push:local
  ```
5. Arranca Investillo localmente:
  ```cmd
  pnpm run start:local
  ```
6. Cuando la conexión vuelva, prueba manualmente la subida con:
  ```cmd
  pnpm run sync:local
  ```
  Para automatizarla, crea una tarea de Windows que ejecute cada 5 minutos `cmd.exe` con estos argumentos:
  `/c cd /d "C:\ruta\investillo" && pnpm run sync:local`.
  La tarea debe usar la misma carpeta del proyecto para encontrar `.env.local`.
  Antes o después puedes revisar la cola con `pnpm run sync:status`. El resultado esperado cuando no hay trabajo pendiente es `Pendientes: 0` y `Con error: 0`. Si Render está caído, `sync:local` termina antes de tocar la cola y deja las operaciones pendientes para otro intento.

  7. Programa también un respaldo local diario con `cmd.exe` y estos argumentos:
    `/c cd /d "C:\ruta\investillo" && pnpm run backup:local`.
    El respaldo queda en `scripts\backups\local` y conserva por defecto 30 días. No guardes la única copia en el mismo disco: copia periódicamente esa carpeta a un USB o disco externo.

El paso 3 crea la **base vacía**. El paso 4 crea las **tablas**. Son cosas distintas. Para que la computadora tenga los datos históricos antes de desconectarla, primero debes importar una copia de la base remota o ejecutar una carga inicial controlada; no empieces a trabajar offline con la base local vacía.

#### Cargar los datos iniciales desde Supabase

Hazlo una sola vez, antes de usar la oficina sin internet y después de tener un respaldo. Este procedimiento copia la base remota completa a la base local; no lo ejecutes mientras haya operaciones locales que quieras conservar.

1. Confirma que `investillo_local` esté creada y que el servicio PostgreSQL esté iniciado.
2. Copia temporalmente la cadena de conexión de Supabase desde `.env.api` en una variable de CMD. No la guardes en el README ni en Git:
  ```cmd
  set "REMOTE_DATABASE_URL=PEGA_AQUI_LA_DATABASE_URL_DE_SUPABASE"
  ```
3. Crea un respaldo remoto:
  ```cmd
  "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --format=custom --no-owner --no-acl --file="backups\supabase-inicial.dump" "%REMOTE_DATABASE_URL%"
  ```
4. Restaura ese respaldo en la base local:
  ```cmd
  "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres --dbname=investillo_local --clean --if-exists --no-owner --no-acl "backups\supabase-inicial.dump"
  ```
5. Ejecuta la verificación contra la base local (el comando raíz `pnpm run verificar` usa `.env.api`, por eso aquí se usa la variante explícita):
  ```cmd
  dotenv -e .env.local -- pnpm --filter @workspace/scripts run verificar
  ```
  Revisa también manualmente productos, clientes, ventas y créditos.
6. Ejecuta `pnpm run backup:local` para conservar una copia de la base local inicial.

Después de esta carga, no vuelvas a restaurar Supabase sobre la base local si ya existen operaciones offline. Para actualizar una base local que ya tiene trabajo propio se usará la sincronización, no una restauración completa.

El acceso directo `investillo.bat` ya exige `.env.local` y usa `start:local`; no arranca accidentalmente contra la base remota. Conserva `.env.api` para las tareas que deban conectarse a Supabase, como verificar o respaldar la base remota.

El trabajo de sincronización se hará en este orden: registro durable de operaciones, migración de todas las escrituras, subida idempotente a Supabase, descarga de cambios y resolución de conflictos. Hasta completar esas etapas, no se debe considerar terminada la operación offline de varios días.

**Estado actual de esta implementación:** PostgreSQL local, creación automática de la base, estructura local, respaldos locales y registro inicial de eventos ya están funcionando. La migración de escrituras y la correspondencia entre IDs locales y remotos todavía se están completando por módulos. Por eso no programes `sync:local` de forma permanente ni borres la base remota pensando que ya existe una réplica completa.

#### Recuperar la base local

Si PostgreSQL local se daña, detén Investillo y conserva la carpeta de respaldos. Lista los archivos `.dump`, elige uno anterior al problema y ejecuta desde CMD:

```cmd
"C:\Program Files\PostgreSQL\17\bin\dropdb.exe" -U postgres --if-exists investillo_local
"C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres investillo_local
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres --dbname=investillo_local --clean --if-exists "scripts\backups\local\ELEGIR_RESPALDO.dump"
```

Después ejecuta `pnpm run verificar` apuntando temporalmente a la base local o usa la misma revisión de consistencia antes de volver a operar. No restaures sobre Supabase con estos comandos.

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
5. **No uses `pnpm run db:push` para la base local**: ese comando usa `.env.api` y puede apuntar a Supabase. Para la oficina usa siempre `pnpm run db:push:local`.

---

## 8. 🌐 Ponerlo en internet, con respaldo (Render + Railway)

Esto permite acceder al sistema desde cualquier lugar con internet (no solo desde el computador de la oficina), con un "plan B" automático si una de las 2 plataformas falla.

### 8.1 Por qué 2 plataformas

- **Render** (principal, ya desplegado y funcionando) — plan gratis, predecible, nunca se apaga por falta de dinero, solo se "duerme" tras 15 minutos sin uso (lo resolvemos en el paso 8.4).
- **Railway** (respaldo) — mismo código, misma base de datos, como segunda entrada por si Render falla.

Ambas usan **la misma base de datos de Supabase de siempre** — nunca se crea una base de datos nueva en la nube.

> 💡 No usamos Vercel para este sistema porque está pensado para otro tipo de aplicaciones (más pequeñas y que se "prenden y apagan" por cada visita) — nuestro sistema es un programa que debe quedarse corriendo todo el tiempo, y Render/Railway están hechos justo para eso.

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
   | `DATABASE_URL` | el mismo de tu `.env.api` |
   | `NODE_ENV` | `production` |
  | `SYNC_CAPTURE_REMOTE` | `true` |
5. Clic en **"Create Web Service"** y espera a que termine — te da una dirección como `https://investillo.onrender.com`.

La dirección que Render entrega, seguida de `/api`, es la que se debe poner en `SYNC_REMOTE_API_URL` del computador local. Ejemplo: si Render entrega `https://investillo.onrender.com`, configura `SYNC_REMOTE_API_URL=https://investillo.onrender.com/api`. No pongas allí `DATABASE_URL`, la URL del pooler de Supabase, ni una URL de Cloudflare o Aiven.

Después de desplegar, prueba desde el navegador:

```text
https://TU-SERVICIO.onrender.com/api/healthz
```

Debe responder con un estado correcto. Si no responde, no programes todavía `sync:local`.

### 8.3 Desplegar en Railway

1. Crea cuenta en **[railway.com](https://railway.com)**.
2. **"New Project"** → **"Deploy from GitHub repo"** → selecciona tu repositorio.
3. En **"Settings"**, configura:
   - **Build Command:** `pnpm install && pnpm run build`
   - **Start Command:** `pnpm --filter @workspace/api-server run start`
4. En **"Variables"**, agrega las mismas 2 variables que en Render.
5. En **"Networking"**, clic en **"Generate Domain"** para obtener tu dirección pública.

> Alternativa sin usar tarjeta de crédito: **Koyeb** también ofrece un servicio web gratis "para siempre" (a diferencia de Railway, que ahora es una prueba de 30 días + $1 de crédito mensual) — pide verificar identidad con una tarjeta, pero no cobra nada mientras te quedes en el plan gratis. El proceso de desplegar es casi idéntico al de Render.

### 8.4 Evitar que Render se "duerma" (funciona incluso en vacaciones)

Crea este archivo en el proyecto: **`.github/workflows/keep-alive.yml`**

```yaml
name: Keep Alive

on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch: {}

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Render
        run: curl -sf https://investillo.onrender.com
      - name: Ping Railway
        run: curl -sf https://investillo-production.up.railway.app
```

(cambia las direcciones por las tuyas reales — si todavía no tienes Railway, borra ese segundo paso)

Súbelo con `git push` — desde ese momento, un robot de GitHub le "toca la puerta" a la(s) dirección(es) cada 10 minutos, todos los días del año, así que nunca llegan a dormirse por inactividad — ni siquiera si el negocio cierra por vacaciones. Si un `curl` falla, ese paso del workflow falla también, y GitHub te manda un correo automático avisando — así te enteras si Render (o Railway) dejó de responder.

### 8.4.1 Revisión de consistencia automática en la nube

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
      - run: corepack enable && corepack prepare pnpm@latest --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm run verificar
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Necesita que guardes tu `DATABASE_URL` como **Secret** del repositorio: **Settings → Secrets and variables → Actions → New repository secret**.

### 8.5 Actualizaciones automáticas

Cada vez que subas cambios nuevos (`git push`), **ambas plataformas se actualizan solas** — no hay que repetir ningún paso.

### 8.6 Rutas y contrato API

Las rutas principales se registran en `artifacts/api-server/src/routes/index.ts`. El contrato OpenAPI cubre los hooks generados, pero algunas rutas de importación, reportes y funciones auxiliares se consumen desde el frontend con `fetch` manual. Después de cambiar una ruta documentada, regenera los clientes con `pnpm --filter @workspace/api-spec codegen` y ejecuta `pnpm run typecheck`.

### 8.7 Reiniciar o reactivar manualmente (cuando algo se pausa o falla)

Estos son los pasos para cuando algo deja de responder y necesitas arreglarlo a mano — por ejemplo, si te llega el correo de alerta del "Keep Alive" avisando que Render o Supabase no respondieron.

#### Supabase se pausó (plan gratis, 7 días sin actividad)

1. Entra a **[supabase.com](https://supabase.com)** e inicia sesión.
2. Abre tu proyecto — vas a ver un aviso de que está "Paused" (pausado).
3. Clic en **"Restore project"** (o "Reanudar proyecto").
4. Espera 1-2 minutos mientras Supabase lo reactiva — después de eso, el sistema vuelve a funcionar normal, sin perder ningún dato (la pausa no borra información, solo apaga el acceso).

#### Render dejó de responder o se quedó "atascado"

1. Entra a **[dashboard.render.com](https://dashboard.render.com)** e inicia sesión.
2. Abre tu servicio (`investillo` o el nombre que le hayas puesto).
3. Si se ve "Suspended" o con un ícono de error: clic en **"Manual Deploy"** (arriba a la derecha) → **"Deploy latest commit"** — esto vuelve a desplegar tu código desde cero, tal como está en GitHub ahora mismo.
4. Si necesitas ver qué pasó exactamente, revisa la pestaña **"Logs"** de ese mismo panel — ahí queda el detalle de cualquier error del servidor.

#### Railway (si ya lo tienes configurado como respaldo)

1. Entra a **[railway.com](https://railway.com)** e inicia sesión.
2. Abre tu proyecto → clic en el servicio.
3. En la pestaña **"Deployments"**, clic en los 3 puntos del despliegue más reciente → **"Redeploy"**.

#### El sistema local (portátil de la oficina) no arrancó solo

1. Revisa el archivo de log que configuramos en el Programador de Tareas (`logs\sistema.txt`) — ahí debería decir por qué falló, si falló.
2. Abre el **Símbolo del sistema (CMD)**, ve a la carpeta del proyecto, y corre `pnpm run start:local` a mano — si arranca bien así, el problema fue puntual (por ejemplo, el equipo tardó en iniciar PostgreSQL o la tarea automática corrió antes de tiempo).
3. Si sigue sin arrancar, revisa que tu archivo `.env.api` siga existiendo y con los datos correctos — es la causa más común de que el sistema no inicie.

#### Aiven se pausó (respaldo, plan gratis, 7 días sin uso)

1. Entra a **[console.aiven.io](https://console.aiven.io)**.
2. Abre el servicio pausado → clic en **"Power on"** (o el botón equivalente para reactivarlo).
3. Esto no afecta tu sistema principal — Aiven es solo la copia de respaldo, así que aunque esté pausada, Investillo sigue funcionando normal desde Supabase.

---

## 9. 🧹 Reiniciar la base de datos antes de empezar de verdad

Todo lo que hay guardado hasta ahora (productos, ventas, trabajadores) fue de **prueba**, mientras se construía el sistema. Antes de usarlo con datos reales del negocio, hay que reiniciar la base.

⚠️ **Esto borra todo permanentemente. No hay forma de deshacerlo. Haz un respaldo antes (`pnpm run backup`) y confirma que estás conectado al proyecto correcto.**

### 9.1 Opción recomendada: vaciar las tablas existentes

Esta opción conserva las tablas y sus permisos. En Supabase, abre **SQL Editor → New query** y ejecuta:

1. Entra a tu proyecto en **[supabase.com](https://supabase.com)**.
2. Ve al menú lateral → **"SQL Editor"** → **"New query"**.
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
  operaciones_sincronizadas,
  notas,
  conteo_monedas
RESTART IDENTITY CASCADE;
```

4. Confirma que se ejecutó sin errores (mensaje verde de éxito).
5. Abre el sistema — todas las listas deberían aparecer vacías, listas para empezar con información real.

**¿Qué significa cada palabra del comando?**

- `TRUNCATE TABLE` → "vacía estas tablas por completo".
- `RESTART IDENTITY` → "vuelve a poner el contador de números en 1" (el próximo producto que crees será el #1, no el #847 de las pruebas).
- `CASCADE` → limpia también cualquier cosa que dependiera de esos datos, para no dejar nada "suelto".

Si quieres conservar algo (por ejemplo, si ya cargaste trabajadores reales), quita esa tabla de la lista antes de ejecutar.

### 9.2 Recrear completamente el esquema `public`

Usa esta opción únicamente si quieres eliminar también tablas, índices, secuencias y restricciones creadas anteriormente. **No ejecutes `DROP DATABASE`**: Supabase mantiene la conexión a la base activa y el usuario de la aplicación normalmente no puede eliminarla.

En el SQL Editor, ejecuta:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
```

Después, desde la carpeta raíz del proyecto, con `.env.api` apuntando a esa misma base:

```cmd
pnpm install
pnpm run db:push
```

`db:push` lee `DATABASE_URL` desde `.env.api`, usa `lib/db/src/schema/index.ts` y crea las tablas definidas en los archivos de `lib/db/src/schema`. No uses `push-force` como primera opción; solo debe utilizarse después de revisar el cambio que Drizzle propone.

### 9.3 Comprobar que la recreación terminó bien

En Supabase puedes comprobar las tablas con:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Luego, desde el proyecto, ejecuta:

```cmd
pnpm run verificar
pnpm run typecheck
pnpm run build
```

`pnpm run verificar` necesita `DATABASE_URL` y revisa datos inconsistentes y referencias huérfanas. Si la base está recién creada, debe terminar sin registros problemáticos.

---

## 10. 🚧 Cosas que el sistema todavía NO hace

Para que sepas qué esperar y qué no, por ahora:

- Solo está probado en **Windows**, usando la terminal **CMD** (no PowerShell ni Git Bash).
- Las herramientas `pg_dump`/`pg_restore` que instalas localmente deben ser versión 17 o más nueva (la misma que usa Supabase).
- **No existe integración con contabilidad formal (PUC/NIIF) ni facturación electrónica DIAN** — se decidió, por ahora, que el sistema se enfoque solo en control interno.
- La base PostgreSQL local y el arranque local ya están implementados para operar varios días sin internet. La sincronización completa todavía se está ampliando por módulos y debe probarse contra el API remoto antes de declararla lista para producción.
- El sistema hoy solo tiene **Render** desplegado en la nube — Railway o Koyeb como segunda plataforma de respaldo quedaron analizados pero sin implementar (no es urgente: el portátil local conecta directo a Supabase, sin depender de Render para nada).
- El plan gratis de Aiven se pausa si pasan 7 días sin usarlo — si el respaldo automático deja de correr por más de una semana, toca reactivarlo a mano.
- La importación masiva de clientes detecta duplicados por nombre y por teléfono (compara solo los dígitos, sin importar el formato) — si un número ya está en uso, esa fila queda separada para revisión manual, no se omite en silencio. Correo no se valida contra duplicados.
- El outbox transaccional ya cubre clientes, vehículos, productos, ventas y reordenamiento, mano de obra, créditos y abonos, compras individuales y por lote, notas, remachadas, trabajadores y pagos de seguro, cierres, grupos, conteo de monedas, calculadora, historiales, edición de nómina, obra electrónica, tensionadas e importaciones procesadas de clientes e inventario. Las importaciones se convierten a filas JSON para sincronizarse sin transportar archivos binarios. La descarga de cambios remotos usa `/api/sync/pull` y el comando `pnpm run sync:pull`; aún requiere pruebas de extremo a extremo.
- Si una operación recibe un error del servidor, queda marcada como error con el mensaje y número de intentos. El panel **Copia local** permite reactivarla y reintentarla; no debe asumirse que fue aplicada hasta comprobarlo.
- No hay pruebas automáticas de integración que levanten PostgreSQL por sí solas; las pruebas del API necesitan una `DATABASE_URL` válida.
- El contrato OpenAPI y las rutas implementadas no son idénticos: las funciones que usan `fetch` manual deben probarse además de ejecutar el codegen.
- La PWA usa `BASE_PATH` para `base`, `start_url`, `scope` y `navigateFallback`. Para desplegar bajo una subruta, configura esa variable durante el build y verifica que el proxy publique `/api` en la misma URL esperada por el frontend.

---

## 11. ✅ Consejos para que todo funcione bien

- Antes de operar con datos reales, considera subir **Supabase al plan Pro ($25 USD/mes)** — el plan gratis no incluye respaldos automáticos propios y se pausa por inactividad.
- Programa `pnpm run backup` para que corra **automáticamente cada semana**.
- Después de un cambio importante, ejecuta `pnpm run typecheck` y `pnpm run build` antes de reiniciar producción.
- **No borres "Cookies y datos de sitios"** del navegador en el computador principal — ahí es donde vive la información guardada mientras no hay internet. Borrar solo el historial de navegación sí es seguro.
- Si aparece una operación pendiente, no borres los datos del sitio ni reinstales el navegador hasta confirmar si ya se sincronizó o si debes exportar una copia local.
- Usa el botón **"Guardar copia local"** de la barra superior antes de apagar el equipo, si trabajaste sin conexión y no alcanzaste a confirmar que sincronizó.
- Antes de construir cualquier módulo de contabilidad en el futuro, **defínelo primero con un contador certificado** — evita errores costosos de mapeo frente a la DIAN.

---

## 12. 💰 Referencia de costos

> Esta sección es informativa, no una cotización formal — los valores reales dependen de cómo crezca el uso del sistema.

| Servicio      | Plan actual              | Costo  | ¿Cuándo subir de plan?                                                   |
| ------------- | ------------------------ | ------ | ------------------------------------------------------------------------ |
| Supabase      | Free                     | $0/mes | Al operar con datos reales → **Pro: $25 USD/mes**                        |
| Aiven         | Free                     | $0/mes | Para que nunca se pause → **Developer: $5 USD/mes**                      |
| Cloudflare R2 | Free (10 GB)             | $0/mes | Si algún día se supera 10 GB de respaldos (poco probable en varios años) |
| Render        | Free                     | $0/mes | Si necesitas que nunca tarde en "despertar" → planes desde ~$7 USD/mes   |
| Railway       | Free ($1 de crédito/mes) | $0/mes | Si el uso supera el crédito gratis → **Hobby: $5 USD/mes**               |

**Estimado mensual con todo en plan gratis:** $0. **Estimado si se sube todo a planes pagos de tranquilidad:** ~$35-40 USD/mes aprox.

---

_Documento actualizado como parte de la documentación técnica del proyecto Investillo._