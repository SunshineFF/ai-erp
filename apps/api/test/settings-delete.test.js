const assert = require("node:assert/strict");
const test = require("node:test");
const { SettingsService } = require("../dist/src/modules/settings");

function responseCode(error) {
  const response = error.getResponse?.() ?? error.response;
  return typeof response === "object" ? response.code : undefined;
}

test("无引用物料分类会物理删除并返回统一结果", async () => {
  let deletedId;
  const prisma = {
    materialCategory: { findUnique: async () => ({ id: "category-1", name: "原料" }), delete: async ({ where }) => { deletedId = where.id; } },
    material: { count: async () => 0 },
    supplier: { count: async () => 0 },
  };
  const result = await new SettingsService(prisma).removeCategory("category-1");
  assert.equal(deletedId, "category-1");
  assert.deepEqual(result, { deleted: true, id: "category-1" });
});

test("存在业务引用的分类返回 DELETE_CONFLICT 且不删除", async () => {
  let removed = false;
  const prisma = {
    materialCategory: { findUnique: async () => ({ id: "category-1", name: "原料" }), delete: async () => { removed = true; } },
    material: { count: async () => 2 },
    supplier: { count: async () => 0 },
  };
  await assert.rejects(() => new SettingsService(prisma).removeCategory("category-1"), (error) => responseCode(error) === "DELETE_CONFLICT");
  assert.equal(removed, false);
});

test("不存在的设置对象返回 404", async () => {
  const prisma = { materialCategory: { findUnique: async () => null }, material: { count: async () => 0 }, supplier: { count: async () => 0 } };
  await assert.rejects(() => new SettingsService(prisma).removeCategory("missing"), (error) => error.getStatus?.() === 404);
});

test("本位币受保护不能删除", async () => {
  const prisma = { currency: { findUnique: async () => ({ code: "CNY", isBaseCurrency: true }) } };
  await assert.rejects(() => new SettingsService(prisma).removeCurrency("CNY"), (error) => error.getStatus?.() === 400);
});

test("仓库存在库位或库存历史时返回依赖明细", async () => {
  const prisma = {
    warehouse: { findUnique: async () => ({ id: "warehouse-1", name: "主仓" }), delete: async () => assert.fail("不应执行删除") },
    location: { count: async () => 1 },
    productionOrder: { count: async () => 0 },
    inventoryBalance: { count: async () => 2 },
    inventoryTransaction: { count: async () => 3 },
  };
  await assert.rejects(() => new SettingsService(prisma).removeWarehouse("warehouse-1"), (error) => {
    const response = error.getResponse();
    return response.code === "DELETE_CONFLICT" && response.dependencies.length === 3;
  });
});

test("无历史引用的汇率会物理删除", async () => {
  let removed = false;
  const prisma = {
    exchangeRate: { findUnique: async () => ({ id: "rate-1", currencyCode: "USD", rateDate: new Date("2026-08-01") }), delete: async () => { removed = true; } },
    auditLog: { count: async () => 0 },
  };
  const result = await new SettingsService(prisma).removeExchangeRate("rate-1");
  assert.equal(removed, true);
  assert.deepEqual(result, { deleted: true, id: "rate-1" });
});
