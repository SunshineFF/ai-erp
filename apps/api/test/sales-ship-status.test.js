const assert = require("node:assert/strict");
const test = require("node:test");
const { OrdersService } = require("../dist/src/modules/orders");

// 销售订单状态流转（手动出库）：
// 1. DRAFT 销售单直接出库 = 自动确认订单并出库（一步完成，无需先点确认）；
// 2. 出库单创建即过账（POSTED，已出库），全部出库后销售单回写 SHIPPED（已出库）；
// 3. 部分出库回写 PARTIALLY_SHIPPED，可继续出库直到 SHIPPED。

function salesOrderFixture(id, status, lines) {
  return { id, documentNo: `SO-${id}`, status, companyId: "company-1", customerId: "customer-1", currencyCode: "CNY", lines: lines.map((line, index) => ({ id: `line-${index}`, lineNo: index + 1, materialId: line.materialId, quantity: line.quantity, shippedQty: line.shippedQty ?? 0, unitId: "unit-1", unitPrice: line.unitPrice ?? 10, grossAmount: line.grossAmount ?? Number(line.quantity) * Number(line.unitPrice ?? 10) })) };
}

function buildPrisma({ order, updatedOrders = [], createdShipments = [], createdShipmentLines = [], updatedOrderLines = [] } = {}) {
  const tx = {
    salesShipment: {
      findUnique: async () => null,
      create: async (args) => { createdShipments.push(args.data); return { id: "shipment-1", ...args.data }; },
      findUniqueOrThrow: async () => ({ id: "shipment-1", documentNo: "OUT-1", customer: {}, shippedBy: null, order: {}, lines: [] }),
    },
    salesShipmentLine: {
      groupBy: async () => [],
      create: async (args) => { createdShipmentLines.push(args.data); return { id: `sl-${createdShipmentLines.length}`, ...args.data }; },
    },
    salesOrderLine: {
      update: async (args) => { updatedOrderLines.push(args); return {}; },
      findMany: async () => order.lines.map((line) => { const update = updatedOrderLines.find((item) => item.where.id === line.id); return update ? { ...line, shippedQty: Number(line.shippedQty) + update.data.shippedQty.increment } : line; }),
    },
    salesOrder: {
      findFirstOrThrow: async (args) => { if (args?.where?.status?.in && !args.where.status.in.includes(order.status)) { const error = new Error(`No salesOrder found`); error.code = "P2025"; throw error; } return order; },
      update: async (args) => { updatedOrders.push(args); return { ...order, ...args.data }; },
    },
    user: { findUnique: async () => ({ id: "user-1", displayName: "测试用户" }) },
  };
  const prisma = {
    warehouse: { findFirstOrThrow: async () => ({ id: "warehouse-1" }) },
    $transaction: async (callback) => callback(tx),
  };
  return { prisma, tx, updatedOrders, createdShipments, createdShipmentLines, updatedOrderLines };
}

function serviceFor(prisma) { return new OrdersService(prisma, { post: async (_client, input) => ({ id: `it-${input.idempotencyKey}`, ...input }) }); }

test("DRAFT 销售单直接出库：自动确认并全部出库后标记 SHIPPED", async () => {
  const order = salesOrderFixture("so-1", "DRAFT", [{ materialId: "fg-1", quantity: 10 }]);
  const { prisma, updatedOrders, createdShipments } = buildPrisma({ order });
  const result = await serviceFor(prisma).shipSales("so-1", { lines: [{ salesOrderLineId: "line-0", batchId: "batch-1", locationId: "location-1", quantity: 10 }] }, "key-1");
  assert.equal(result.id, "shipment-1", "应返回创建的出库单");
  assert.equal(createdShipments.length, 1, "应创建一张出库单");
  const statusUpdate = updatedOrders.find((item) => item.data.status);
  assert.equal(statusUpdate.data.status, "SHIPPED", "全部出库后销售单应标记为 SHIPPED（已出库）");
  assert.ok(statusUpdate.data.actualShipmentAt, "应回写实际出库时间");
});

test("部分出库后销售单标记 PARTIALLY_SHIPPED", async () => {
  const order = salesOrderFixture("so-2", "CONFIRMED", [{ materialId: "fg-1", quantity: 10 }]);
  const { prisma, updatedOrders } = buildPrisma({ order });
  await serviceFor(prisma).shipSales("so-2", { lines: [{ salesOrderLineId: "line-0", batchId: "batch-1", locationId: "location-1", quantity: 4 }] }, "key-2");
  const statusUpdate = updatedOrders.find((item) => item.data.status);
  assert.equal(statusUpdate.data.status, "PARTIALLY_SHIPPED", "部分出库应标记为 PARTIALLY_SHIPPED");
});

test("已取消（CANCELLED）的销售单不能出库", async () => {
  const order = salesOrderFixture("so-3", "CANCELLED", [{ materialId: "fg-1", quantity: 10 }]);
  const { prisma } = buildPrisma({ order });
  await assert.rejects(
    () => serviceFor(prisma).shipSales("so-3", { lines: [{ salesOrderLineId: "line-0", batchId: "batch-1", locationId: "location-1", quantity: 10 }] }, "key-3"),
    /No .* found/i,
    "CANCELLED 状态不在允许出库的范围内",
  );
});

test("已全部出库（SHIPPED）的销售单不能再次出库", async () => {
  const order = salesOrderFixture("so-4", "SHIPPED", [{ materialId: "fg-1", quantity: 10, shippedQty: 10 }]);
  const { prisma } = buildPrisma({ order });
  await assert.rejects(
    () => serviceFor(prisma).shipSales("so-4", { lines: [{ salesOrderLineId: "line-0", batchId: "batch-1", locationId: "location-1", quantity: 1 }] }, "key-4"),
    /No .* found/i,
    "SHIPPED 状态不允许再出库",
  );
});
