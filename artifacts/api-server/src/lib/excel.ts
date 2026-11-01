import ExcelJS from "exceljs";

function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object" || value instanceof Date) return value;
  if ("result" in value) return normalizeCellValue(value.result);
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText
      .map((part) =>
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("");
  }
  return "";
}

export async function readExcelRows(
  buffer: Buffer,
  maxRows: number,
  maxColumns: number,
): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  const workbookData = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(workbookData).set(buffer);
  await workbook.xlsx.load(workbookData);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  if (worksheet.rowCount > maxRows + 1) {
    throw new Error(`El archivo supera el máximo de ${maxRows} filas`);
  }

  return Array.from({ length: worksheet.rowCount }, (_, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);
    return Array.from({ length: maxColumns }, (_, columnIndex) =>
      normalizeCellValue(row.getCell(columnIndex + 1).value),
    );
  });
}
