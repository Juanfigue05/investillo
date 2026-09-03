# 📦 Investillo

**Investillo** es un sistema para llevar el control de un negocio: qué productos hay en la bodega, qué se vende cada día, quién debe dinero, qué se compra, cuánto se le paga a cada trabajador, y mucho más — todo en un solo lugar, sin necesidad de cuadernos ni hojas de Excel sueltas.

Funciona incluso **sin conexión a internet** (los datos se guardan en el computador y se sincronizan solos cuando vuelve la señal), y se puede **instalar como una app** en Windows, con su propio ícono, como si fuera un programa normal.

---

## 🗺️ Tabla de contenidos

1. [¿Qué hace cada página del sistema?](#1--qué-hace-cada-página-del-sistema)
2. [Autor](#2-autor)
3. [¿Con qué está construido? (para curiosos)](#3--con-qué-está-construido-para-curiosos)
4. [Instalar el sistema desde cero](#4--instalar-el-sistema-desde-cero)
5. [Comandos que vas a usar seguido](#5--comandos-que-vas-a-usar-seguido)
6. [Las bases de datos — por qué hay 3](#6--las-bases-de-datos--por-qué-hay-3)
7. [Usarlo día a día en la oficina (Modo producción)](#7--usarlo-día-a-día-en-la-oficina-modo-producción)
8. [Ponerlo en internet, con respaldo (Render + Railway)](#8--ponerlo-en-internet-con-respaldo-render--railway)
9. [Limpiar la base de datos antes de empezar de verdad](#9--limpiar-la-base-de-datos-antes-de-empezar-de-verdad)
10. [Cosas que el sistema todavía NO hace](#10--cosas-que-el-sistema-todavía-no-hace)
11. [Consejos para que todo funcione bien](#11--consejos-para-que-todo-funcione-bien)
12. [Referencia de costos](#12--referencia-de-costos)

---

## 1. 🧭 ¿Qué hace cada página del sistema?

Cuando abres Investillo, en el lado izquierdo de la pantalla ves un menú. Aquí te explico qué hace cada opción, como si nunca lo hubieras visto:

| Página | ¿Para qué sirve? |
|---|---|
| 📊 **Dashboard** | La pantalla principal — un resumen rápido: cuánto se vendió hoy, cuánto deben los clientes, cuánto se ha comprado, y una gráfica de ventas. |
| 🚚 **Compras** | Aquí registras qué le compraste a tus proveedores, y cuándo llegó la mercancía a la bodega. El stock del producto sube automáticamente. |
| 🛒 **Ventas Diarias** | Aquí anotas cada venta del día — qué se vendió, a cómo, y cómo te pagaron (efectivo o a una cuenta bancaria). El stock del producto baja automáticamente. |
| 💳 **Créditos** | Para cuando un cliente se lleva algo y paga después. Aquí llevas el control de cuánto debe y cuándo va abonando. |
| 🤝 **Nos Debe** | Igual que Créditos, pero para cuando es el negocio el que le debe/fía algo a alguien más. |
| 📦 **Inventario** | La lista completa de todos tus productos: cuántos hay, a cómo los compras, a cómo los vendes. También tiene una pestaña aparte para las "Remachadas" (precio de remachar bandas). |
| 🧮 **Cierre Diario** | Al final del día, aquí calculas cuánto le toca pagar a cada trabajador (según lo que trabajó, el seguro que se le descuenta, etc.), y armas el conteo de caja (monedas y billetes). |
| 👥 **Clientes** | La lista de tus clientes, con sus datos y los vehículos que tengan registrados. |
| 📖 **Historial de Ventas** | Guarda el resumen de días de venta pasados, para consultarlos cuando quieras. |
| 🕐 **Historial Cierres** | Lo mismo, pero de los Cierres Diarios que ya guardaste. |
| 📈 **Historial de Precios** | Una gráfica que muestra cómo han subido o bajado los precios de compra con el tiempo. |
| 🔧 **Trabajadores** | El perfil de cada trabajador: su seguro social, si se le descuenta o no, y cuánto le deben. |

### La "Calculadora de Cierre"

Hay un botón con un ícono de calculadora en la barra de arriba (visible desde cualquier página) — se usa para cuadrar la caja del día: sumar lo que entró, restar lo que se pagó por fuera, contar monedas y billetes, y ver si "cuadra" con lo esperado.

---

## 2. Autor

| | |
|---|---|
| **Rol** | Propietario / Product Owner / Desarrollador |
| **Nombre** | Juan David Figueroa |
| **Contacto** | +57 314 537 0182 |

---

## 3. 🛠️ ¿Con qué está construido? (para curiosos)

No necesitas entender esto para usar el sistema — es información para quien quiera dar mantenimiento al código más adelante.

Investillo es un **monorepo** (varios proyectos relacionados guardados juntos en una sola carpeta):

| Parte | Dónde está | Qué es, en simple |
|---|---|---|
| `gestion` | `artifacts/gestion` | Lo que ves en pantalla (el "frontend") — hecho con React, Vite y Tailwind CSS. |
| `api-server` | `artifacts/api-server` | El "cerebro" que atiende las peticiones y habla con la base de datos (el "backend") — hecho con Node.js y Express. |
| `db` | `lib/db` | La definición de cómo se guardan los datos — usa una herramienta llamada Drizzle ORM. |
| `scripts` | `scripts/` | Programas de apoyo, como el que hace los respaldos automáticos. |

Todo el código está escrito en **TypeScript** (una versión de JavaScript que ayuda a detectar errores antes de que pasen).

**La base de datos es PostgreSQL**, alojada en 3 lugares distintos por seguridad (ver sección 6).

### Tareas automáticas recomendadas (Programador de Tareas de Windows)

| Tarea | Frecuencia | Comando (en "Acción" → "Iniciar un programa") |
|---|---|---|
| Respaldo + verificación | Semanal | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run backup >> backups\log.txt 2>&1` |
| Revisión de consistencia | Diaria | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run verificar >> logs\consistencia.txt 2>&1` |
| Limpieza de operaciones viejas | Mensual | `cmd.exe /c cd /d "C:\ruta\investillo" && pnpm run limpiar-operaciones >> logs\limpieza.txt 2>&1` |
| Inicio automático del sistema local | Al iniciar sesión | Ver abajo — versión más confiable que un simple acceso directo |

**Inicio automático más confiable (en vez de solo la carpeta de Inicio):**
1. Abre **Programador de tareas** → **Crear tarea básica** → nombre `Iniciar Investillo`.
2. Desencadenador: **Al iniciar sesión**.
3. Acción → Programa: `cmd.exe` → Argumentos: `/c cd /d "C:\ruta\investillo" && pnpm run start:prod >> logs\sistema.txt 2>&1`
4. En **Propiedades** de la tarea (después de crearla) → pestaña **General** → marca **"Ejecutar tanto si el usuario inició sesión como si no"** — así arranca incluso si nadie ha entrado a Windows todavía.

Esto es más confiable que un acceso directo en la carpeta de Inicio porque **queda registrado en un log** si algo falla al arrancar, en vez de fallar en silencio.

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
git clone https://github.com/juanfigue05/investillo.git
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
Esto abre el sistema en tu navegador, normalmente en `http://localhost:5173`.

---

## 5. ⌨️ Comandos que vas a usar seguido

Todos se escriben en el **Símbolo del sistema (CMD)**, estando dentro de la carpeta del proyecto.

| Comando | Qué hace |
|---|---|
| `pnpm install` | Descarga/actualiza todas las piezas necesarias del proyecto |
| `pnpm run dev` | Corre el sistema en modo "estoy programando" (se actualiza solo cuando cambias código) |
| `pnpm run start:prod` | Corre el sistema en modo "uso normal del negocio" (más rápido y estable — ver sección 7) |
| `pnpm run db:push` | Actualiza la estructura de la base de datos según lo definido en el código |
| `pnpm run backup` | Hace una copia de seguridad completa de la base de datos, en 3 lugares distintos |
| `pnpm run build` | Prepara el código para producción (lo "compila") |

---

## 6. 🗄️ Las bases de datos — por qué hay 3

Para que nunca se pierda información, aunque uno de los servicios falle, usamos **3 lugares distintos** para guardar los datos:

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

---

## 7. 🏢 Usarlo día a día en la oficina (Modo producción)

Cuando ya no estás programando, sino simplemente **usando** el sistema en el negocio, no uses `pnpm run dev` — usa esto, que es más liviano y estable:

```cmd
pnpm run start:prod
```

Esto compila el sistema y lo deja funcionando como **un solo programa**, disponible en `http://localhost:8080` (o el puerto que hayas puesto en `.env.api`).

### Crear un acceso directo para no escribir el comando cada vez

1. En el Escritorio, crea un archivo nuevo llamado `Iniciar Investillo.bat`.
2. Ábrelo con el Bloc de notas y pega esto (cambiando la ruta por la real):
   ```bat
   @echo off
   cd /d "C:\Users\TuUsuario\Documents\investillo"
   pnpm run start:prod
   ```
3. Guarda. Desde ahora, con doble clic en ese archivo arranca todo el sistema.

### Instalarlo como si fuera una app de Windows

Con el sistema corriendo, ábrelo en Google Chrome o Microsoft Edge — en la barra de direcciones (o en una tarjeta dentro del propio Dashboard) va a aparecer la opción **"Instalar aplicación"**. Al instalarlo, se abre en su propia ventana, con su propio ícono, sin verse como una página web — funciona como cualquier otro programa de Windows.

### Que arranque solo al prender el computador

1. Presiona `Win + R`, escribe `shell:startup` y da Enter.
2. Copia ahí un acceso directo del archivo `.bat` que creaste arriba.

### Pasar el sistema a otro computador (por ejemplo, el de la oficina)

1. Repite los Pasos 1 a 5 de la sección 4 en ese computador.
2. En vez de crear los archivos `.env` desde cero, **copia los 3 que ya tienes** (`.env.api`, `.env.web`, `.env.backup`) desde tu computador actual, usando una USB. Así te aseguras de que se conecte a la misma base de datos, sin errores de tipeo.
3. Corre `pnpm install` y luego `pnpm run start:prod`.
4. **No hace falta correr `pnpm run db:push` de nuevo** — las tablas ya existen, ese comando solo se usa si cambia la estructura de la base de datos.

---

## 8. 🌐 Ponerlo en internet, con respaldo (Render + Railway)

Esto permite acceder al sistema desde cualquier lugar con internet (no solo desde el computador de la oficina), con un "plan B" automático si una de las 2 plataformas falla.

### 8.1 Por qué 2 plataformas

- **Render** (principal) — plan gratis, predecible, nunca se apaga por falta de dinero, solo se "duerme" tras 15 minutos sin uso (lo resolvemos en el paso 8.3).
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
5. Clic en **"Create Web Service"** y espera a que termine — te da una dirección como `https://investillo.onrender.com`.

### 8.3 Desplegar en Railway

1. Crea cuenta en **[railway.com](https://railway.com)**.
2. **"New Project"** → **"Deploy from GitHub repo"** → selecciona tu repositorio.
3. En **"Settings"**, configura:
   - **Build Command:** `pnpm install && pnpm run build`
   - **Start Command:** `pnpm --filter @workspace/api-server run start`
4. En **"Variables"**, agrega las mismas 2 variables que en Render.
5. En **"Networking"**, clic en **"Generate Domain"** para obtener tu dirección pública.

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
        run: curl -sf https://investillo.onrender.com || echo "Render no respondió"
```
(cambia las 2 direcciones por las tuyas reales)

Súbelo con `git push` — desde ese momento, un robot de GitHub le "toca la puerta" a ambas direcciones cada 10 minutos, todos los días del año, así que nunca llegan a dormirse por inactividad — ni siquiera si el negocio cierra por vacaciones.

### 8.5 Actualizaciones automáticas

Cada vez que subas cambios nuevos (`git push`), **ambas plataformas se actualizan solas** — no hay que repetir ningún paso.

---

## 9. 🧹 Limpiar la base de datos antes de empezar de verdad

Todo lo que hay guardado hasta ahora (productos, ventas, trabajadores) fue de **prueba**, mientras se construía el sistema. Antes de usarlo con datos reales del negocio, hay que vaciarlo.

⚠️ **Esto borra todo permanentemente. No hay forma de deshacerlo. Haz un respaldo antes (`pnpm run backup`) por si acaso.**

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
  notas
RESTART IDENTITY CASCADE;
```

4. Confirma que se ejecutó sin errores (mensaje verde de éxito).
5. Abre el sistema — todas las listas deberían aparecer vacías, listas para empezar con información real.

**¿Qué significa cada palabra del comando?**
- `TRUNCATE TABLE` → "vacía estas tablas por completo".
- `RESTART IDENTITY` → "vuelve a poner el contador de números en 1" (el próximo producto que crees será el #1, no el #847 de las pruebas).
- `CASCADE` → limpia también cualquier cosa que dependiera de esos datos, para no dejar nada "suelto".

Si quieres conservar algo (por ejemplo, si ya cargaste trabajadores reales), simplemente quita esa tabla de la lista antes de ejecutar.

---

## 10. 🚧 Cosas que el sistema todavía NO hace

Para que sepas qué esperar y qué no, por ahora:

- Solo está probado en **Windows**, usando la terminal **CMD** (no PowerShell ni Git Bash).
- Las herramientas `pg_dump`/`pg_restore` que instalas localmente deben ser versión 17 o más nueva (la misma que usa Supabase).
- **No existe integración con contabilidad formal (PUC/NIIF) ni facturación electrónica DIAN** — se decidió, por ahora, que el sistema se enfoque solo en control interno.
- La **app de escritorio** (para seguir funcionando varios días sin ninguna conexión a internet) todavía está en diseño, no construida — hoy el modo sin conexión cubre cortes de horas, no de varios días seguidos.
- El plan gratis de Aiven se pausa si pasan 7 días sin usarlo — si el respaldo automático deja de correr por más de una semana, toca reactivarlo a mano.
- La importación masiva de clientes detecta duplicados solo por nombre, no por teléfono o correo.

---

## 11. ✅ Consejos para que todo funcione bien

- Antes de operar con datos reales, considera subir **Supabase al plan Pro ($25 USD/mes)** — el plan gratis no incluye respaldos automáticos propios y se pausa por inactividad.
- Programa `pnpm run backup` para que corra **automáticamente cada semana**.
- **No borres "Cookies y datos de sitios"** del navegador en el computador principal — ahí es donde vive la información guardada mientras no hay internet. Borrar solo el historial de navegación sí es seguro.
- Usa el botón **"Guardar copia local"** de la barra superior antes de apagar el equipo, si trabajaste sin conexión y no alcanzaste a confirmar que sincronizó.
- Antes de construir cualquier módulo de contabilidad en el futuro, **defínelo primero con un contador certificado** — evita errores costosos de mapeo frente a la DIAN.

---

## 12. 💰 Referencia de costos

> Esta sección es informativa, no una cotización formal — los valores reales dependen de cómo crezca el uso del sistema.

| Servicio | Plan actual | Costo | ¿Cuándo subir de plan? |
|---|---|---|---|
| Supabase | Free | $0/mes | Al operar con datos reales → **Pro: $25 USD/mes** |
| Aiven | Free | $0/mes | Para que nunca se pause → **Developer: $5 USD/mes** |
| Cloudflare R2 | Free (10 GB) | $0/mes | Si algún día se supera 10 GB de respaldos (poco probable en varios años) |
| Render | Free | $0/mes | Si necesitas que nunca tarde en "despertar" → planes desde ~$7 USD/mes |
| Railway | Free ($1 de crédito/mes) | $0/mes | Si el uso supera el crédito gratis → **Hobby: $5 USD/mes** |

**Estimado mensual con todo en plan gratis:** $0. **Estimado si se sube todo a planes pagos de tranquilidad:** ~$35-40 USD/mes aprox.

---

*Documento actualizado como parte de la documentación técnica del proyecto Investillo.*