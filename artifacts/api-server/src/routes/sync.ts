import { Router } from "express";
import { db } from "@workspace/db";
import {
  cursosSincronizacionTable,
  eventosSincronizacionTable,
} from "@workspace/db/schema";
import { and, asc, gt, eq, sql } from "drizzle-orm";

const router = Router();

router.get("/pull", async (req, res) => {
  const desde = new Date(String(req.query.desde || "1970-01-01T00:00:00.000Z"));
  if (Number.isNaN(desde.getTime())) { res.status(400).json({ error: "desde inválido" }); return; }
  const eventos = await db.select({
    operationId: eventosSincronizacionTable.operationId,
    endpoint: eventosSincronizacionTable.endpoint,
    metodo: eventosSincronizacionTable.metodo,
    payload: eventosSincronizacionTable.payload,
    entidad: eventosSincronizacionTable.entidad,
    entidadId: eventosSincronizacionTable.entidadId,
    referenciasRespuesta: eventosSincronizacionTable.referenciasRespuesta,
    referenciasEndpoint: eventosSincronizacionTable.referenciasEndpoint,
    creadoEn: eventosSincronizacionTable.creadoEn,
  }).from(eventosSincronizacionTable)
    .where(and(eq(eventosSincronizacionTable.origen, "remoto"), gt(eventosSincronizacionTable.creadoEn, desde)))
    .orderBy(asc(eventosSincronizacionTable.creadoEn))
    .limit(100);
  const hasta = eventos.at(-1)?.creadoEn ?? desde;
  res.json({ eventos, hasta });
});

router.post("/ack", async (req, res) => {
  const hasta =
    typeof req.body?.hasta === "string" ? new Date(req.body.hasta) : null;
  if (!hasta || Number.isNaN(hasta.getTime())) {
    res.status(400).json({ error: "hasta debe ser una fecha válida" });
    return;
  }
  if (hasta > new Date()) {
    res.status(400).json({ error: "El acuse no puede estar en el futuro" });
    return;
  }

  const hastaUtc = hasta.toISOString();
  const hastaCursor =
    `${hastaUtc.slice(0, 19).replace("T", " ")}.${hastaUtc.slice(20, 23)}000`;
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
  const [validacionUltimoEvento] = await db
    .select({
      supera: sql<boolean>`COALESCE(
        ${hastaCursor}::timestamp > max(${eventosSincronizacionTable.creadoEn}),
        false
      )`,
    })
    .from(eventosSincronizacionTable)
    .where(eq(eventosSincronizacionTable.origen, "remoto"));
  if (!yaAcusado.length && validacionUltimoEvento?.supera) {
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

  res.json({ ok: true, hasta: hasta.toISOString() });
});

export default router;