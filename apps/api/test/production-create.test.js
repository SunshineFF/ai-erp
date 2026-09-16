const assert = require("node:assert/strict");
const test = require("node:test");
const { ProductionService } = require("../dist/src/modules/production");

// 生产订单创建支持关联多张销售订单：
// 1. 关联销售单时，合并后的未完成明细（quantity - shippedQty）作为生产明细初始值，可自由调整；
// 2. 但每个产出物料的计划数量不得低于关联销售单明细的未完成数量；
// 3. 未关联销售单时保持原有手工创建流程。

const BOM = { id: "bom-1", versionNo: "V1", standardOutputQty: 100, items: [{ inputMaterialId: "raw-1", requiredQty: 50, unitId: "unit-1", lossRate: 0 }] };

function salesOrderFixture(id, documentNo, lines, status = "CONFIRMED") {
  return { id, documentNo, status, customer: { name: "客户一" }, lines: lines.map((line, index) => ({ id: `${id}-line-${index}`, materialId: line.materialId, quantity: line.quantity, shippedQty: line.shippedQty ?? 0, unitId: line.unitId ?? "unit-1" })) };
}

function buildPrisma({ salesOrders = [], createdLinks = [], overrides = {} } = {}) {
  const createdOutputLines = [];
  const createdProductionOrders = [];
  const tx = {
    productionOrder: {
      create: async (args) => { createdProductionOrders.push(args.data); return { id: "mo-1", ...args.data }; },
      findUniqueOrThrow: async () => ({ id: "mo-1", status: "DRAFT", outputLines: [], materials: [], salesOrderLinks: createdLinks.map((salesOrderId) => ({ salesOrder: { id: salesOrderId, documentNo: "SO-1" } })) }),
    },
    productionOrderLink: { createMany: async (args) => { for (const item of args.data) createdLinks.push(item.salesOrderId); return { count: args.data.length }; } },
    productionOutputLine: { create: async (args) => { createdOutputLines.push(args.data); return { id: `out-${createdOutputLines.length}`, ...args.data }; } },
    productionMaterial: { createMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    material: { findFirst: async () => null },
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    warehouse: { findFirstOrThrow: async () => ({ id: "warehouse-1" }) },
    bom: { findFirst: async () => ({ ...BOM, items: [...BOM.items] }) },
    salesOrder: { findMany: async (args) => salesOrders.filter((order) => args.where.id.in.includes(order.id) && args.where.status.in.includes(order.status)) },
    $transaction: async (callback) => callback(tx),
    ...overrides,
  };
  return { prisma, tx, createdLinks, createdOutputLines, createdProductionOrders };
}

function serviceFor(prisma) { return new ProductionService(prisma, {}); }

const baseBody = { targetLocationId: "location-1", plannedDate: "2026-09-15", productionType: "MAKE_TO_ORDER" };

test("create 关联多张销售单时创建 ProductionOrderLink 并沿用未完成数量", async () => {
  const salesOrders = [
    salesOrderFixture("so-1", "SO-1", [{ materialId: "fg-1", quantity: 10, shippedQty: 4 }]),
    salesOrderFixture("so-2", "SO-2", [{ materialId: "fg-1", quantity: 8 }, { materialId: "fg-2", quantity: 5 }]),
  ];
  const { prisma, createdLinks, createdOutputLines } = buildPrisma({ salesOrders });
  const result = await serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-1", "so-2"], lines: [{ materialId: "fg-1", plannedQty: 14, unitId: "unit-1" }, { materialId: "fg-2", plannedQty: 5, unitId: "unit-1" }] });
  assert.deepEqual(createdLinks.sort(), ["so-1", "so-2"], "应为每张关联销售单创建 ProductionOrderLink");
  assert.equal(createdOutputLines.length, 2);
  assert.equal(createdOutputLines[0].plannedQty, 14, "fg-1 计划数量 = 未完成数量合计（10-4 + 8）");
  assert.equal(createdOutputLines[1].plannedQty, 5, "fg-2 计划数量 = 未完成数量 5");
  assert.ok(result.salesOrderLinks.length >= 2, "返回结果应包含关联销售单");
});

test("create 关联销售单时计划数量低于未完成数量被拒绝", async () => {
  const salesOrders = [salesOrderFixture("so-1", "SO-1", [{ materialId: "fg-1", quantity: 10, shippedQty: 2 }])];
  const { prisma } = buildPrisma({ salesOrders });
  await assert.rejects(
    () => serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-1"], lines: [{ materialId: "fg-1", plannedQty: 7, unitId: "unit-1" }] }),
    /不足/,
    "未完成数量为 8，计划 7 应被拒绝",
  );
});

test("create 关联销售单时允许超出未完成数量（自由调整）", async () => {
  const salesOrders = [salesOrderFixture("so-1", "SO-1", [{ materialId: "fg-1", quantity: 10 }])];
  const { prisma, createdOutputLines } = buildPrisma({ salesOrders });
  await serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-1"], lines: [{ materialId: "fg-1", plannedQty: 25, unitId: "unit-1" }] });
  assert.equal(createdOutputLines[0].plannedQty, 25, "允许计划数量高于未完成数量");
});

test("create 同一物料多行计划数量合并计算满足未完成数量", async () => {
  const salesOrders = [salesOrderFixture("so-1", "SO-1", [{ materialId: "fg-1", quantity: 10 }])];
  const { prisma, createdOutputLines } = buildPrisma({ salesOrders });
  await serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-1"], lines: [{ materialId: "fg-1", plannedQty: 6, unitId: "unit-1" }, { materialId: "fg-1", plannedQty: 4, unitId: "unit-1" }] });
  assert.equal(createdOutputLines.length, 2, "两行合计 10 = 未完成数量 10，应通过");
});

test("create 关联不存在或已完结的销售单被拒绝", async () => {
  const { prisma } = buildPrisma({ salesOrders: [salesOrderFixture("so-1", "SO-1", [{ materialId: "fg-1", quantity: 10 }])] });
  await assert.rejects(
    () => serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-1", "so-missing"], lines: [{ materialId: "fg-1", plannedQty: 10, unitId: "unit-1" }] }),
    /无效或已完结/,
    "so-missing 不存在，应被拒绝",
  );
});

test("create 允许关联新建（DRAFT）状态的销售单", async () => {
  const salesOrders = [salesOrderFixture("so-draft", "SO-DRAFT", [{ materialId: "fg-1", quantity: 6 }], "DRAFT")];
  const { prisma, createdLinks, createdOutputLines } = buildPrisma({ salesOrders });
  await serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-draft"], lines: [{ materialId: "fg-1", plannedQty: 6, unitId: "unit-1" }] });
  assert.deepEqual(createdLinks, ["so-draft"], "新建状态的销售单应可关联生产单");
  assert.equal(createdOutputLines[0].plannedQty, 6);
});

test("create 拒绝关联已出库（SHIPPED）状态的销售单", async () => {
  const salesOrders = [salesOrderFixture("so-shipped", "SO-SHIPPED", [{ materialId: "fg-1", quantity: 6, shippedQty: 6 }], "SHIPPED")];
  const { prisma, createdLinks } = buildPrisma({ salesOrders });
  await assert.rejects(
    () => serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-shipped"], lines: [{ materialId: "fg-1", plannedQty: 6, unitId: "unit-1" }] }),
    /无效或已完结/,
    "已出库销售单不可关联",
  );
  assert.equal(createdLinks.length, 0, "不应创建 ProductionOrderLink");
});

test("create 拒绝关联已取消（CANCELLED）状态的销售单", async () => {
  const salesOrders = [salesOrderFixture("so-cancelled", "SO-CANCELLED", [{ materialId: "fg-1", quantity: 6 }], "CANCELLED")];
  const { prisma, createdLinks } = buildPrisma({ salesOrders });
  await assert.rejects(
    () => serviceFor(prisma).create({ ...baseBody, salesOrderIds: ["so-cancelled"], lines: [{ materialId: "fg-1", plannedQty: 6, unitId: "unit-1" }] }),
    /无效或已完结/,
    "已取消销售单不可关联",
  );
  assert.equal(createdLinks.length, 0, "不应创建 ProductionOrderLink");
});

test("create 未关联销售单时保持手工创建流程（不创建 Link）", async () => {
  const { prisma, createdLinks, createdOutputLines } = buildPrisma({});
  await serviceFor(prisma).create({ ...baseBody, lines: [{ materialId: "fg-1", plannedQty: 3, unitId: "unit-1" }] });
  assert.equal(createdLinks.length, 0, "未关联销售单时不应创建 ProductionOrderLink");
  assert.equal(createdOutputLines[0].plannedQty, 3);
});

test("create 产出 SKU 无专属 BOM 时回退使用产品族 BOM", async () => {
  const familyBom = { id: "bom-family", versionNo: "V2", standardOutputQty: 100, items: [{ inputMaterialId: "raw-1", requiredQty: 50, unitId: "unit-1", lossRate: 0 }] };
  let bomCalls = 0;
  const { prisma, createdProductionOrders } = buildPrisma({
    overrides: {
      bom: { findFirst: async () => { bomCalls += 1; return bomCalls === 1 ? null : { ...familyBom, items: familyBom.items.map((item) => ({ ...item })) }; } },
      material: { findFirst: async () => null, findUnique: async () => ({ id: "sku-1", parentMaterialId: "family-1" }) },
    },
  });
  await serviceFor(prisma).create({ ...baseBody, lines: [{ materialId: "sku-1", plannedQty: 10, unitId: "unit-1" }] });
  assert.equal(bomCalls, 2, "应先查 SKU 专属 BOM，再回退产品族 BOM");
  assert.equal(createdProductionOrders[0].bomId, "bom-family", "应使用产品族 BOM");
});

test("salesOrderRequirements 合并多张销售单的未完成明细", async () => {
  const salesOrders = [
    salesOrderFixture("so-1", "SO-1", [{ materialId: "fg-1", quantity: 10, shippedQty: 4 }, { materialId: "fg-2", quantity: 3, shippedQty: 3 }]),
    salesOrderFixture("so-2", "SO-2", [{ materialId: "fg-1", quantity: 8 }]),
  ];
  const { prisma } = buildPrisma({ salesOrders });
  const result = await serviceFor(prisma).salesOrderRequirements(["so-1", "so-2"]);
  assert.equal(result.orders.length, 2);
  const fg1 = result.lines.find((line) => line.materialId === "fg-1");
  const fg2 = result.lines.find((line) => line.materialId === "fg-2");
  assert.equal(fg1.quantity, 14, "fg-1 未完成 = (10-4) + 8");
  assert.equal(fg2, undefined, "fg-2 已全部出库，不应出现在合并明细中");
});
