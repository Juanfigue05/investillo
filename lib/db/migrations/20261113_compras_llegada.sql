BEGIN;

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS cantidad_local_recibida numeric(15, 3),
  ADD COLUMN IF NOT EXISTS cantidad_bodega_recibida numeric(15, 3),
  ADD COLUMN IF NOT EXISTS precios_inventario_antes jsonb,
  ADD COLUMN IF NOT EXISTS precios_inventario_aplicados jsonb,
  ADD COLUMN IF NOT EXISTS precios_inventario_actualizados boolean NOT NULL DEFAULT false;

COMMIT;
