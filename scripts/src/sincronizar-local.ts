import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const remoteApiUrl = process.env.SYNC_REMOTE_API_URL?.replace(/\/+$/, "");

if (!databaseUrl) throw new Error("DATABASE_URL es obligatorio");
if (!remoteApiUrl) throw new Error("SYNC_REMOTE_API_URL es obligatorio");
if (!remoteApiUrl.startsWith("https://") || !remoteApiUrl.endsWith("/api")) {
  throw new Error("SYNC_REMOTE_API_URL debe ser la URL HTTPS del API remoto y terminar en /api");
}
if (remoteApiUrl.includes("TU-SERVICIO") || remoteApiUrl.includes("example.com")) {
  throw new Error("Reemplace SYNC_REMOTE_API_URL por el dominio real de Render");
}

const pool = new Pool({ connectionString: databaseUrl });
const LIMIT = 50;

try {
  const health = await fetch(`${remoteApiUrl}/healthz`, { signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new Error(`El API remoto respondió HTTP ${health.status}`);

  const lock = await pool.query<{ bloqueado: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext('investillo-sync-local')) AS bloqueado",
  );
  if (!lock.rows[0]?.bloqueado) {
    console.log("Ya hay otra sincronización en ejecución; esta se omite.");
    process.exit(0);
  }

  const { rows } = await pool.query<{
    operation_id: string;
    entidad: string;
    entidad_id: string;
    endpoint: string;
    metodo: string;
    payload: unknown;
    creado_en: Date;
  }>(
    `SELECT operation_id, entidad, entidad_id, endpoint, metodo, payload, creado_en
       FROM eventos_sincronizacion
      WHERE estado IN ('pendiente', 'error')
      ORDER BY creado_en ASC
      LIMIT $1`,
    [LIMIT],
  );

  let sincronizadas = 0;
  let fallidas = 0;
  let conflictos = 0;
  for (const evento of rows) {
    try {
      const payload = evento.payload;
      const referencia = await pool.query<{ id_remoto: string }>(
        `SELECT id_remoto FROM referencias_sincronizacion
          WHERE entidad = $1 AND id_local = $2`,
        [evento.entidad, evento.entidad_id],
      );
      const idRemoto = referencia.rows[0]?.id_remoto;
      const endpoint = idRemoto
        ? evento.endpoint.replaceAll(`/${evento.entidad_id}`, `/${idRemoto}`)
        : evento.endpoint;

      // No sobrescribe una edición remota posterior sin revisión manual.
      if (evento.metodo !== "POST") {
        const remoto = await fetch(`${remoteApiUrl}${endpoint}`, {
          method: "GET",
          signal: AbortSignal.timeout(15_000),
        });
        if (remoto.ok) {
          const registro = await remoto.json().catch(() => null) as { actualizadoEn?: string; actualizado_en?: string } | null;
          const actualizado = registro?.actualizadoEn ?? registro?.actualizado_en;
          if (actualizado && new Date(actualizado).getTime() > new Date(evento.creado_en).getTime()) {
            await pool.query(
              `UPDATE eventos_sincronizacion
                  SET estado = 'conflicto', intentos = intentos + 1,
                      ultimo_error = $2
                WHERE operation_id = $1`,
              [evento.operation_id, `El recurso remoto cambió después de crear esta operación local: ${actualizado}`],
            );
            conflictos++;
            continue;
          }
        }
      }

      const response = await fetch(`${remoteApiUrl}${endpoint}`, {
        method: evento.metodo,
        headers: {
          "Content-Type": "application/json",
          "X-Operation-Id": evento.operation_id,
          "X-Sync-Apply": "true",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detalle = (await response.text()).slice(0, 500);
        await pool.query(
          `UPDATE eventos_sincronizacion
              SET estado = 'error',
                  intentos = intentos + 1,
                  ultimo_error = $2
            WHERE operation_id = $1`,
          [evento.operation_id, `HTTP ${response.status}: ${detalle}`],
        );
        fallidas++;
        continue;
      }

      const respuestaRemota = await response.json().catch(() => null);
      await pool.query(
        `UPDATE eventos_sincronizacion
            SET estado = 'sincronizado', procesado_en = now(), ultimo_error = NULL,
                respuesta_remota = $2
          WHERE operation_id = $1`,
        [evento.operation_id, JSON.stringify(respuestaRemota)],
      );
      const idNuevo = respuestaRemota && typeof respuestaRemota === "object"
        ? (respuestaRemota as { id?: number | string; recursoId?: number | string }).id ??
          (respuestaRemota as { recursoId?: number | string }).recursoId
        : undefined;
      if (idNuevo !== undefined && !idRemoto) {
        await pool.query(
          `INSERT INTO referencias_sincronizacion (entidad, id_local, id_remoto)
           VALUES ($1, $2, $3)
           ON CONFLICT (entidad, id_local) DO UPDATE SET id_remoto = EXCLUDED.id_remoto, actualizado_en = now()`,
          [evento.entidad, evento.entidad_id, String(idNuevo)],
        );
      }
      sincronizadas++;
    } catch (error) {
      await pool.query(
        `UPDATE eventos_sincronizacion
            SET estado = 'error', intentos = intentos + 1, ultimo_error = $2
          WHERE operation_id = $1`,
        [evento.operation_id, error instanceof Error ? error.message : String(error)],
      );
      fallidas++;
    }
  }

  console.log(`Sincronización local: ${sincronizadas}/${rows.length} operaciones procesadas.`);
  if (conflictos > 0) console.error(`${conflictos} conflicto(s) quedaron retenidos sin sobrescribir datos remotos.`);
  if (fallidas > 0) {
    console.error(`${fallidas} operación(es) quedaron con error y no se descargan cambios remotos.`);
    process.exitCode = 1;
  }
  if (conflictos > 0) process.exitCode = 1;
} finally {
  await pool.end();
}