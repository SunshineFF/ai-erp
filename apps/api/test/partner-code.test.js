const assert = require("node:assert/strict");
const test = require("node:test");
const { PartnersService } = require("../dist/src/modules/partners");

function prismaFor(kind, { existing = [], category = { id: "category-1", companyId: "company-1", partnerType: kind, code: "RAW", name: "原料供应商" }, materialCategory = { id: "material-category-1", companyId: "company-1", code: "RAW", name: "原材料" }, create } = {}) {
  let createdRecord = null;
  const prisma = {
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    partnerCategory: { findFirst: async () => category },
    materialCategory: { findFirst: async () => materialCategory },
    [kind]: {
      findMany: async () => existing,
      create: async (args) => {
        createdRecord = create ? await create(args) : args.data;
        return createdRecord;
      },
      findUniqueOrThrow: async () => createdRecord,
    },
    $transaction: async (callback) => callback(prisma),
  };
  return prisma;
}

test("供应商编码按物料分类编码 + S + 五位序号生成", async () => {
  const created = [];
  const prisma = prismaFor("supplier", { existing: [{ code: "RAWS00001" }, { code: "RAWS00009" }, { code: "RAWS100000" }, { code: "RAWSABC" }], create: async ({ data }) => { created.push(data); return data; } });
  const service = new PartnersService(prisma);
  assert.equal(await service.nextCode("supplier", "material-category-1"), "RAWS00010");
  const result = await service.createSupplier({ name: "测试供应商", materialCategoryId: "material-category-1" });
  assert.equal(result.code, "RAWS00010");
  assert.equal(created[0].code, "RAWS00010");
  assert.equal(created[0].materialCategoryId, "material-category-1");
});

test("客户编码按分类编码 + C + 五位序号生成", async () => {
  const created = [];
  const prisma = prismaFor("customer", { category: { id: "category-1", companyId: "company-1", partnerType: "customer", code: "I", name: "国内客户" }, existing: [{ code: "IC00001" }, { code: "IC00009" }, { code: "IC100000" }, { code: "ICABC" }], create: async ({ data }) => { created.push(data); return data; } });
  const service = new PartnersService(prisma);
  assert.equal(await service.nextCode("customer", "category-1"), "IC00010");
  const result = await service.createCustomer({ name: "测试客户", partnerCategoryId: "category-1" });
  assert.equal(result.code, "IC00010");
  assert.equal(created[0].code, "IC00010");
});

test("供应商编码唯一键冲突时会重新取号", async () => {
  let reads = 0;
  let creates = 0;
  const prisma = prismaFor("supplier", {
    existing: [],
    create: async ({ data }) => { creates += 1; if (creates === 1) throw { code: "P2002" }; return data; },
  });
  prisma.supplier.findMany = async () => { reads += 1; return reads === 1 ? [] : [{ code: "RAWS00001" }]; };
  const result = await new PartnersService(prisma).createSupplier({ name: "测试供应商", materialCategoryId: "material-category-1" });
  assert.equal(result.code, "RAWS00002");
  assert.equal(creates, 2);
});

test("未选择分类时拒绝生成编码", async () => {
  const service = new PartnersService(prismaFor("supplier"));
  await assert.rejects(() => service.nextCode("supplier", ""), /请选择物料分类/);
});

test("供应商未选择物料分类时拒绝创建", async () => {
  const service = new PartnersService(prismaFor("supplier"));
  await assert.rejects(() => service.createSupplier({ name: "测试供应商" }), /请选择物料分类/);
});

test("物料分类不存在时拒绝生成编码", async () => {
  const prisma = prismaFor("supplier", { materialCategory: null });
  await assert.rejects(() => new PartnersService(prisma).nextCode("supplier", "material-category-1"), /物料分类不存在/);
});

test("客户分类不存在时拒绝生成编码", async () => {
  const prisma = prismaFor("customer", { category: null });
  await assert.rejects(() => new PartnersService(prisma).nextCode("customer", "category-1"), /往来单位分类不存在/);
});
