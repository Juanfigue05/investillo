import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const remoteApiUrl = process.env.SYNC_REMOTE_API_URL?.replace(/\/+$/, "");
if (!databaseUrl || !remoteApiUrl) throw new Error("DATABASE_URL y SYNC_REMOTE_API_URL son obligatorios");

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const pendientes = await pool.query<{ cantidad: string }>(
    `SELECT count(*)::text AS cantidad FROM eventos_sincronizacion
      WHERE estado IN ('pendiente', 'error') AND origen = 'local'`,
  );
  if (Number(pendientes.rows[0]?.cantidad ?? 0) > 0) {
    throw new Error("No se descargan cambios remotos mientras existan operaciones locales pendientes o con error");
  }
  const cursor = await pool.query<{ valor: Date }>("SELECT valor FROM cursos_sincronizacion WHERE nombre = 'remoto'");
  const desde = cursor.rows[0]?.valor.toISOString() ?? "1970-01-01T00:00:00.000Z";
  const response = await fetch(`${remoteApiUrl}/sync/pull?desde=${encodeURIComponent(desde)}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Pull remoto HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as { eventos: Array<{ operationId: string; endpoint: string; metodo: string; payload: unknown; creadoEn: string }>; hasta: string };

  let aplicados = 0;
  for (const evento of data.eventos) {
    const applied = await fetch(`http://localhost:${process.env.PORT || 8080}/api${evento.endpoint}`, {
      method: evento.metodo,
      headers: { "Content-Type": "application/json", "X-Operation-Id": evento.operationId, "X-Sync-Apply": "true" },
      body: JSON.stringify(evento.payload),
    });
    if (!applied.ok) throw new Error(`No se pudo aplicar ${evento.metodo} ${evento.endpoint}: HTTP ${applied.status}`);
    aplicados++;
  }

  if (data.hasta) {
    await pool.query(
      `INSERT INTO cursos_sincronizacion (nombre, valor)
       VALUES ('remoto', $1)
       ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
      [new Date(data.hasta)],
    );
  }
  console.log(`Sincronización remota → local: ${aplicados}/${data.eventos.length} eventos aplicados.`);
} finally {
  await pool.end();
}