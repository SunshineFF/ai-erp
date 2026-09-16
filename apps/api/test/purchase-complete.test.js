const assert = require("node:assert/strict");
const test = require("node:test");
const { OrdersService } = require("../dist/src/modules/orders");

// 复现：采购订单“完成并入库”曾强制要求内部批次、供应商批号、生产日期和到期日期。
// 实际业务规则：内部批次留空时按当天日期 YYYYMMDDXX 自动生成（XX 为当天序号，从 01 开始），
// 供应商批号、生产日期、到期日期均为选填。

function buildTx({ existingBatches = [], createdBatches = [], posted = [] } = {}) {
  return {
    material: { findUniqueOrThrow: async () => ({ id: "material-1", defaultLocationId: null, shelfLifeDays: 30 }) },
    inventoryBatch: {
      findMany: async (args) => existingBatches.filter((item) => item.batchNo.startsWith(args.where.batchNo.startsWith)),
      upsert: async (args) => { createdBatches.push(args.create); return { id: `batch-${createdBatches.length}`, ...args.create }; },
    },
    purchaseOrderLine: { update: async () => ({}) },
    purchaseOrder: { update: async () => ({ id: "order-1", status: "RECEIVED" }) },
  };
}

function prismaForComplete({ existingBatches = [], createdBatches = [], posted = [] } = {}) {
  const tx = buildTx({ existingBatches, createdBatches, posted });
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    warehouse: { findFirstOrThrow: async () => ({ id: "warehouse-1" }) },
    location: { findFirstOrThrow: async () => ({ id: "location-1" }) },
    purchaseOrder: { findFirstOrThrow: async () => ({ id: "order-1", documentNo: "PO-1", remark: null, supplier: { name: "供应商一" }, lines: [{ id: "line-1", lineNo: 1, materialId: "material-1", quantity: 10, unitId: "unit-1", grossAmountCny: 1130, batchNo: null, supplierBatchNo: null, productionDate: null, expiryDate: null }] }) },
    $transaction: async (callback) => callback(tx),
  };
  return { prisma, tx };
}

function serviceFor(prisma) { return new OrdersService(prisma, { post: async (client, input) => ({ id: "it-1", ...input }) }); }

test("completePurchase 内部批次留空自动生成当天批次号，供应商批号与效期选填", async () => {
  const createdBatches = [];
  const { prisma } = prismaForComplete({ createdBatches });
  const result = await serviceFor(prisma).completePurchase("order-1");
  assert.equal(result.status, "RECEIVED");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  assert.equal(createdBatches.length, 1);
  assert.match(createdBatches[0].batchNo, new RegExp(`^${today}\\d{2}$`), "批次号必须是 YYYYMMDDXX 格式");
  assert.equal(createdBatches[0].batchNo, `${today}01`, "当天第一笔批次序号为 01");
  assert.equal(createdBatches[0].supplierBatchNo, null, "供应商批号留空时保存为 null");
  assert.ok(createdBatches[0].productionDate instanceof Date, "生产日期留空时默认当天");
  assert.ok(createdBatches[0].expiryDate instanceof Date, "到期日期留空时按保质期推算");
});

test("completePurchase 当天已有批次时序号顺延", async () => {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const createdBatches = [];
  const { prisma } = prismaForComplete({ existingBatches: [{ batchNo: `${today}01` }, { batchNo: `${today}02` }], createdBatches });
  await serviceFor(prisma).completePurchase("order-1");
  assert.equal(createdBatches[0].batchNo, `${today}03`, "已占用 01、02 时顺延为 03");
});

test("completePurchase 手工填写的内部批次优先于自动生成", async () => {
  const createdBatches = [];
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    warehouse: { findFirstOrThrow: async () => ({ id: "warehouse-1" }) },
    location: { findFirstOrThrow: async () => ({ id: "location-1" }) },
    purchaseOrder: { findFirstOrThrow: async () => ({ id: "order-1", documentNo: "PO-1", remark: null, supplier: { name: "供应商一" }, lines: [{ id: "line-1", lineNo: 1, materialId: "material-1", quantity: 10, unitId: "unit-1", grossAmountCny: 1130, batchNo: "CUSTOM-BATCH", supplierBatchNo: "SUP-9", productionDate: null, expiryDate: null }] }) },
    $transaction: async (callback) => callback(buildTx({ createdBatches })),
  };
  await serviceFor(prisma).completePurchase("order-1");
  assert.equal(createdBatches[0].batchNo, "CUSTOM-BATCH");
  assert.equal(createdBatches[0].supplierBatchNo, "SUP-9");
});
