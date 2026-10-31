import { eq } from "drizzle-orm";
import { operacionesSincronizadasTable } from "@workspace/db/schema";
import { db } from "@workspace/db";

export type OperationTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function operacionYaProcesada(
  tx: OperationTransaction,
  operationId: string,
) {
  const [operacion] = await tx
    .select()
    .from(operacionesSincronizadasTable)
    .where(eq(operacionesSincronizadasTable.operationId, operationId));
  return operacion;
}
