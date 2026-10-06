const assert = require("node:assert/strict");
const test = require("node:test");
const { MaterialsService } = require("../dist/src/modules/materials");

function body() {
  return { name: "测试物料", materialType: "RAW_MATERIAL", baseUnitId: "unit-1", categoryId: "category-1" };
}

test("物料编码按分类编码和五位序号生成", async () => {
  const created = [];
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    materialCategory: { findFirst: async () => ({ id: "category-1", companyId: "company-1", code: "m", name: "原料" }) },
    material: {
      findMany: async () => [{ code: "M00001" }, { code: "M00009" }, { code: "M100000" }, { code: "MABC" }],
      create: async ({ data }) => { created.push(data); return data; },
    },
    $transaction: async (callback) => callback(prisma),
  };
  const service = new MaterialsService(prisma);
  assert.equal(await service.nextCode("category-1"), "M00010");
  const result = await service.create(body());
  assert.equal(result.code, "M00010");
  assert.equal(created[0].code, "M00010");
});

test("物料编码唯一键冲突时会重新取号", async () => {
  let reads = 0;
  let creates = 0;
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    materialCategory: { findFirst: async () => ({ id: "category-1", companyId: "company-1", code: "M", name: "原料" }) },
    material: {
      findMany: async () => { reads += 1; return reads === 1 ? [] : [{ code: "M00001" }]; },
      create: async ({ data }) => { creates += 1; if (creates === 1) throw { code: "P2002" }; return data; },
    },
    $transaction: async (callback) => callback(prisma),
  };
  const result = await new MaterialsService(prisma).create(body());
  assert.equal(result.code, "M00002");
  assert.equal(creates, 2);
});

test("多属性物料生成笛卡尔积 SKU", async () => {
  const created = [];
  const tx = {
    productAttribute: { findMany: async () => [{ id: "color", sortOrder: 1, values: [{ id: "red", code: "RED", name: "红" }, { id: "blue", code: "BLUE", name: "蓝" }] }] },
    material: {
      create: async ({ data }) => { const row = { id: data.parentMaterialId ? `sku-${created.length}` : "parent-1", ...data }; created.push(row); return row; },
      findUniqueOrThrow: async () => ({ id: "parent-1", code: "M00001", name: "产品", variants: created.filter((item) => item.parentMaterialId), attributes: [] }),
    },
    materialAttribute: { createMany: async () => undefined },
    materialVariantValue: { createMany: async () => undefined },
  };
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    materialCategory: { findFirst: async () => ({ id: "category-1", companyId: "company-1", code: "M", name: "成品" }) },
    material: { findMany: async () => [], create: async () => assert.fail("应使用事务"), count: async () => 0 },
    $transaction: async (callback) => callback(tx),
  };
  const result = await new MaterialsService(prisma).create({ ...body(), variantEnabled: true, attributes: [{ attributeId: "color", valueIds: ["red", "blue"] }] });
  assert.equal(result.variants.length, 2);
  assert.deepEqual(created.filter((item) => item.parentMaterialId).map((item) => item.code), ["M00001-RED", "M00001-BLUE"]);
});

test("物料主数据列表不返回多属性产品的 SKU", async () => {
  const calls = [];
  const prisma = {
    material: {
      findMany: async (args) => { calls.push({ method: "findMany", args }); return [{ id: "parent-1", parentMaterialId: null }]; },
      count: async (args) => { calls.push({ method: "count", args }); return 1; },
    },
  };
  const result = await new MaterialsService(prisma, {}).list({ q: "产品" });
  assert.deepEqual(result, { items: [{ id: "parent-1", parentMaterialId: null, material_type_text: "" }], total: 1, page: 1, pageSize: 20, totalPages: 1 });
  assert.deepEqual(calls.map((call) => call.args.where), [
    { parentMaterialId: null, OR: [{ code: { contains: "产品", mode: "insensitive" } }, { name: { contains: "产品", mode: "insensitive" } }] },
    { parentMaterialId: null, OR: [{ code: { contains: "产品", mode: "insensitive" } }, { name: { contains: "产品", mode: "insensitive" } }] },
  ]);
});

test("options 默认不返回产品族，topLevel=true 时仅返回顶层物料（含产品族，不含 SKU）", async () => {
  const calls = [];
  const prisma = {
    material: {
      findMany: async (args) => { calls.push(args.where); return []; },
    },
  };
  const service = new MaterialsService(prisma, {});
  await service.options();
  await service.options(undefined, undefined, "true");
  assert.deepEqual(calls[0], { isActive: true, OR: [{ parentMaterialId: null, variantEnabled: false }, { parentMaterialId: { not: null } }] }, "默认：普通物料 + SKU，不含产品族");
  assert.deepEqual(calls[1], { isActive: true, parentMaterialId: null }, "topLevel：仅顶层物料（普通物料 + 产品族），不含 SKU");
});
