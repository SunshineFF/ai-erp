const assert = require("node:assert/strict");
const test = require("node:test");
const { BomsService } = require("../dist/src/modules/boms");

// BOM 产出物料允许直接选择多属性产品族（配方对全部变体通用，无需下钻 SKU）；
// 投入物料仍必须是普通物料或具体 SKU。

function buildPrisma({ parents = [], createdBoms = [], outputMaterial = { id: "family-1", isActive: true } } = {}) {
  const prisma = {
    material: {
      findUnique: async (args) => (outputMaterial && args.where.id === outputMaterial.id ? outputMaterial : null),
      findFirst: async (args) => parents.find((item) => args.where.id.in.includes(item.id)) ?? null,
    },
    company: { findFirstOrThrow: async () => ({ id: "company-1" }) },
    bom: { create: async (args) => { createdBoms.push(args.data); return { id: "bom-1", ...args.data }; } },
  };
  return { prisma, createdBoms };
}

function serviceFor(prisma) { return new BomsService(prisma); }

const baseBody = { outputMaterialId: "family-1", versionNo: "V1", standardOutputQty: 100, outputUnitId: "unit-1", effectiveFrom: "2026-09-16", items: [{ inputMaterialId: "raw-1", requiredQty: 50, unitId: "unit-1" }] };

test("create 产出物料为多属性产品族时允许创建 BOM", async () => {
  const { prisma, createdBoms } = buildPrisma({ parents: [] });
  await serviceFor(prisma).create(baseBody);
  assert.equal(createdBoms.length, 1);
  assert.equal(createdBoms[0].outputMaterialId, "family-1", "产品族可直接作为 BOM 产出物料");
});

test("create 投入物料为多属性产品族时被拒绝", async () => {
  const { prisma, createdBoms } = buildPrisma({ parents: [{ id: "family-1", name: "产品族 A" }] });
  await assert.rejects(
    () => serviceFor(prisma).create({ ...baseBody, items: [{ inputMaterialId: "family-1", requiredQty: 50, unitId: "unit-1" }] }),
    /必须选择具体 SKU/,
    "投入物料不可使用产品族",
  );
  assert.equal(createdBoms.length, 0);
});

test("create 投入物料为具体 SKU 时允许创建 BOM", async () => {
  const { prisma, createdBoms } = buildPrisma({ parents: [] });
  await serviceFor(prisma).create({ ...baseBody, items: [{ inputMaterialId: "sku-1", requiredQty: 10, unitId: "unit-1" }] });
  assert.equal(createdBoms.length, 1, "SKU 可作为投入物料");
});

test("create 产出物料为空时被拒绝", async () => {
  const { prisma, createdBoms } = buildPrisma({ parents: [] });
  await assert.rejects(
    () => serviceFor(prisma).create({ ...baseBody, outputMaterialId: "" }),
    /请选择产出物料/,
    "空产出物料不可保存",
  );
  assert.equal(createdBoms.length, 0);
});

test("create 产出物料不存在时被拒绝", async () => {
  const { prisma, createdBoms } = buildPrisma({ parents: [], outputMaterial: null });
  await assert.rejects(
    () => serviceFor(prisma).create(baseBody),
    /产出物料不存在/,
    "产出物料必须真实存在",
  );
  assert.equal(createdBoms.length, 0);
});
