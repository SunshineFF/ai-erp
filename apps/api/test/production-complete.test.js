const assert = require("node:assert/strict");
const test = require("node:test");
const { ProductionService } = require("../dist/src/modules/production");

// 完工入库支持报废数量：
// 1. 完工可同时申报报废数量：完工数量入库存、报废数量不入库（不创建批次、不过账）；
// 2. 完工 + 报废 累计不得超过计划数量；
// 3. 完成判定：累计完工 + 累计报废 = 计划数量即生产单完成（COMPLETED）；
// 4. 允许纯报废提交（完工 0）用于收尾剩余量。

function prismaFor({ outputLines } = {}) {
  const order = { id: "mo-1", documentNo: "MO-1", status: "IN_PROGRESS", companyId: "company-1", warehouseId: "warehouse-1", targetLocationId: "location-1", sourceSalesOrderId: null, materials: [], outputLines };
  const createdBatches = [];
  const posted = [];
  const lineUpdates = [];
  const orderUpdates = [];
  // 产出明细的可变状态：update 时按 increment 累加，findMany 返回刷新后的状态。
  const state = outputLines.map((line) => ({ ...line, completedQty: Number(line.completedQty), scrapQty: Number(line.scrapQty) }));
  const tx = {
    createdBatches, posted, lineUpdates, orderUpdates,
    inventoryBatch: { create: async (args) => { createdBatches.push(args.data); return { id: `batch-${createdBatches.length}`, ...args.data }; } },
    inventoryTransaction: { findMany: async () => [{ amountDeltaCny: -100, quantityDelta: -10, batchId: "in-batch-1", materialId: "raw-1" }] },
    productionOutputLine: {
      update: async (args) => {
        lineUpdates.push(args);
        const target = state.find((line) => line.id === args.where.id);
        if (target) {
          target.completedQty += args.data.completedQty?.increment ?? 0;
          target.scrapQty += args.data.scrapQty?.increment ?? 0;
        }
        return {};
      },
      findMany: async () => state,
    },
    productionOrder: {
      update: async (args) => { orderUpdates.push(args); return {}; },
      findUniqueOrThrow: async () => ({ ...order, outputLines: state, materials: [], salesOrderLinks: [] }),
    },
    productionOrderLink: { findMany: async () => [] },
    salesOrder: { updateMany: async () => ({ count: 0 }) },
    batchGenealogy: { upsert: async () => ({}) },
  };
  const prisma = {
    productionOrder: { findFirstOrThrow: async () => order },
    $transaction: async (callback) => callback(tx),
  };
  return { prisma, tx };
}

function serviceFor(prisma, tx) { return new ProductionService(prisma, { post: async (client, input) => { tx.posted.push(input); return { id: `it-${input.idempotencyKey}`, ...input }; } }); }

const baseLine = { outputLineId: "out-1", quantity: 10, batchNo: "B-1", productionDate: "2026-10-01", expiryDate: "2027-10-01" };

test("complete 完工数量入库存、报废数量不创建批次不过账", async () => {
  const outputLines = [{ id: "out-1", materialId: "fg-1", unitId: "unit-1", plannedQty: 100, completedQty: 0, scrapQty: 0 }];
  const updatedLines = [{ id: "out-1", plannedQty: 100, completedQty: 80, scrapQty: 20 }];
  const { prisma, tx } = prismaFor({ outputLines, updatedLines });
  await serviceFor(prisma, tx).complete("mo-1", [{ ...baseLine, quantity: 80, scrapQty: 20 }], "key-1");
  assert.equal(tx.createdBatches.length, 1, "只有完工数量创建一个成品批次");
  assert.equal(tx.posted.length, 1, "只有完工数量过账一次");
  assert.equal(tx.posted[0].quantityDelta, 80, "入库数量 = 完工数量，不含报废");
  assert.equal(tx.lineUpdates[0].data.completedQty.increment, 80);
  assert.equal(tx.lineUpdates[0].data.scrapQty.increment, 20, "报废数量累加到 scrapQty");
});

test("complete 完工+报废累计超过计划数量被拒绝", async () => {
  const outputLines = [{ id: "out-1", materialId: "fg-1", unitId: "unit-1", plannedQty: 100, completedQty: 0, scrapQty: 0 }];
  const { prisma, tx } = prismaFor({ outputLines });
  await assert.rejects(
    () => serviceFor(prisma, tx).complete("mo-1", [{ ...baseLine, quantity: 90, scrapQty: 20 }], "key-2"),
    /超过计划数量/,
    "完工 90 + 报废 20 > 计划 100 应被拒绝",
  );
});

test("complete 完工+报废=计划时生产单完成（COMPLETED）", async () => {
  const outputLines = [{ id: "out-1", materialId: "fg-1", unitId: "unit-1", plannedQty: 100, completedQty: 0, scrapQty: 0 }];
  const { prisma, tx } = prismaFor({ outputLines });
  await serviceFor(prisma, tx).complete("mo-1", [{ ...baseLine, quantity: 80, scrapQty: 20 }], "key-3");
  assert.equal(tx.orderUpdates[0].data.status, "COMPLETED", "完工 80 + 报废 20 = 计划 100，应完成");
  assert.equal(tx.orderUpdates[0].data.completedQty, 80, "实际完成数 = 完工数量");
  assert.equal(tx.orderUpdates[0].data.scrapQty, 20);
});

test("complete 完工+报废未达计划时保持 IN_PROGRESS", async () => {
  const outputLines = [{ id: "out-1", materialId: "fg-1", unitId: "unit-1", plannedQty: 100, completedQty: 0, scrapQty: 0 }];
  const { prisma, tx } = prismaFor({ outputLines });
  await serviceFor(prisma, tx).complete("mo-1", [{ ...baseLine, quantity: 50, scrapQty: 10 }], "key-4");
  assert.equal(tx.orderUpdates[0].data.status, "IN_PROGRESS", "完工 50 + 报废 10 < 计划 100，应保持进行中");
});

test("complete 允许纯报废提交（完工 0）收尾剩余量", async () => {
  const outputLines = [{ id: "out-1", materialId: "fg-1", unitId: "unit-1", plannedQty: 100, completedQty: 90, scrapQty: 0 }];
  const { prisma, tx } = prismaFor({ outputLines });
  await serviceFor(prisma, tx).complete("mo-1", [{ outputLineId: "out-1", quantity: 0, scrapQty: 10, batchNo: "B-1", productionDate: "2026-10-01", expiryDate: "2027-10-01" }], "key-5");
  assert.equal(tx.createdBatches.length, 0, "纯报废不创建批次");
  assert.equal(tx.posted.length, 0, "纯报废不过账");
  assert.equal(tx.orderUpdates[0].data.status, "COMPLETED", "完工 90 + 报废 10 = 计划 100，应完成");
});

test("complete 报废数量为负被拒绝", async () => {
  const outputLines = [{ id: "out-1", materialId: "fg-1", unitId: "unit-1", plannedQty: 100, completedQty: 0, scrapQty: 0 }];
  const { prisma, tx } = prismaFor({ outputLines });
  await assert.rejects(
    () => serviceFor(prisma, tx).complete("mo-1", [{ ...baseLine, quantity: 50, scrapQty: -5 }], "key-6"),
    /无效/,
    "报废数量为负应被拒绝",
  );
});
