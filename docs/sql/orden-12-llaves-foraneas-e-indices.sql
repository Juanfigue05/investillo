BEGIN;

CREATE TABLE IF NOT EXISTS _respaldo_huerfanos (
  origen text,
  id integer,
  fila jsonb,
  respaldado_en timestamp DEFAULT now()
);

INSERT INTO _respaldo_huerfanos (origen, id, fila)
  SELECT 'historial_precios.compra_id', h.id, to_jsonb(h)
  FROM historial_precios h
  WHERE h.compra_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM compras c WHERE c.id = h.compra_id)
  UNION ALL
  SELECT 'historial_precios.producto_id', h.id, to_jsonb(h)
  FROM historial_precios h
  WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.id = h.producto_id)
  UNION ALL
  SELECT 'mano_obra.venta_id', m.id, to_jsonb(m)
  FROM mano_obra m
  WHERE m.venta_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ventas_diarias v WHERE v.id = m.venta_id);

UPDATE historial_precios h
SET compra_id = NULL
WHERE compra_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM compras c WHERE c.id = h.compra_id);

UPDATE mano_obra m
SET venta_id = NULL
WHERE venta_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ventas_diarias v WHERE v.id = m.venta_id);

DELETE FROM historial_precios h
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.id = h.producto_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abonos_creditos_credito_id_fk' AND conrelid = 'abonos_creditos'::regclass) THEN
    ALTER TABLE abonos_creditos ADD CONSTRAINT abonos_creditos_credito_id_fk FOREIGN KEY (credito_id) REFERENCES creditos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credito_lineas_credito_id_fk' AND conrelid = 'credito_lineas'::regclass) THEN
    ALTER TABLE credito_lineas ADD CONSTRAINT credito_lineas_credito_id_fk FOREIGN KEY (credito_id) REFERENCES creditos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credito_lineas_producto_id_fk' AND conrelid = 'credito_lineas'::regclass) THEN
    ALTER TABLE credito_lineas ADD CONSTRAINT credito_lineas_producto_id_fk FOREIGN KEY (producto_id) REFERENCES productos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_producto_id_fk' AND conrelid = 'compras'::regclass) THEN
    ALTER TABLE compras ADD CONSTRAINT compras_producto_id_fk FOREIGN KEY (producto_id) REFERENCES productos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'descuentos_inventario_producto_id_fk' AND conrelid = 'descuentos_inventario'::regclass) THEN
    ALTER TABLE descuentos_inventario ADD CONSTRAINT descuentos_inventario_producto_id_fk FOREIGN KEY (producto_id) REFERENCES productos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'distribuciones_mano_obra_mano_obra_fk' AND conrelid = 'distribuciones_mano_obra'::regclass) THEN
    ALTER TABLE distribuciones_mano_obra ADD CONSTRAINT distribuciones_mano_obra_mano_obra_fk FOREIGN KEY (mano_obra_id) REFERENCES mano_obra (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'distribuciones_mano_obra_trabajador_fk' AND conrelid = 'distribuciones_mano_obra'::regclass) THEN
    ALTER TABLE distribuciones_mano_obra ADD CONSTRAINT distribuciones_mano_obra_trabajador_fk FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historial_precios_compra_id_fk' AND conrelid = 'historial_precios'::regclass) THEN
    ALTER TABLE historial_precios ADD CONSTRAINT historial_precios_compra_id_fk FOREIGN KEY (compra_id) REFERENCES compras (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historial_precios_producto_id_fk' AND conrelid = 'historial_precios'::regclass) THEN
    ALTER TABLE historial_precios ADD CONSTRAINT historial_precios_producto_id_fk FOREIGN KEY (producto_id) REFERENCES productos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mano_obra_credito_id_fk' AND conrelid = 'mano_obra'::regclass) THEN
    ALTER TABLE mano_obra ADD CONSTRAINT mano_obra_credito_id_fk FOREIGN KEY (credito_id) REFERENCES creditos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mano_obra_venta_id_fk' AND conrelid = 'mano_obra'::regclass) THEN
    ALTER TABLE mano_obra ADD CONSTRAINT mano_obra_venta_id_fk FOREIGN KEY (venta_id) REFERENCES ventas_diarias (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obra_electronica_trabajador_id_fk' AND conrelid = 'obra_electronica'::regclass) THEN
    ALTER TABLE obra_electronica ADD CONSTRAINT obra_electronica_trabajador_id_fk FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagos_seguro_trabajador_id_fk' AND conrelid = 'pagos_seguro'::regclass) THEN
    ALTER TABLE pagos_seguro ADD CONSTRAINT pagos_seguro_trabajador_id_fk FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehiculos_cliente_cliente_id_fk' AND conrelid = 'vehiculos_cliente'::regclass) THEN
    ALTER TABLE vehiculos_cliente ADD CONSTRAINT vehiculos_cliente_cliente_id_fk FOREIGN KEY (cliente_id) REFERENCES clientes (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ventas_diarias_credito_abono_id_fk' AND conrelid = 'ventas_diarias'::regclass) THEN
    ALTER TABLE ventas_diarias ADD CONSTRAINT ventas_diarias_credito_abono_id_fk FOREIGN KEY (credito_abono_id) REFERENCES abonos_creditos (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ventas_diarias_mano_obra_id_fk' AND conrelid = 'ventas_diarias'::regclass) THEN
    ALTER TABLE ventas_diarias ADD CONSTRAINT ventas_diarias_mano_obra_id_fk FOREIGN KEY (mano_obra_id) REFERENCES mano_obra (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ventas_diarias_producto_id_fk' AND conrelid = 'ventas_diarias'::regclass) THEN
    ALTER TABLE ventas_diarias ADD CONSTRAINT ventas_diarias_producto_id_fk FOREIGN KEY (producto_id) REFERENCES productos (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ventas_diarias_fecha_idx ON ventas_diarias (fecha);
CREATE INDEX IF NOT EXISTS ventas_diarias_credito_abono_id_idx ON ventas_diarias (credito_abono_id) WHERE credito_abono_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventas_diarias_producto_id_idx ON ventas_diarias (producto_id) WHERE producto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventas_diarias_mano_obra_id_idx ON ventas_diarias (mano_obra_id) WHERE mano_obra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS abonos_creditos_credito_id_idx ON abonos_creditos (credito_id);
CREATE INDEX IF NOT EXISTS credito_lineas_credito_id_idx ON credito_lineas (credito_id);
CREATE INDEX IF NOT EXISTS credito_lineas_producto_id_idx ON credito_lineas (producto_id) WHERE producto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS creditos_tipo_idx ON creditos (tipo);
CREATE INDEX IF NOT EXISTS compras_producto_id_idx ON compras (producto_id);
CREATE INDEX IF NOT EXISTS distribuciones_mano_obra_mo_idx ON distribuciones_mano_obra (mano_obra_id);
CREATE INDEX IF NOT EXISTS distribuciones_mano_obra_trab_idx ON distribuciones_mano_obra (trabajador_id);
CREATE INDEX IF NOT EXISTS mano_obra_credito_id_idx ON mano_obra (credito_id) WHERE credito_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mano_obra_venta_id_idx ON mano_obra (venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mano_obra_fecha_idx ON mano_obra (fecha);
CREATE INDEX IF NOT EXISTS historial_precios_producto_id_idx ON historial_precios (producto_id);
CREATE INDEX IF NOT EXISTS obra_electronica_trabajador_id_idx ON obra_electronica (trabajador_id) WHERE trabajador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pagos_seguro_trabajador_id_idx ON pagos_seguro (trabajador_id);
CREATE INDEX IF NOT EXISTS vehiculos_cliente_cliente_id_idx ON vehiculos_cliente (cliente_id);

COMMIT;
