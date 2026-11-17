BEGIN;

ALTER TABLE mano_obra
  ADD COLUMN IF NOT EXISTS tipo_servicio text;

COMMIT;
