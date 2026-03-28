# Workspace

## Overview

Sistema de Gestión completo para taller/local colombiano. Aplicación web full-stack con React + Vite (frontend) y Express + PostgreSQL (backend).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Icons**: lucide-react
- **Forms**: react-hook-form + @hookform/resolvers
- **Dates**: date-fns
- **Charts**: recharts
- **Animations**: framer-motion

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (backend)
│   └── gestion/            # React+Vite frontend (Sistema de Gestion)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Sistema de Gestión - Módulos

### Dashboard
- Ventas del día, Mano de Obra del día, "Nos deben" (total créditos pendientes)
- Alertas de stock (productos agotándose)

### Inventario
- CRUD de productos: código, nombre, marca, referencia, precio compra, precio venta sin/con IVA
- Cálculo automático de IVA redondeando al múltiplo de 1000 más cercano: `Math.ceil(precio * 1.19 / 1000) * 1000`
- Margen mínimo de ganancia 20%
- Alertas de stock: cuando stockActual <= stockMinimo + 1

### Ventas Diarias
- Tabla editable directamente (sin modales)
- Campos: No. Remisión/Ref, Producto, Marca, Cantidad (decimales con coma), Precio Compra, Precio Venta, Total, Beneficio
- Tipos de línea con colores: venta (blanco), manoobra (amarillo), credito (azul)
- Total solo suma ventas tipo "venta" (no manoobra ni crédito)
- Opción de imprimir el módulo del día

### Créditos
- Clientes que deben productos
- Campos: fecha factura, placa vehículo, nombre cliente, teléfono, descripción, valor crédito, abonado, restante
- Al abonar, se agrega automáticamente a ventas diarias como línea azul

### Compras
- Lista automática de productos con stock <= stockMinimo
- Estados: pendiente (rojo) / llegado (verde)
- Al marcar como llegado: actualiza inventario, precio compra y precio venta

### Mano de Obra
- Registro de servicios con distribución entre trabajadores (hasta 4)
- Nivelación equitativa de pagos
- Descuentos: trabajadores 1 y 2 = $20,000 seguro; trabajador 3 = descuento compras empresa
- Al registrar, se agrega a ventas diarias como línea amarilla

### Block de Notas Flotante
- Botón flotante en esquina inferior derecha
- Solo minimizable (sin botón cerrar)
- Contenido guardado automáticamente en base de datos

### Facturación Electrónica DIAN
- Sección preparada con placeholder para futura implementación

## Base de Datos - Tablas

- `productos` - Inventario de productos
- `ventas_diarias` - Registro de ventas del día
- `creditos` - Créditos de clientes
- `compras` - Órdenes de compra
- `mano_obra` - Registros de mano de obra
- `distribuciones_mano_obra` - Distribución de mano de obra por trabajador
- `trabajadores` - 4 trabajadores del local
- `notas` - Block de notas persistente

## Reglas de Negocio

- Precios en pesos colombianos (COP)
- IVA: 19%
- Precio con IVA = Math.ceil(precioSinIva * 1.19 / 1000) * 1000 (redondeo al próximo múltiplo de 1000)
- Margen mínimo: 20% (precioVentaSinIva >= precioCompra * 1.2)
- Cantidades: decimales con coma como separador (ej: 1,5)
- Alerta de stock: cuando stockActual <= stockMinimo + 1
- Total ventas diarias: solo suma líneas tipo "venta" (no manoobra, no credito)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`:
- `health.ts` — GET /healthz
- `inventario.ts` — CRUD productos + alertas + actualizar stock
- `ventas.ts` — CRUD ventas diarias
- `creditos.ts` — CRUD créditos clientes
- `compras.ts` — CRUD órdenes de compra
- `manoobra.ts` — CRUD mano de obra con distribuciones
- `trabajadores.ts` — CRUD trabajadores
- `notas.ts` — Block de notas (GET/PUT)
- `dashboard.ts` — Resumen general

### `artifacts/gestion` (`@workspace/gestion`)

React+Vite frontend. Pages in `src/pages/`:
- `dashboard.tsx` — Panel de control
- `inventario.tsx` — Gestión de productos
- `ventas.tsx` — Ventas diarias
- `creditos.tsx` — Créditos de clientes
- `compras.tsx` — Órdenes de compra
- `mano-obra.tsx` — Control de mano de obra
- `facturacion.tsx` — Facturación electrónica DIAN (placeholder)

Components: `Sidebar.tsx`, `Layout.tsx`, `FloatingNotepad.tsx`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema files: `inventario.ts`, `ventas.ts`, `creditos.ts`, `compras.ts`, `manoobra.ts`, `trabajadores.ts`, `notas.ts`
- Dev push: `pnpm --filter @workspace/db run push`
