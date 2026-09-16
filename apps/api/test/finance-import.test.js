const assert = require("node:assert/strict");
const test = require("node:test");
const ExcelJS = require("exceljs");
const { FinanceService } = require("../dist/src/modules/finance");

async function workbookFile(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("财务流水");
  sheet.addRow(["流水日期", "流水编号", "收支类型", "交易币种", "交易金额", "描述"]);
  rows.forEach((row) => sheet.addRow(row));
  return { originalname: "财务流水.xlsx", mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 1, buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

test("财务流水模板包含导入所需字段", async () => {
  const service = new FinanceService({}, {});
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await service.cashFlowTemplate());
  const headers = workbook.getWorksheet("财务流水").getRow(1).values.slice(1);
  assert.deepEqual(headers, ["流水日期", "流水编号", "收支类型", "交易币种", "交易金额", "描述"]);
});

test("同一导入文件内相同日期和金额会被拒绝", async () => {
  const service = new FinanceService({}, {});
  const file = await workbookFile([
    ["2026-08-16", "CF-A", "支出", "CNY", 100, "采购"],
    ["2026-08-16", "CF-B", "收入", "CNY", 100, "回款"],
  ]);
  await assert.rejects(() => service.importCashFlows(file), (error) => error.response?.message === "财务流水导入校验失败" && error.response.errors.some((message) => message.includes("相同日期和金额")));
});

test("手工新增与历史相同日期和金额会被拒绝", async () => {
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1", baseCurrencyCode: "CNY" }) },
    cashFlow: { findFirst: async () => ({ id: "existing" }) },
  };
  const service = new FinanceService(prisma, {});
  await assert.rejects(() => service.createCashFlow({ occurredAt: "2026-08-16", flowType: "OUTFLOW", amount: 100, description: "重复" }), /同一时间同一金额只能存在一笔/);
});

test("现金流水返回可累加的真实金额并按最新记录排序", async () => {
  let query;
  const prisma = {
    cashFlow: {
      findMany: async (args) => {
        query = args;
        return [
          { id: "flow-2", flowType: "OUTFLOW", amount: 25.5, currencyCode: "CNY" },
          { id: "flow-1", flowType: "INFLOW", amount: 100, currencyCode: "CNY" },
        ];
      },
      count: async () => 2,
    },
  };
  const service = new FinanceService(prisma, {});
  const rows = await service.cashFlows();
  assert.deepEqual(rows.items.map((row) => row.actualAmount), [-25.5, 100]);
  assert.equal(rows.total, 2);
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("有效 Excel 流水会批量写入", async () => {
  const created = [];
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1", baseCurrencyCode: "CNY" }) },
    $transaction: async (callback) => callback({ cashFlow: { findFirst: async () => null, create: async ({ data }) => { created.push(data); return { id: `flow-${created.length}`, ...data }; } } }),
  };
  const service = new FinanceService(prisma, {});
  const file = await workbookFile([["2026-08-16", "", "收入", "CNY", 88.5, "客户回款"]]);
  const result = await service.importCashFlows(file);
  assert.equal(result.imported, 1);
  assert.equal(created[0].flowType, "INFLOW");
});
