const assert = require("node:assert/strict");
const test = require("node:test");
const { OrdersService } = require("../dist/src/modules/orders");

// 复现：物料无供应商报价时，前端可能传 supplierQuoteId: ""（空字符串），
// 空字符串不是合法外键，曾导致 P2003 外键违规。服务端必须把空值规范化为 undefined。

function prismaForPurchase({ quote = null } = {}) {
  let createdOrder = null;
  let createdSupplierProducts = null;
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    supplier: { findUniqueOrThrow: async () => ({ id: "supplier-1", name: "供应商一" }) },
    supplierProduct: {
      createMany: async (args) => { createdSupplierProducts = args; return { count: args.data.length }; },
    },
    supplierProductQuote: {
      findFirst: async () => quote,
    },
    exchangeRate: { findFirst: async () => ({ rateToCny: 7 }) },
    taxRate: { findMany: async () => [] },
    material: { findMany: async () => [] },
    purchaseOrder: {
      create: async (args) => { createdOrder = args; return { id: "order-1", documentNo: "PO-1", ...args.data, lines: [] }; },
    },
  };
  return { prisma, getCreatedOrder: () => createdOrder, getCreatedSupplierProducts: () => createdSupplierProducts };
}

test("空字符串 supplierQuoteId 被规范化为 undefined，不会触发外键违规", async () => {
  const { prisma, getCreatedOrder } = prismaForPurchase();
  const service = new OrdersService(prisma, {});
  await service.createPurchase({
    supplierId: "supplier-1",
    orderDate: "2026-09-15",
    currencyCode: "CNY",
    lines: [{ materialId: "material-1", quantity: 10, unitId: "unit-1", unitPrice: 100, supplierQuoteId: "" }],
  });
  const created = getCreatedOrder();
  const line = created.data.lines.create[0];
  assert.equal(line.supplierQuoteId, undefined, "空字符串必须被规范化为 undefined");
  assert.ok(!("supplierQuoteId" in line) || line.supplierQuoteId === undefined);
});

test("无报价的行允许保存，supplierQuoteId 不写入数据库", async () => {
  const { prisma, getCreatedOrder } = prismaForPurchase({ quote: null });
  const service = new OrdersService(prisma, {});
  await service.createPurchase({
    supplierId: "supplier-1",
    orderDate: "2026-09-15",
    currencyCode: "CNY",
    lines: [{ materialId: "material-1", quantity: 10, unitId: "unit-1", unitPrice: 100 }],
  });
  const line = getCreatedOrder().data.lines.create[0];
  assert.equal(line.supplierQuoteId, undefined);
});

test("采购物料自动加入供应商供应列表（跳过已存在）", async () => {
  const { prisma, getCreatedSupplierProducts } = prismaForPurchase();
  const service = new OrdersService(prisma, {});
  await service.createPurchase({
    supplierId: "supplier-1",
    orderDate: "2026-09-15",
    currencyCode: "CNY",
    lines: [
      { materialId: "material-1", quantity: 10, unitId: "unit-1", unitPrice: 100 },
      { materialId: "material-1", quantity: 5, unitId: "unit-1", unitPrice: 100 },
      { materialId: "material-2", quantity: 3, unitId: "unit-1", unitPrice: 50 },
    ],
  });
  const args = getCreatedSupplierProducts();
  assert.equal(args.skipDuplicates, true);
  assert.deepEqual(args.data.map((item) => item.materialId), ["material-1", "material-2"], "重复物料去重后加入供应列表");
});

test("指定了无效 supplierQuoteId 时返回业务错误而非外键违规", async () => {
  const { prisma } = prismaForPurchase({ quote: null });
  const service = new OrdersService(prisma, {});
  await assert.rejects(
    () => service.createPurchase({
      supplierId: "supplier-1",
      orderDate: "2026-09-15",
      currencyCode: "CNY",
      lines: [{ materialId: "material-1", quantity: 10, unitId: "unit-1", unitPrice: 100, supplierQuoteId: "quote-not-exist" }],
    }),
    (error) => error.getStatus?.() === 400 && /供应商报价不存在/.test(error.message),
  );
});
