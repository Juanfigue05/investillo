import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  parseClientesExcel,
  parseInventarioBasico,
  parseInventarioCompleto,
} from "../lib/excel-import-parsers";

async function crearLibro(
  filas: (string | number | boolean | null)[][],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet("Datos").addRows(filas);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe("importaciones Excel", () => {
  it("importa las columnas y omite filas sin nombre de clientes", async () => {
    const buffer = await crearLibro([
      ["NOMBRE", "TELEFONO", "CORREO", "NOTAS"],
      [
        "Ana Pérez",
        "3001234567 - 3117654321",
        "ana@example.com",
        "Cliente frecuente",
      ],
      [null, "3000000000", null, null],
    ]);

    await expect(parseClientesExcel(buffer)).resolves.toEqual({
      rows: [
        {
          nombre: "Ana Pérez",
          telefono: "3001234567",
          telefono2: "3117654321",
          correo: "ana@example.com",
          notas: "Cliente frecuente",
        },
      ],
      omitidos: [3],
    });
  });

  it("importa la plantilla básica de inventario", async () => {
    const buffer = await crearLibro([
      [
        "CODIGO",
        "NOMBRE",
        "REFERENCIA",
        "REFERENCIA 2",
        "MARCA",
        "SE COMPRA",
        "SE VENDE A",
        "CANTIDAD",
      ],
      ["P-01", "Bujía", "NGK", "B7HS", "NGK", 10000, 20000, 3],
    ]);

    await expect(parseInventarioBasico(buffer)).resolves.toEqual({
      rows: [
        {
          codigo: "P-01",
          nombre: "Bujía",
          referencia: "NGK B7HS",
          marca: "NGK",
          precioCompra: "10000",
          precioVentaSinIva: "20000",
          precioVentaConIva: "24000",
          cantidad: 3,
        },
      ],
      skipped: [],
    });
  });

  it("importa los campos de la plantilla completa de inventario", async () => {
    const buffer = await crearLibro([
      [
        "CODIGO",
        "NOMBRE",
        "MARCA",
        "TIPO",
        "REFERENCIA",
        "ADICIONAL",
        "PRECIO COMPRA",
        "PRECIO VENTA (SIN IVA)",
        "APLICA IVA",
        "STOCK LOCAL",
        "STOCK BODEGA",
        "STOCK MINIMO",
        "PRECIO CON IVA",
      ],
      [
        "P-02",
        "Cadena",
        "DID",
        "Transmisión",
        "428H",
        "Refuerzo",
        12500,
        30000,
        "SI",
        2,
        4,
        1,
        35700,
      ],
    ]);

    await expect(parseInventarioCompleto(buffer)).resolves.toEqual([
      {
        codigo: "P-02",
        nombre: "Cadena",
        marca: "DID",
        tipo: "Transmisión",
        referencia: "428H",
        adicional: "Refuerzo",
        precioCompra: 12500,
        precioVentaSinIva: 30000,
        tieneIva: true,
        stockLocal: 2,
        stockBodega: 4,
        stockMinimo: 1,
      },
    ]);
  });
});
