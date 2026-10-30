import { Router } from "express";
import { db } from "@workspace/db";
import { cursosSincronizacionTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

const router = Router();
const DESDE_PREDETERMINADO = "1970-01-01 00:00:00";
const FORMATO_FECHA =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;

function fechaCursorValida(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = FORMATO_FECHA.exec(value);
  if (!match || match[1] === "0000") return false;
  const fechaBase = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const fecha = new Date(fechaBase);
  return (
    Number.isFinite(fecha.getTime()) &&
    fecha.toISOString().slice(0, 19) === fechaBase.slice(0, 19)
  );
}

function fechaSql(value: string): string {
  return value.replace("T", " ");
}

function limitePull(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 100;
  const limite = Number(value);
  if (!Number.isSafeInteger(limite) || limite < 1) return 100;
  return Math.min(limite, 200);
}

router.get("/pull", async (req, res) => {
  const desdeParametro = req.query.desde;
  const desde =
    desdeParametro === undefined ? DESDE_PREDETERMINADO : desdeParametro;
  if (!fechaCursorValida(desde)) {
    res.status(400).json({ error: "desde inválido" });
    return;
  }

  const desdeOperacion = req.query.desdeOperacion;
  if (
    desdeOperacion !== undefined &&
    (typeof desdeOperacion !== "string" ||
      desdeOperacion.length === 0 ||
      desdeOperacion.length > 200)
  ) {
    res.status(400).json({ error: "desdeOperacion inválido" });
    return;
  }
  const limite = limitePull(req.query.limite);
  const desdeTexto = fechaSql(desde);
  const eventosQuery = db.execute(sql`
    SELECT
      operation_id AS "operationId",
      endpoint,
      metodo,
      payload,
      entidad,
      entidad_id AS "entidadId",
      referencias_respuesta AS "referenciasRespuesta",
      referencias_endpoint AS "referenciasEndpoint",
      creado_en::text AS "creadoEn"
    FROM eventos_sincronizacion
    WHERE origen = 'remoto'
      AND creado_en < now() - interval '2 seconds'
      AND ${
        desdeOperacion === undefined
          ? sql`creado_en > ${desdeTexto}::timestamp`
          : sql`(creado_en, operation_id) > (${desdeTexto}::timestamp, ${desdeOperacion})`
      }
    ORDER BY creado_en, operation_id
    LIMIT ${limite}
  `);
  const { rows } = await eventosQuery;
  const eventos = rows as Array<{
    operationId: string;
    endpoint: string;
    metodo: string;
    payload: unknown;
    entidad: string;
    entidadId: string;
    referenciasRespuesta: unknown;
    referenciasEndpoint: unknown;
    creadoEn: string;
  }>;
  const ultimoEvento = eventos.at(-1);
  res.json({
    eventos,
    hasta: ultimoEvento?.creadoEn ?? desdeTexto,
    hastaOperacion: ultimoEvento?.operationId ?? desdeOperacion ?? null,
    hayMas: eventos.length >= limite,
  });
});

router.get("/conflicto", async (req, res) => {
  const desde = req.query.desde;
  const desdeOperacion = req.query.desdeOperacion;
  const endpoint = req.query.endpoint;
  if (
    !fechaCursorValida(desde) ||
    (desdeOperacion !== undefined &&
      (typeof desdeOperacion !== "string" ||
        desdeOperacion.length === 0 ||
        desdeOperacion.length > 200)) ||
    typeof endpoint !== "string" ||
    !endpoint.startsWith("/") ||
    endpoint.length > 500 ||
    req.query.entidad !== undefined ||
    req.query.entidadId !== undefined
  ) {
    res.status(400).json({ error: "Parámetros de conflicto inválidos" });
    return;
  }

  const desdeTexto = fechaSql(desde);
  const endpointSinConsulta = endpoint.split("?", 1)[0]!;
  const endpointBase =
    endpointSinConsulta.length > 1 && endpointSinConsulta.endsWith("/")
      ? endpointSinConsulta.slice(0, -1)
      : endpointSinConsulta;
  const prefijoSubruta =
    endpointBase === "/" ? "/" : `${endpointBase}/`;
  const { rows } = await db.execute(sql`
    SELECT
      operation_id AS "operationId",
      creado_en::text AS "creadoEn",
      metodo,
      endpoint
    FROM eventos_sincronizacion
    WHERE origen = 'remoto'
      AND ${
        desdeOperacion === undefined
          ? sql`creado_en > ${desdeTexto}::timestamp`
          : sql`(creado_en, operation_id) > (${desdeTexto}::timestamp, ${desdeOperacion})`
      }
      AND (
        split_part(endpoint, '?', 1) = ${endpointBase}
        OR starts_with(split_part(endpoint, '?', 1), ${prefijoSubruta})
      )
    ORDER BY creado_en, operation_id
    LIMIT 1
  `);
  const evento = rows[0] as
    | {
        operationId: string;
        creadoEn: string;
        metodo: string;
        endpoint: string;
      }
    | undefined;
  res.json(
    evento
      ? { conflicto: true, evento }
      : { conflicto: false },
  );
});

router.get("/ahora", async (_req, res) => {
  const { rows } = await db.execute(sql`
    SELECT to_char(
      now() - interval '2 seconds',
      'YYYY-MM-DD HH24:MI:SS.US'
    ) AS ahora
  `);
  res.json({ ahora: rows[0]?.ahora });
});

router.post("/ack", async (req, res) => {
  const hasta = req.body?.hasta;
  if (!fechaCursorValida(hasta)) {
    res.status(400).json({ error: "hasta debe ser una fecha válida" });
    return;
  }

  const hastaCursor = fechaSql(hasta);
  const validacion = await db.execute(sql`
    SELECT
      ${hastaCursor}::timestamp > now() AS futuro,
      COALESCE(
        ${hastaCursor}::timestamp > (
          SELECT max(creado_en)
          FROM eventos_sincronizacion
          WHERE origen = 'remoto'
        ),
        false
      ) AS supera_ultimo_evento
  `);
  const resultado = validacion.rows[0] as
    | { futuro: boolean; supera_ultimo_evento: boolean }
    | undefined;
  if (resultado?.futuro) {
    res.status(400).json({ error: "El acuse no puede estar en el futuro" });
    return;
  }
  const yaAcusado = await db
    .select({ valor: cursosSincronizacionTable.nombre })
    .from(cursosSincronizacionTable)
    .where(
      and(
        eq(cursosSincronizacionTable.nombre, "acuse_local"),
        sql`${cursosSincronizacionTable.valor} >= ${hastaCursor}::timestamp`,
      ),
    )
    .limit(1);
  if (!yaAcusado.length && resultado?.supera_ultimo_evento) {
    res.status(400).json({ error: "El acuse supera el último evento remoto" });
    return;
  }

  await db.execute(sql`
    INSERT INTO cursos_sincronizacion (nombre, valor)
    VALUES ('acuse_local', ${hastaCursor}::timestamp)
    ON CONFLICT (nombre) DO UPDATE SET
      valor = GREATEST(cursos_sincronizacion.valor, EXCLUDED.valor),
      actualizado_en = now()
  `);

  res.json({ ok: true, hasta: hastaCursor });
});

export default router;
