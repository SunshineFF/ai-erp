import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = fileURLToPath(new URL("..", import.meta.url));
const outputPath = `${outputDir}一期数据导入样例.xlsx`;

const workbook = Workbook.create();

const headerFormat = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};

const titleFormat = {
  fill: "#164E63",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};

const noteFormat = {
  fill: "#F0FDFA",
  font: { color: "#134E4A", italic: true },
  wrapText: true,
  verticalAlignment: "center",
};

function prepareSheet(sheet, title, note, lastColumn) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${lastColumn}1`).format = titleFormat;
  sheet.getRange(`A1:${lastColumn}1`).format.rowHeight = 28;
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[note]];
  sheet.getRange(`A2:${lastColumn}2`).format = noteFormat;
  sheet.getRange(`A2:${lastColumn}2`).format.rowHeight = 36;
}

function styleDataRange(sheet, headerRange, dataRange, dateRanges = [], numberRanges = []) {
  sheet.getRange(headerRange).format = headerFormat;
  sheet.getRange(headerRange).format.rowHeight = 30;
  sheet.getRange(dataRange).format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  for (const range of dateRanges) sheet.getRange(range).format.numberFormat = "yyyy-mm-dd";
  for (const range of numberRanges) sheet.getRange(range).format.numberFormat = "#,##0.00";
}

const opening = workbook.worksheets.add("期初库存");
prepareSheet(
  opening,
  "一期数据导入样例 - 期初库存",
  "仅导入可用、冻结或隔离的期初批次；物料编码、批次号、数量、单位、生产日期和到期日期为必填字段。金额以人民币（CNY）为本位币。",
  "P",
);
opening.getRange("A4:P4").values = [[
  "物料编码", "物料名称", "物料类型", "内部批次号", "供应商批号", "库位", "库存状态", "数量", "单位", "单位成本(CNY)", "库存金额(CNY)", "生产日期", "到期日期", "供应商", "期初日期", "备注",
]];
opening.getRange("A5:P8").values = [
  ["RM-NR-001", "天然橡胶", "原材料", "B-NR-20260725", "SUP-NR-0725", "原料区-A01", "可用", 1000, "KG", 12.5, 12500, new Date("2026-07-25"), new Date("2027-07-24"), "华东橡胶供应商", new Date("2026-08-01"), "期初盘点导入"],
  ["RM-CB-001", "炭黑 N330", "原材料", "B-CB-20260610", "SUP-CB-0610", "原料区-A02", "可用", 500, "KG", 8.2, 4100, new Date("2026-06-10"), new Date("2027-06-09"), "华北炭黑供应商", new Date("2026-08-01"), "期初盘点导入"],
  ["SP-MIX-001", "EPDM 混炼胶", "半成品", "B-MIX-20260730", "MO-20260730-001", "生产暂存区-C01", "可用", 320, "KG", 18.65, 5968, new Date("2026-07-30"), new Date("2026-10-28"), "自产", new Date("2026-08-01"), "关联历史生产订单"],
  ["FG-OR-001", "EPDM 密封圈", "成品", "B-FG-20260731", "MO-20260731-002", "成品区-D01", "可用", 8000, "PCS", 1.48, 11840, new Date("2026-07-31"), new Date("2027-07-30"), "自产", new Date("2026-08-01"), "可用于销售发货"],
];
styleDataRange(opening, "A4:P4", "A5:P8", ["L5:M8", "O5:O8"], ["H5:H8", "J5:K8"]);
opening.getRange("A4:P8").format.wrapText = true;
opening.getRange("A4:P8").format.verticalAlignment = "center";
opening.freezePanes.freezeRows(4);
opening.getRange("A:P").format.columnWidth = 14;
opening.getRange("B:B").format.columnWidth = 18;
opening.getRange("D:E").format.columnWidth = 17;
opening.getRange("N:N").format.columnWidth = 20;
opening.getRange("P:P").format.columnWidth = 18;
opening.tables.add("A4:P8", true, "OpeningInventory");

const orders = workbook.worksheets.add("历史订单");
prepareSheet(
  orders,
  "一期数据导入样例 - 历史订单",
  "一行代表一张订单的一个物料行。未税金额、税额、含税金额及人民币折算金额为公式列；导入正式数据时可提供已计算值或由系统复算。",
  "S",
);
orders.getRange("A4:S4").values = [[
  "单据类型", "单据编号", "单据日期", "往来单位", "物料编码", "物料名称", "数量", "单位", "交易币种", "汇率(CNY)", "未税单价", "税率", "未税金额", "税额", "含税金额", "人民币未税金额", "人民币含税金额", "状态", "来源单据号",
]];
orders.getRange("A5:L8").values = [
  ["采购订单", "PO-202607-001", new Date("2026-07-15"), "华东橡胶供应商", "RM-NR-001", "天然橡胶", 1000, "KG", "CNY", 1, 12.5, 0.13],
  ["采购订单", "PO-202607-002", new Date("2026-07-18"), "华北炭黑供应商", "RM-CB-001", "炭黑 N330", 500, "KG", "CNY", 1, 8.2, 0.13],
  ["销售订单", "SO-202607-001", new Date("2026-07-29"), "苏州密封件客户", "FG-OR-001", "EPDM 密封圈", 3000, "PCS", "CNY", 1, 2.1, 0.13],
  ["销售订单", "SO-202607-002", new Date("2026-07-30"), "US Rubber Parts LLC", "FG-OR-001", "EPDM 密封圈", 2000, "PCS", "USD", 7.18, 0.31, 0],
];
orders.getRange("M5").formulas = [["=G5*K5"]];
orders.getRange("M5:Q8").fillDown();
orders.getRange("N5:N8").formulas = [["=M5*L5"], ["=M6*L6"], ["=M7*L7"], ["=M8*L8"]];
orders.getRange("O5:O8").formulas = [["=M5+N5"], ["=M6+N6"], ["=M7+N7"], ["=M8+N8"]];
orders.getRange("P5:P8").formulas = [["=M5*J5"], ["=M6*J6"], ["=M7*J7"], ["=M8*J8"]];
orders.getRange("Q5:Q8").formulas = [["=O5*J5"], ["=O6*J6"], ["=O7*J7"], ["=O8*J8"]];
orders.getRange("R5:S8").values = [["已完成", "采购入库单-PI-202607-001"], ["已完成", "采购入库单-PI-202607-002"], ["已完成", "销售出库单-SO-202607-001"], ["已完成", "销售出库单-SO-202607-002"]];
styleDataRange(orders, "A4:S4", "A5:S8", ["C5:C8"], ["G5:G8", "J5:Q8"]);
orders.getRange("L5:L8").format.numberFormat = "0%";
orders.getRange("A4:S8").format.wrapText = true;
orders.getRange("A4:S8").format.verticalAlignment = "center";
orders.freezePanes.freezeRows(4);
orders.getRange("A:S").format.columnWidth = 14;
orders.getRange("D:D").format.columnWidth = 22;
orders.getRange("F:F").format.columnWidth = 18;
orders.getRange("S:S").format.columnWidth = 24;
orders.getRange("I5:I100").dataValidation = { rule: { type: "list", values: ["CNY", "USD"] } };
orders.getRange("A5:A100").dataValidation = { rule: { type: "list", values: ["采购订单", "销售订单"] } };
orders.tables.add("A4:S8", true, "HistoricalOrders");

const cash = workbook.worksheets.add("财务流水");
prepareSheet(
  cash,
  "一期数据导入样例 - 财务流水",
  "一期财务流水仅用于导入、查询、标注与关联订单，不执行自动核销或凭证生成。人民币金额由交易金额和汇率公式计算。",
  "L",
);
cash.getRange("A4:L4").values = [[
  "流水日期", "流水编号", "收支类型", "往来单位", "交易币种", "汇率(CNY)", "交易金额", "人民币金额", "关联订单号", "摘要", "来源文件名", "备注",
]];
cash.getRange("A5:G7").values = [
  [new Date("2026-07-20"), "BANK-20260720-001", "付款", "华东橡胶供应商", "CNY", 1, 14125],
  [new Date("2026-07-31"), "BANK-20260731-001", "收款", "苏州密封件客户", "CNY", 1, 7119],
  [new Date("2026-08-02"), "BANK-20260802-001", "收款", "US Rubber Parts LLC", "USD", 7.18, 620],
];
cash.getRange("H5:H7").formulas = [["=F5*G5"], ["=F6*G6"], ["=F7*G7"]];
cash.getRange("I5:L7").values = [
  ["PO-202607-001", "采购订单付款", "银行流水-20260720.xlsx", "待人工关联采购入库单"],
  ["SO-202607-001", "销售订单收款", "银行流水-20260731.xlsx", "一期仅查询，不自动核销"],
  ["SO-202607-002", "美元销售订单收款", "bank-statement-20260802.xlsx", "汇率按流水日期维护"],
];
styleDataRange(cash, "A4:L4", "A5:L7", ["A5:A7"], ["F5:H7"]);
cash.getRange("A4:L7").format.wrapText = true;
cash.getRange("A4:L7").format.verticalAlignment = "center";
cash.freezePanes.freezeRows(4);
cash.getRange("A:L").format.columnWidth = 16;
cash.getRange("D:D").format.columnWidth = 22;
cash.getRange("J:J").format.columnWidth = 20;
cash.getRange("K:L").format.columnWidth = 25;
cash.getRange("C5:C100").dataValidation = { rule: { type: "list", values: ["收款", "付款"] } };
cash.getRange("E5:E100").dataValidation = { rule: { type: "list", values: ["CNY", "USD"] } };
cash.tables.add("A4:L7", true, "FinancialFlows");

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
