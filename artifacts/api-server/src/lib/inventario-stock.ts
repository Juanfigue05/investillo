import { db } from "@workspace/db";
import { productosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type InventarioTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type Existencias = {
  local: number;
  bodega: number;
  total: number;
};

export async function bloquearProducto(
  tx: InventarioTransaction,
  productoId: number,
) {
  const [producto] = await tx
    .select()
    .from(productosTable)
    .where(eq(productosTable.id, productoId))
    .for("update");
  return producto;
}

export function leerExistencias(producto: {
  stockActual: string;
  stockLocal: string;
  stockBodega: string;
}): Existencias {
  const totalRegistrado = Number(producto.stockActual);
  let local = Number(producto.stockLocal);
  let bodega = Number(producto.stockBodega);

  if (local === 0 && bodega === 0 && totalRegistrado !== 0) {
    local = totalRegistrado;
  }

  return { local, bodega, total: totalRegistrado };
}

export function validarExistenciasNoNegativas(stock: Existencias) {
  if (
    !Number.isFinite(stock.local) ||
    !Number.isFinite(stock.bodega) ||
    !Number.isFinite(stock.total) ||
    stock.local < 0 ||
    stock.bodega < 0 ||
    stock.total < 0
  ) {
    throw new Error(
      "El stock registrado tiene una inconsistencia negativa. Realiza un ajuste de conteo físico antes de registrar salidas.",
    );
  }
}

export async function guardarExistencias(
  tx: InventarioTransaction,
  productoId: number,
  local: number,
  bodega: number,
) {
  if (
    !Number.isFinite(local) ||
    !Number.isFinite(bodega) ||
    local < 0 ||
    bodega < 0
  ) {
    throw new Error("Las existencias no pueden quedar en negativo.");
  }

  const total = local + bodega;
  if (!Number.isFinite(total)) {
    throw new Error("El total de existencias no es válido.");
  }

  const [updated] = await tx
    .update(productosTable)
    .set({
      stockLocal: String(local),
      stockBodega: String(bodega),
      stockActual: String(total),
      actualizadoEn: new Date(),
    })
    .where(eq(productosTable.id, productoId))
    .returning();
  return updated;
}
