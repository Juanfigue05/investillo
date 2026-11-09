BEGIN;

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id serial PRIMARY KEY,
  operation_id text NOT NULL,
  producto_id integer NOT NULL,
  producto_nombre text NOT NULL,
  producto_codigo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ajuste', 'salida')),
  motivo text NOT NULL,
  ubicacion text NOT NULL CHECK (ubicacion IN ('local', 'bodega')),
  direccion text NOT NULL CHECK (direccion IN ('sumar', 'restar')),
  cantidad numeric(15, 3) NOT NULL CHECK (cantidad > 0),
  stock_local_antes numeric(15, 3) NOT NULL,
  stock_local_despues numeric(15, 3) NOT NULL,
  stock_bodega_antes numeric(15, 3) NOT NULL,
  stock_bodega_despues numeric(15, 3) NOT NULL,
  stock_actual_antes numeric(15, 3) NOT NULL,
  stock_actual_despues numeric(15, 3) NOT NULL,
  observacion text,
  creado_en timestamp NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_inventario_producto_id_fk
    FOREIGN KEY (producto_id) REFERENCES productos (id)
);

CREATE INDEX IF NOT EXISTS movimientos_inventario_producto_fecha_idx
  ON movimientos_inventario (producto_id, creado_en);
CREATE INDEX IF NOT EXISTS movimientos_inventario_operation_id_idx
  ON movimientos_inventario (operation_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'productos_stock_actual_no_negativo_ck'
      AND conrelid = 'productos'::regclass
  ) THEN
    ALTER TABLE productos
      ADD CONSTRAINT productos_stock_actual_no_negativo_ck
      CHECK (stock_actual >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'productos_stock_local_no_negativo_ck'
      AND conrelid = 'productos'::regclass
  ) THEN
    ALTER TABLE productos
      ADD CONSTRAINT productos_stock_local_no_negativo_ck
      CHECK (stock_local >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'productos_stock_bodega_no_negativo_ck'
      AND conrelid = 'productos'::regclass
  ) THEN
    ALTER TABLE productos
      ADD CONSTRAINT productos_stock_bodega_no_negativo_ck
      CHECK (stock_bodega >= 0) NOT VALID;
  END IF;
END $$;

COMMIT;
