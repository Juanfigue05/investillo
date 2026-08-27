# Investillo

Sistema de gestión para negocio (inventario, ventas diarias, créditos, "Nos Debe", compras, mano de obra, trabajadores/seguro social, cierre diario, clientes e historial) con capacidad de funcionamiento offline y respaldo en múltiples proveedores en la nube.

---

## Tabla de contenidos

1. [Autores](#1-autores)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Instalación y requisitos](#3-instalación-y-requisitos)
4. [Comandos disponibles](#4-comandos-disponibles)
5. [Bases de datos — arquitectura de 3 capas](#5-bases-de-datos--arquitectura-de-3-capas)
6. [Despliegue en producción](#6-despliegue-en-producción)
7. [Restricciones del sistema](#7-restricciones-del-sistema)
8. [Recomendaciones](#8-recomendaciones)
9. [Cotización de referencia](#9-cotización-de-referencia)

---

## 1. Autores

|   Rol      | Propietario / Product Owner / Desarrollador |
|   Nombre   | Juan David Figueroa |
|   Contacto | +57 314 537 0182 |

---

## 2. Stack tecnológico

Investillo es un **monorepo pnpm** con 4 áreas principales:

| Paquete | Ruta | Descripción |
|-------------------|-----------------------|-----------------------------------------------------------------------|
| `gestion`         | `artifacts/gestion`   | Frontend — React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui    |
| `api-server`      | `artifacts/api-server`| Backend — Node.js + Express + TypeScript                              |
|   `db`            | `lib/db`              | Esquema y acceso a datos — Drizzle ORM + PostgreSQL                   |
|`api-spec`,`api-client-react`,`api-zod`     |          `lib/`       | Contrato de API generado (OpenAPI + Orval) y validación (Zod)         |
| `scripts`         | `scripts/`            | Scripts utilitarios (respaldo de base de datos, etc.)                 |

**Lenguaje:** TypeScript en todo el stack (frontend, backend y librerías compartidas).

**Base de datos:** PostgreSQL (ver sección 5 para la arquitectura de 3 proveedores).

**Gestor de paquetes:** pnpm (con workspaces).

**Otras librerías clave:**
- `drizzle-orm` / `drizzle-kit` — ORM y migraciones de esquema.
- `@tanstack/react-query` — manejo de estado del servidor en el frontend.
- `xlsx` — lectura/escritura de plantillas Excel (importación de productos y clientes).
- `idb` — capa de almacenamiento local (IndexedDB) para el modo sin conexión.
- `concurrently` + `dotenv-cli` — arranque simultáneo de frontend y backend en desarrollo.
- `@aws-sdk/client-s3` — subida de respaldos a Cloudflare R2 (compatible con API S3).

---

## 3. Instalación y requisitos

### 3.1 Requisitos previos (Windows)

| Herramienta | Versión | Uso |
|-----------------------------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| Node.js                           | 24.x                          | Runtime de JavaScript/TypeScript                                                                                          |
| pnpm                              | última (vía Corepack)         | Gestor de paquetes del monorepo                                                                                           |
| Git para Windows                  | última                        | Control de versiones                                                                                                      |
| PostgreSQL (Command Line Tools)   | **17.x**                      | `pg_dump` / `pg_restore` — debe ser igual o más nueva que la versión del servidor remoto (Supabase corre PostgreSQL 17)   |
| Terminal                          | **CMD (Símbolo del sistema)** | Este proyecto se desarrolla y prueba en CMD — no se usa PowerShell ni Git Bash para correr los scripts del monorepo       |

### 3.2 Pasos de instalación

```cmd
git clone https://github.com/Juanfigue05/investillo.git
cd investillo
pnpm install
```


### 3.3 Variables de entorno necesarias

El proyecto usa 3 archivos de entorno en la raíz (ninguno se sube al repositorio — están en `.gitignore`):

**`.env.api`** — usado por el backend (`api-server`):
```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
PORT=8080
NODE_ENV=development
```
> Se usa el **Session Pooler** de Supabase (no la conexión directa), porque la conexión directa de Supabase solo resuelve por IPv6, y muchas redes locales en Colombia no lo soportan.

**`.env.web`** — usado por el frontend (`gestion`):
```
PORT=5173
BASE_PATH=/
```

**`.env.backup`** — usado por el script de respaldo (ver sección 5):
```
SOURCE_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
AIVEN_DATABASE_URL=postgresql://avnadmin:<password>@<servicio>.aivencloud.com:<puerto>/defaultdb?sslmode=require
R2_ACCOUNT_ID=<account_id>
R2_ACCESS_KEY_ID=<access_key>
R2_SECRET_ACCESS_KEY=<secret_key>
R2_BUCKET=investillo-backups
PG_BIN_PATH=C:\Program Files\PostgreSQL\17\bin
```

### 3.4 Base de datos — primera vez

```cmd
pnpm run db:push
```
Esto lee el esquema definido en `lib/db/src/schema/*.ts` y crea/actualiza todas las tablas directamente en la base de datos apuntada por `DATABASE_URL` en `.env.api`.

---

## 3.5 Instalación local paso a paso (checklist detallado)

Esta es la guía completa para dejar el sistema corriendo desde cero en un computador con Windows que nunca lo ha tenido instalado.

### Paso 1 — Instalar Node.js 24

1. Ve a https://nodejs.org/en/download y descarga el instalador `.msi` de la versión **24.x**.
2. Ejecuta el instalador dejando todo en su configuración por defecto.
3. Abre **Símbolo del sistema (CMD)** y verifica:
```cmd
   node -v
```
   Debe responder `v24.x.x`.

### Paso 2 — Activar pnpm (viene incluido con Node 24 vía Corepack)

```cmd
npm install -g pnpm
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

### Paso 3 — Instalar Git para Windows

1. Descarga desde https://git-scm.com/download/win.
2. Durante la instalación, deja marcada la opción **"Git from the command line and also from 3rd-party software"**.
3. No hace falta usar Git Bash para nada de este proyecto — todo se corre desde CMD.

### Paso 4 — (Opcional) Instalar las herramientas de línea de comandos de PostgreSQL 17

Solo necesario si este computador va a **ejecutar los respaldos** (`pnpm run backup`). Si el equipo solo va a usar la aplicación día a día, puedes saltar este paso.

1. Descarga desde https://www.postgresql.org/download/windows/, elige la versión **17.x**.
2. En "Select Components", **desmarca** "PostgreSQL Server" y "pgAdmin 4" — deja marcado únicamente **"Command Line Tools"**.
3. Instala en la ruta por defecto (`C:\Program Files\PostgreSQL\17\`).

### Paso 5 — Configurar VS Code para usar CMD (no PowerShell ni Git Bash)

1. Abre VS Code → `Ctrl+Shift+P` → escribe **"Terminal: Select Default Profile"** → selecciona **Command Prompt**.
2. Cierra cualquier terminal abierta y abre una nueva (`` Ctrl+` ``) — confirma que el prompt no tenga el prefijo `PS`.

### Paso 6 — Clonar el proyecto e instalar dependencias

```cmd
cd C:\Users\TuUsuario\Documents
git clone https://github.com/juanfigue/investillo.git
cd investillo
pnpm install
```

### Paso 7 — Crear los 3 archivos de entorno en la raíz del proyecto

Créalos desde VS Code (Explorer → clic derecho en la carpeta raíz → New File), **no** desde el Bloc de notas de Windows (para evitar que quede con extensión `.txt` oculta).

**`.env.api`**
**`.env.web`**
**`.env.backup`** (solo si este equipo hará respaldos)


Reemplaza cada `<valor>` con los datos reales de tu proyecto de Supabase/Aiven/Cloudflare (ver sección 5).

### Paso 8 — Aplicar el esquema de base de datos (solo la primera vez, o si el esquema cambió)

```cmd
pnpm run db:push
```

### Paso 9 — Elegir cómo correrlo

- **Para desarrollo** (editando código, con recarga en caliente): `pnpm run dev`
- **Para uso diario del negocio** (más liviano y estable): ver sección 6.0 "Modo producción" más abajo.

---

## 4. Comandos disponibles

Todos se ejecutan desde la raíz del proyecto, en **CMD**.

| Comando               | Qué hace                                                                                      |
|-----------------------|-----------------------------------------------------------------------------------------------|
| `pnpm install`        | Instala todas las dependencias del monorepo                                                   |
| `pnpm run dev`        | Arranca backend + frontend juntos en una sola terminal (con recarga en caliente del frontend) |
| `pnpm run start:prod` | Arranca backend + frontend juntos en modo produccion                                          |
| `pnpm run db:push`    | Sincroniza el esquema de Drizzle con la base de datos apuntada en `.env.api`                  |
| `pnpm run backup`     | Ejecuta el respaldo de 3 capas: Supabase → archivo local → Aiven → Cloudflare R2              |
| `pnpm run build`      | Compila typecheck + build de producción de todos los paquetes                                 |
| `pnpm run typecheck`  | Verifica tipos de TypeScript en todo el monorepo, sin compilar                                |

---

## 5. Bases de datos — arquitectura de 3 capas

Investillo usa **3 proveedores distintos** para tolerancia a fallos — si uno falla o queda inaccesible, los otros dos siguen disponibles.

```
        ┌──────────────────────────────────────────────┐
        │ CAPA 1 — Producción (la que usa la app)      │
        │ Supabase (PostgreSQL)                        │
        └──────────────────────────────────────────────┘
                │  pnpm run backup (pg_dump)
                ▼
┌────────────────────────┐      ┌───────────────────────────┐
│ CAPA 2 — Nube #1       │      │ CAPA 3 — Nube #2          │
│ Aiven for PostgreSQL   │      │ Cloudflare R2             │
│ (réplica completa,     │ ->   │ (solo el archivo .dump,   │
│ restaurable de         │      │ almacenamiento de objetos │
│ inmediato)             │      │ tipo S3)                  │
└────────────────────────┘      └───────────────────────────┘
                │                   │
                ▼                   ▼
┌────────────────────────────────────────────────┐
│ CAPA 4 — Local manual (equipo del usuario)     │
│ Copia del archivo .dump en carpeta local       │
│ (`scripts/backups/`), generada en cada corrida │
└────────────────────────────────────────────────┘
```

### 5.1 Supabase (Capa 1 — producción)

1. Crear proyecto en [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string → Session pooler** — copiar esa URL (no la de "Direct connection").
3. Colocarla como `DATABASE_URL` en `.env.api` y como `SOURCE_DATABASE_URL` en `.env.backup`.
4. Ejecutar `pnpm run db:push`.

### 5.2 Aiven (Capa 2 — réplica completa)

1. Crear cuenta en [console.aiven.io](https://console.aiven.io).
2. **Create Service → PostgreSQL** — plan Free o Developer ($5/mes, recomendado para producción por no pausarse por inactividad).
3. Copiar el **Service URI** desde *Connection information*.
4. Colocarlo como `AIVEN_DATABASE_URL` en `.env.backup`.

### 5.3 Cloudflare R2 (Capa 3 — archivo de respaldo)

1. Crear cuenta en [dash.cloudflare.com](https://dash.cloudflare.com).
2. **R2 Object Storage → Create bucket** (ej. `investillo-backups`).
3. **R2 → Manage R2 API Tokens → Create API Token** — permisos *Object Read & Write*, limitado al bucket creado.
4. Copiar `Account ID`, `Access Key ID` y `Secret Access Key` a `.env.backup`.

### 5.4 Ejecutar el respaldo

```cmd
pnpm run backup
```
Genera un archivo `.dump` (formato comprimido de `pg_dump`, filtrado a `--schema=public --no-owner --no-privileges` para excluir la infraestructura interna de Supabase), lo guarda localmente, lo restaura en Aiven y sube el mismo archivo a Cloudflare R2.

**Automatización recomendada:** programar este comando semanalmente con el Programador de Tareas de Windows.

---
### 6. Local — Modo producción (recomendado para el computador del negocio)

Esta es la forma recomendada de dejar el sistema corriendo día a día en el portátil de la empresa — un solo proceso, más liviano que `pnpm run dev`, sin herramientas de desarrollo de por medio.

**Cómo funciona:** el backend (`api-server`) compila y sirve tanto la API (`/api/...`) como el frontend ya compilado, todo desde un único puerto.

**Correrlo manualmente:**
```cmd
pnpm run start:prod
```
Esto compila todo el proyecto y deja el servidor escuchando en el puerto configurado en `.env.api` (ej. `http://localhost:8080`).

**Dejarlo como acceso directo del escritorio (recomendado):**

1. Crea un archivo de texto en el Escritorio, nómbralo `Iniciar Investillo.bat`.
2. Ábrelo con el Bloc de notas y pega:
```bat
   @echo off
   cd /d "C:\Users\TuUsuario\Documents\investillo"  
   
   pnpm run start:prod
```
### o la direccion de donde quedo guardado el archivo Investillo.bat, que es dentro de la carpeta del proyecto

   (ajusta la ruta a donde tengas realmente el proyecto)
3. Guarda y cierra. Doble clic en ese archivo arranca todo el sistema — abre el navegador en `http://localhost:8080` (o el puerto que hayas configurado) para usarlo.

**Nota:** cada vez que se actualice el código del proyecto, hay que volver a correr `pnpm run start:prod` para que compile la versión nueva — no basta con reiniciar el acceso directo si el código no cambió de ubicación, pero si sí cambió el código, el mismo comando ya se encarga de recompilar antes de arrancar.

### 6.0.1 Instalar en el portátil de la empresa (primera vez)

Esta es la lista completa para dejar el sistema funcionando en un computador nuevo, conectado a **la misma base de datos** que ya usas — no se crea una base de datos nueva, se conecta a la existente.

**Paso 1 — Preparar el portátil**

Sigue los Pasos 1 a 6 de la sección 3.5 (instalar Node, pnpm, Git, y clonar el repositorio) en el portátil de la empresa.

**Paso 2 — Copiar tus archivos `.env` desde tu PC al portátil**

Como bien dices, es mejor copiarlos tal cual — así te aseguras de que apunten exactamente a la misma Supabase/Aiven/Cloudflare que ya tienes configurados, sin volver a escribir contraseñas a mano y arriesgarte a un error de tipeo.

1. En tu PC, copia estos 3 archivos a una USB o dispositivo de confianza: `.env.api`, `.env.web`, `.env.backup` (los tienes en la raíz de tu proyecto).
2. En el portátil de la empresa, después de clonar el repositorio (`git clone ...`), pega esos 3 archivos directamente en la raíz de la carpeta `investillo` — al mismo nivel que `package.json`.
3. **No los edites** — al ser una copia exacta, el portátil va a conectarse automáticamente a la misma base de datos de producción que ya usas, sin ningún paso adicional.

⚠️ **Importante:** nunca subas estos archivos a GitHub (ya están en `.gitignore`, pero verifícalo si algo se ve raro) — contienen contraseñas reales de tus bases de datos.

**Paso 3 — Instalar dependencias y confirmar la conexión**

```cmd
cd investillo
pnpm install
pnpm run start:prod
```
Abre `http://localhost:8080` — si carga la app con los mismos datos que ya tienes (mismos productos, mismos clientes), la conexión a la base de datos quedó correcta. **No hace falta correr `pnpm run db:push`** en el portátil — el esquema ya existe en Supabase, ese comando solo se usa cuando cambia la estructura de las tablas.

**Paso 4 — Automatizar el arranque del sistema al encender el portátil**

1. Presiona `Win + R`, escribe `shell:startup` y presiona Enter — se abre la carpeta de inicio de Windows.
2. Copia ahí un acceso directo al archivo `.bat` que creaste en el Paso "Modo producción" de la sección 6.0.
3. Desde ahora, cada vez que se encienda el portátil, el sistema arranca solo.

**Paso 5 — Crear la tarea automática de respaldo (Programador de Tareas de Windows)**

1. Abre **Programador de tareas** (búscalo en el menú Inicio).
2. **Crear tarea básica** → nombre `Backup Investillo`.
3. Desencadenador: **Semanalmente**, elige el día y hora que prefieras.
4. Acción → **Iniciar un programa**:
   - Programa/script: `cmd.exe`
   - Argumentos: `/c cd /d "C:\ruta\investillo" && pnpm run backup >> backups\backup-log.txt 2>&1`
5. Finalizar.

**Paso 6 — (Opcional) Otras tareas automáticas que podrías necesitar**

Si más adelante quieres automatizar algo más (por ejemplo, reiniciar el sistema automáticamente cada madrugada, o correr una limpieza de archivos temporales), se hace con el mismo Programador de Tareas — solo cambia el "Desencadenador" (diario/semanal/al iniciar sesión) y el comando en "Acción". Si llegas a necesitar una tarea específica, dime cuál y te doy el paso a paso exacto para esa.
---

## 7. Despliegue en producción

El proyecto tiene 2 rutas de despliegue posibles. Ambas asumen que la base de datos (Supabase) ya está configurada según la sección 5.

### Opción A — Render (recomendada para simplicidad)

Render soporta tanto el backend (servidor Node persistente) como el frontend en la misma plataforma.

1. Conectar el repositorio de GitHub a Render.
2. **Backend** — crear un **Web Service**:
   - Root directory: `artifacts/api-server`
   - Build command: `pnpm install && pnpm run build`
   - Start command: `pnpm run start`
   - Variables de entorno: `DATABASE_URL`, `PORT` (Render lo asigna automáticamente), `NODE_ENV=production`
3. **Frontend** — crear un **Static Site**:
   - Root directory: `artifacts/gestion`
   - Build command: `pnpm install && pnpm run build`
   - Publish directory: `dist`
   - Variable de entorno: `VITE_API_URL` apuntando a la URL pública del Web Service del backend (requiere ajustar el cliente API para leer esta variable en producción, en vez de asumir mismo origen).

### Opción B — Vercel (frontend) + backend externo

Vercel está optimizado para frontends y funciones serverless — **no está diseñado para correr un servidor Express persistente como está construido hoy**. Dos caminos:

- **B1 (más simple):** desplegar solo el frontend (`artifacts/gestion`) en Vercel, y el backend (`artifacts/api-server`) en Render (Opción A) o en otro proveedor que soporte procesos persistentes (Railway, Fly.io). El frontend en Vercel apunta a la URL pública de ese backend.
- **B2 (más trabajo):** adaptar `artifacts/api-server` para correr como funciones serverless de Vercel — implica reestructurar las rutas de Express en archivos individuales bajo `/api`, y revisar que las conexiones a PostgreSQL usen un pool compatible con entornos serverless (conexiones cortas y frecuentes). No es el diseño actual del proyecto.

**Recomendación:** usar Render para ambos (Opción A) mientras el proyecto no tenga una razón específica para necesitar la red global de Vercel.

---

## 8. Restricciones del sistema

- **Solo probado y soportado en Windows con terminal CMD.** Los scripts del monorepo (`preinstall`, `dev`) fueron ajustados específicamente para evitar sintaxis de PowerShell o Bash — usar otra terminal puede reintroducir errores ya resueltos.
- **`pg_dump`/`pg_restore` locales deben ser versión ≥ a la del servidor remoto.** Actualmente Supabase corre PostgreSQL 17; las herramientas de línea de comandos instaladas localmente deben mantenerse en esa versión o superior.
- **El modo sin conexión (offline) hoy solo cubre Ventas Diarias por completo.** Créditos, Nos Debe, Compras, Cierre Diario, Inventario y Clientes todavía no tienen respaldo local automático ante cortes de internet — están pendientes de conectar al mismo motor de sincronización.
- **La app de escritorio (offline de larga duración, días sin conexión) está planeada pero no construida.** El modo offline actual (capa web/IndexedDB) cubre cortes de horas, no de días.
- **El plan gratuito de Aiven se pausa tras 7 días de inactividad.** Si el respaldo automático deja de correr por más de una semana, la Capa 2 puede quedar inaccesible temporalmente hasta reactivarla manualmente.
- **No existe todavía integración con contabilidad formal (PUC/NIIF) ni facturación electrónica DIAN.** Son funcionalidades futuras que requieren definición previa con un contador certificado.
- **La importación masiva de clientes no detecta duplicados por teléfono o correo, solo por nombre.**

---

## 9. Recomendaciones

- **Subir Supabase al plan Pro ($25/mes)** antes de operar con datos reales del negocio — el plan gratuito no incluye respaldos automáticos y se pausa por inactividad.
- **Ejecutar `pnpm run backup` de forma automática semanal** (Programador de Tareas de Windows) además de manual cuando se hagan cambios grandes.
- **No limpiar "Cookies y datos de sitios" del navegador** en el equipo principal — borra la información guardada localmente (IndexedDB) que todavía no se haya sincronizado. Limpiar solo caché/historial de navegación es seguro.
- **Instalar el sistema como PWA** (aparece la opción "Instalar" en la barra de direcciones de Chrome/Edge) para mayor protección del almacenamiento local frente al borrado automático del navegador.
- **Usar el botón "Guardar copia local"** de la barra superior antes de apagar el equipo si se trabajó offline y no se alcanzó a confirmar la sincronización.
- **Definir con un contador certificado el plan de cuentas (PUC)** antes de construir cualquier módulo de contabilidad — evita mapeos incorrectos frente a la DIAN.

---

## 10. Cotización de referencia

> **Nota importante:** esta sección es una referencia informativa de mercado, no una factura o cotización formal vinculante. Los valores reales dependen del acuerdo específico entre las partes.

### 10.1 Servicios en la nube (costos recurrentes)

| Servicio | Plan actual | Costo | Cuándo subir de plan |
|---|---|---|---|
| Supabase | Free | $0/mes | Al operar con datos reales del negocio → **Pro: $25 USD/mes** |
| Aiven (respaldo) | Free | $0/mes | Para evitar pausas por inactividad → **Developer: $5 USD/mes** |
| Cloudflare R2 | Free (10 GB) | $0/mes | Si el volumen de respaldos supera 10 GB (poco probable en varios años con este esquema) |
| Render / Vercel | Free tier | $0/mes | Según tráfico — ambos ofrecen planes desde ~$7-20 USD/mes cuando se necesita evitar límites del plan gratuito |

**Estimado recurrente en producción estable:** ~$30-50 USD/mes (~$120.000–$200.000 COP/mes aprox., sujeto a tasa de cambio).

### 10.2 Referencia de mercado para trabajo de desarrollo (informativo)

Tabla de referencia basada en tarifas típicas del mercado freelance colombiano para trabajo de complejidad similar al ya realizado — **no es una cotización oficial de Anthropic ni de Claude**, que no ofrece servicios de desarrollo facturables:

| Fase del proyecto | Alcance | Rango de referencia (mercado freelance CO) |
|---|---|---|
| Migración de Replit a entorno local Windows | Diagnóstico, ajustes de compatibilidad, scripts de arranque | $300.000 – $600.000 COP |
| Arquitectura de base de datos y respaldos (3 capas) | Configuración Supabase/Aiven/R2, script de backup automatizado | $400.000 – $800.000 COP |
| Funcionalidades nuevas (importación Excel, mano de obra personalizada, Trabajadores/Seguro) | Diseño, backend, frontend, pruebas | $150.000 – $400.000 COP por funcionalidad, según complejidad |
| Modo offline (web + futura app de escritorio) | Motor de sincronización, indicador de conexión, anti-duplicados | $800.000 – $1.500.000 COP (fase web) + $1.000.000 – $2.500.000 COP (app de escritorio, pendiente) |
| Mantenimiento continuo | Soporte, ajustes menores | $80.000 – $150.000 COP/hora, o tarifa mensual a convenir |

> Estos rangos son orientativos y varían según la tarifa del desarrollador específico, la urgencia y el alcance final acordado — se recomienda validar con cotizaciones reales antes de tomar decisiones de presupuesto.

---

*Documento generado como parte de la documentación técnica del proyecto Investillo. Última actualización: agosto 2026.*