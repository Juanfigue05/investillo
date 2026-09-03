// pg no incluye declaraciones de tipos en esta instalación; se mantiene el
// import tipado de forma implícita hasta que @types/pg esté disponible.
// @ts-expect-error El paquete pg no expone tipos para esta configuración.
import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Falta DATABASE_URL en el .env");

const pool = new Pool({ connectionString: DATABASE_URL });

interface Problema { categoria: string; detalle: string; }

async function verificarConsistencia() {
  const problemas: Problema[] = [];

  // 1. Stock negativo (nunca debería pasar)
  const stockNegativo = await pool.query(
    "SELECT nombre, codigo, stock_actual FROM productos WHERE stock_actual < 0"
  );
  for (const row of stockNegativo.rows as any[]) {
    problemas.push({ categoria: "Stock negativo", detalle: `"${row.nombre}" (${row.codigo}) tiene stock ${row.stock_actual}` });
  }

  // 2. Créditos abonados de más
  const creditosRaros = await pool.query(
    "SELECT id, concepto, nombre_cliente, valor_credito, valor_abonado FROM creditos WHERE valor_abonado > valor_credito"
  );
  for (const row of creditosRaros.rows as any[]) {
    problemas.push({ categoria: "Crédito sobre-abonado", detalle: `#${row.id} (${row.nombre_cliente || row.concepto}): abonado ${row.valor_abonado} > total ${row.valor_credito}` });
  }

  // 3. Créditos cuyas líneas no suman el total registrado
  const lineasDesalineadas = await pool.query(`
    SELECT c.id, c.concepto, c.valor_credito, COALESCE(SUM(cl.cantidad * cl.precio_venta), 0) AS suma_lineas
    FROM creditos c
    LEFT JOIN credito_lineas cl ON cl.credito_id = c.id
    GROUP BY c.id, c.concepto, c.valor_credito
    HAVING ABS(c.valor_credito - COALESCE(SUM(cl.cantidad * cl.precio_venta), 0)) > 1
  `);
  for (const row of lineasDesalineadas.rows as any[]) {
    problemas.push({ categoria: "Crédito con líneas desalineadas", detalle: `#${row.id} (${row.concepto}): total ${row.valor_credito}, suma real ${row.suma_lineas}` });
  }

  // 4. Precio de venta menor al de compra (posible error de digitación)
  const preciosInvertidos = await pool.query(`
    SELECT nombre, codigo, precio_compra, precio_venta_sin_iva FROM productos
    WHERE precio_compra > 0 AND precio_venta_sin_iva > 0 AND precio_venta_sin_iva < precio_compra
  `);
  for (const row of preciosInvertidos.rows as any[]) {
    problemas.push({ categoria: "Precio de venta menor al de compra", detalle: `"${row.nombre}" (${row.codigo}): compra ${row.precio_compra}, venta ${row.precio_venta_sin_iva}` });
  }

  console.log(`\n=== Revisión de consistencia — ${new Date().toLocaleString("es-CO")} ===\n`);
  if (problemas.length === 0) {
    console.log("✅ No se encontró ningún problema. Todo consistente.");
  } else {
    console.log(`⚠️  Se encontraron ${problemas.length} posible(s) problema(s):\n`);
    for (const p of problemas) console.log(`  [${p.categoria}] ${p.detalle}`);
  }

  await pool.end();
  process.exit(problemas.length > 0 ? 1 : 0);
}

void verificarConsistencia().catch((err) => { console.error("Error en la revisión:", err); process.exit(1); });