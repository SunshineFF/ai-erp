import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const buildDir = fileURLToPath(new URL(".", import.meta.url));
const outputDir = fileURLToPath(new URL("..", import.meta.url));
const workbookPath = `${outputDir}一期数据导入样例.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));

for (const [sheetName, range] of [["期初库存", "A1:P8"], ["历史订单", "A1:S8"], ["财务流水", "A1:L7"]]) {
  const inspection = await workbook.inspect({
    kind: "table",
    range: `${sheetName}!${range}`,
    include: "values,formulas",
    tableMaxRows: 12,
    tableMaxCols: 20,
  });
  console.log(inspection.ndjson);
  // Rendering is attempted separately because this desktop runtime terminates during workbook.render().
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);
