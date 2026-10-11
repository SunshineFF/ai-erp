
-- ============================================================
-- 业务主数据导入脚本（物料 / 供应商 / 采购订单）
-- 数据来源：开发库导出（pg_dump），生产环境导入用
-- 说明：
--   1. 执行前请确保生产库已完成  db:migrate（表结构已建）
--   2. 基础档案表(Company/Currency/Unit等)若线上已初始化(seed/手工配置)，
--      请先核对是否与本脚本冲突；本脚本直接 INSERT 会因主键重复报错
--   3. 业务表(Material/Supplier/PurchaseOrder等)以开发库UUID原样导入，
--      内部外键自洽，可直接使用
--   4. 全程包在事务中，任一失败整体回滚
--   5. 执行：psql "$PROD_DATABASE_URL" -f import-business-data.sql
-- ============================================================
BEGIN;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public;

-- ===== 0. 解析线上基础档案 id（psql 变量） =====
-- 线上已由 db:seed 创建 Company(MAIN)、Unit(KG/PCS)、TaxRate(VAT-*)，
-- 此处按业务键从线上取回其真实 id，供下方业务表外键引用。
SELECT id FROM public."Company" WHERE code = 'MAIN' ORDER BY "createdAt" LIMIT 1 \gset v_company

-- ===== 1. 其它基础档案（斜线上 seed 未建或可补充的，保留开发库 UUID 直接插入） =====

-- ===== Currency =====
INSERT INTO public."Currency" (code, name, symbol, "decimalPlaces", "isBaseCurrency", "isActive") VALUES ('CNY', '人民币', '¥', 2, true, true) ON CONFLICT (code) DO NOTHING;
INSERT INTO public."Currency" (code, name, symbol, "decimalPlaces", "isBaseCurrency", "isActive") VALUES ('USD', '美元', '$', 2, false, true) ON CONFLICT (code) DO NOTHING;


--
-- Data for Name: ExchangeRate; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."ExchangeRate" (id, "companyId", "currencyCode", "rateDate", "rateToCny", "maintainedById", "isActive", "createdAt") VALUES ('a5cd28b1-036e-4627-b691-331be75fbd84', :'v_company', 'USD', '2026-08-01', 7.18000000, NULL, true, '2026-08-09 23:56:15.746') ON CONFLICT ("companyId", "currencyCode", "rateDate") DO NOTHING;


--
-- Data for Name: MaterialCategory; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."MaterialCategory" (id, "companyId", code, name, "isActive") VALUES ('23456810-77a8-4125-b8d5-bad3dbf8f2d0', :'v_company', 'A', '原料', true) ON CONFLICT ("companyId", code) DO NOTHING;
INSERT INTO public."MaterialCategory" (id, "companyId", code, name, "isActive") VALUES ('d0a89119-69f1-4715-8b54-4cc4715961e6', :'v_company', 'B', '辅料', true) ON CONFLICT ("companyId", code) DO NOTHING;
INSERT INTO public."MaterialCategory" (id, "companyId", code, name, "isActive") VALUES ('3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', :'v_company', 'Z', '空心橡胶球', true) ON CONFLICT ("companyId", code) DO NOTHING;
INSERT INTO public."MaterialCategory" (id, "companyId", code, name, "isActive") VALUES ('eac525b2-2437-4f93-a8b0-5e1997e094b5', :'v_company', 'F', '成品', true) ON CONFLICT ("companyId", code) DO NOTHING;
INSERT INTO public."MaterialCategory" (id, "companyId", code, name, "isActive") VALUES ('0fc84bd8-644e-486a-8444-6f1d43640447', :'v_company', 'R', '原材料', true) ON CONFLICT ("companyId", code) DO NOTHING;


--
-- Data for Name: ProductAttribute; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."ProductAttribute" (id, "companyId", code, name, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ('b801e8ea-ad49-48f0-a273-53afe2e72a51', :'v_company', 'J-COLOR', '色胶颜色', 0, true, '2026-09-03 04:00:23.045', '2026-09-03 04:00:23.045') ON CONFLICT ("companyId", code) DO NOTHING;
INSERT INTO public."ProductAttribute" (id, "companyId", code, name, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ('b7024e4d-5b23-4000-8b9d-829b96bdcfb2', :'v_company', 'Q-COLOR', '常规颜色', 0, true, '2026-09-03 15:18:50.912', '2026-09-03 15:18:50.912') ON CONFLICT ("companyId", code) DO NOTHING;


--
-- Data for Name: ProductAttributeValue; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."ProductAttributeValue" (id, "attributeId", code, name, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ('be5646a7-26c0-402c-a72a-cae273895851', 'b801e8ea-ad49-48f0-a273-53afe2e72a51', '1655', '红色', 0, true, '2026-09-03 04:00:23.06', '2026-09-03 04:00:23.06') ON CONFLICT ("attributeId", code) DO NOTHING;
INSERT INTO public."ProductAttributeValue" (id, "attributeId", code, name, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ('ab989deb-cc14-44f0-ab30-539b02fc28d0', 'b7024e4d-5b23-4000-8b9d-829b96bdcfb2', 'GREEN', '绿色', 0, true, '2026-09-03 15:18:50.933', '2026-09-03 15:18:50.933') ON CONFLICT ("attributeId", code) DO NOTHING;
INSERT INTO public."ProductAttributeValue" (id, "attributeId", code, name, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ('953f8df9-219e-457c-88e6-9b0f36ddd2b5', 'b7024e4d-5b23-4000-8b9d-829b96bdcfb2', 'BLUE', '蓝色', 1, true, '2026-09-03 15:18:50.947', '2026-09-03 15:18:50.947') ON CONFLICT ("attributeId", code) DO NOTHING;
INSERT INTO public."ProductAttributeValue" (id, "attributeId", code, name, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ('f491580c-b419-4154-8108-4be571c4f52a', 'b7024e4d-5b23-4000-8b9d-829b96bdcfb2', 'RED', '红色', 2, true, '2026-09-03 15:18:50.961', '2026-09-03 15:18:50.961') ON CONFLICT ("attributeId", code) DO NOTHING;


--
-- Data for Name: SystemSetting; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."SystemSetting" (id, "companyId", "settingKey", "settingValue", description, "updatedAt") VALUES ('80e16856-eadc-4b39-8e33-36bc399a2d30', :'v_company', 'inventory.reversal_window_days', '7', '库存冲销允许时限（天）', '2026-08-08 07:28:03.472') ON CONFLICT ("companyId", "settingKey") DO NOTHING;
INSERT INTO public."SystemSetting" (id, "companyId", "settingKey", "settingValue", description, "updatedAt") VALUES ('22d9a08c-d930-41ac-a689-ab24c493b930', :'v_company', 'finance.period_closed', 'false', '财务期间是否已结账', '2026-08-09 23:53:54.242') ON CONFLICT ("companyId", "settingKey") DO NOTHING;


--
-- Data for Name: TaxRate; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."TaxRate" (id, "companyId", code, name, rate, "effectiveFrom", "effectiveTo", "isActive") VALUES ('f932c73c-874c-461a-a1a0-7fbb1aed6b0c', :'v_company', 'VAT-0.13', '增值税 13%', 0.1300, '2020-01-01', NULL, true) ON CONFLICT ("companyId", code, "effectiveFrom") DO NOTHING;
INSERT INTO public."TaxRate" (id, "companyId", code, name, rate, "effectiveFrom", "effectiveTo", "isActive") VALUES ('af911136-732a-4da4-95e1-bbc665e6cb4a', :'v_company', 'VAT-0.09', '增值税 9%', 0.0900, '2020-01-01', NULL, true) ON CONFLICT ("companyId", code, "effectiveFrom") DO NOTHING;
INSERT INTO public."TaxRate" (id, "companyId", code, name, rate, "effectiveFrom", "effectiveTo", "isActive") VALUES ('9c53d641-ced3-4ae7-aaa3-4ac1918f2be6', :'v_company', 'VAT-0.06', '增值税 6%', 0.0600, '2020-01-01', NULL, true) ON CONFLICT ("companyId", code, "effectiveFrom") DO NOTHING;
INSERT INTO public."TaxRate" (id, "companyId", code, name, rate, "effectiveFrom", "effectiveTo", "isActive") VALUES ('a880eba5-9a16-4453-bcdf-7a5d7c3d964d', :'v_company', 'VAT-0.03', '增值税 3%', 0.0300, '2020-01-01', NULL, true) ON CONFLICT ("companyId", code, "effectiveFrom") DO NOTHING;
INSERT INTO public."TaxRate" (id, "companyId", code, name, rate, "effectiveFrom", "effectiveTo", "isActive") VALUES ('6b18c468-2cae-49fa-9e46-1c653cc7ce4b', :'v_company', 'VAT-0', '增值税 0%', 0.0000, '2020-01-01', NULL, true) ON CONFLICT ("companyId", code, "effectiveFrom") DO NOTHING;


--
-- Data for Name: Unit; Type: TABLE DATA; Schema: public; Owner: -
--

-- Unit：KG / PCS 已由 seed 创建，此处只补 seed 未建的 G 单位
INSERT INTO public."Unit" (id, "companyId", code, name, "precision", "isActive") VALUES ('9ff0eb0e-93c6-4915-ab8c-4b930a15c3cc', :'v_company', 'G', '克', 3, true)
ON CONFLICT ("companyId", code) DO NOTHING;

-- 解析线上 KG / PCS 单位的真实 id（seed 已创建）
SELECT id FROM public."Unit" WHERE "companyId" = :'v_company' AND code = 'KG' LIMIT 1 \gset v_unit_kg
SELECT id FROM public."Unit" WHERE "companyId" = :'v_company' AND code = 'PCS' LIMIT 1 \gset v_unit_pcs


-- ===== 2. 业务主数据 =====
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('e672004c-427c-4c24-a74a-79e2a6ba000d', :'v_company', 'A00001', '3L-标胶', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-02 14:34:42.017', '2026-09-02 14:34:42.017', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('e36f5563-38eb-4c74-8a71-567df3da153b', :'v_company', 'A00007', '硫酸钡', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:55:22.85', '2026-09-20 04:40:26.354', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('2270b034-15a1-4f5f-99be-8ec84a8f28ce', :'v_company', 'Z00003', '常规7.5cm系列', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:25.885', '2026-09-20 03:28:46.275', NULL, NULL, true, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('900068ea-75c2-4632-8a93-a888792e6f4c', :'v_company', 'Z00002', '常规9cm系列', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:07.393', '2026-09-20 03:30:18.269', NULL, NULL, true, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('faa7b50f-d1f3-465f-8336-07c163ef2013', :'v_company', 'Z00001', '常规6cm系列', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:19:30.905', '2026-09-20 03:30:23.633', NULL, NULL, true, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('9804c3b6-e96f-465f-b48b-283d1940b51f', :'v_company', 'Z00001-RED', '常规6cm系列 · 红色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:19:30.927', '2026-09-20 04:40:26.305', NULL, 'faa7b50f-d1f3-465f-8336-07c163ef2013', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('cfc4a3e2-9025-413b-af4b-b48bf501731d', :'v_company', 'Z00002-GREEN', '常规9cm系列 · 绿色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:07.402', '2026-09-20 04:40:26.313', NULL, '900068ea-75c2-4632-8a93-a888792e6f4c', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('9021d2ff-8b72-4f94-ab1c-8c7c4b2fd9f8', :'v_company', 'A00002', 'BR9000-白胶', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-02 14:35:00.535', '2026-09-20 04:40:26.318', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('cac6cf51-9a92-4a5c-b8e3-353240719558', :'v_company', 'A00003', 'H860-高苯', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:46:33.013', '2026-09-20 04:40:26.325', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('796fb0cc-17bb-42d1-b930-543a490227bb', :'v_company', 'A00004', 'DPG', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:46:55.301', '2026-09-20 04:40:26.33', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('384a0d4d-0cc5-4923-b88c-e83ce504db6e', :'v_company', 'A00006', '轻质碳酸镁', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:54:48.476', '2026-09-20 04:40:26.335', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('916e622b-70c9-451e-9b20-2f8847a1c203', :'v_company', 'Z00002-BLUE', '常规9cm系列 · 蓝色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:07.406', '2026-09-20 04:40:26.34', NULL, '900068ea-75c2-4632-8a93-a888792e6f4c', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('ffc209a1-1046-45b3-aacb-dca762951a70', :'v_company', 'Z00002-RED', '常规9cm系列 · 红色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:07.41', '2026-09-20 04:40:26.344', NULL, '900068ea-75c2-4632-8a93-a888792e6f4c', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('762739bc-20b2-4809-9c5e-4eb2cb54838f', :'v_company', 'A00005', '轻质碳酸钙-轻钙', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:54:34.1', '2026-09-20 04:40:26.349', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('65d81da6-8658-4c4d-91f1-64329b171b1f', :'v_company', 'A00008', '氧化锌', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:55:34.029', '2026-09-20 04:40:26.359', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('8eed82a0-d0af-4e52-91a1-353bc8340f5c', :'v_company', 'A00009', 'DM', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:55:43.057', '2026-09-20 04:40:26.364', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('98c2859e-04cb-4d52-87ab-172cff133c82', :'v_company', 'A00010', 'PEG', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:55:52.22', '2026-09-20 04:40:26.378', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('5e41eb86-58e8-4cc0-991e-1b67809efa6a', :'v_company', 'A00011', 'H-80', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:56:02.945', '2026-09-20 04:40:26.383', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('30096df6-17eb-451e-9ec3-f50d144ec5f0', :'v_company', 'A00012', '硬脂酸', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:56:11.81', '2026-09-20 04:40:26.387', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('be61b4bc-3be9-4b64-badb-07e63bf24bb8', :'v_company', 'A00013', '白油', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:56:18.94', '2026-09-20 04:40:26.392', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('c6579986-0e06-40d0-9b57-f9445e8f245f', :'v_company', 'A00014', 'SP', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:56:23.241', '2026-09-20 04:40:26.398', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('90114b38-dc78-4a85-9965-d1e632694fe0', :'v_company', 'A00015', '钛白粉', NULL, '23456810-77a8-4125-b8d5-bad3dbf8f2d0', 'RAW_MATERIAL', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 03:56:52.78', '2026-09-20 04:40:26.404', NULL, NULL, false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('eafde140-828c-48d7-98fb-b7b37de303cc', :'v_company', 'B00001', '色胶-翔发', NULL, 'd0a89119-69f1-4715-8b54-4cc4715961e6', 'AUXILIARY', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 08:56:25.015', '2026-09-20 04:40:26.409', NULL, NULL, true, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('3c3e5fc3-88f9-423d-8a68-07f3d89e51f8', :'v_company', 'Z00001-GREEN', '常规6cm系列 · 绿色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:19:30.917', '2026-09-20 04:40:26.419', NULL, 'faa7b50f-d1f3-465f-8336-07c163ef2013', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('ae4de273-fc63-43f2-8cfc-dc2e5c7aaace', :'v_company', 'Z00001-BLUE', '常规6cm系列 · 蓝色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:19:30.923', '2026-09-20 04:40:26.423', NULL, 'faa7b50f-d1f3-465f-8336-07c163ef2013', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('1f5df588-d15d-477d-bfc4-50581a947214', :'v_company', 'Z00003-BLUE', '常规7.5cm系列 · 蓝色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:25.899', '2026-09-20 04:40:26.428', NULL, '2270b034-15a1-4f5f-99be-8ec84a8f28ce', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('16d32738-2dea-41c5-84e1-ab171ae3345c', :'v_company', 'Z00003-RED', '常规7.5cm系列 · 红色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:25.903', '2026-09-20 04:40:26.434', NULL, '2270b034-15a1-4f5f-99be-8ec84a8f28ce', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('7d27de85-c292-47e9-a4e0-fb9501fafbb6', :'v_company', 'Z00003-GREEN', '常规7.5cm系列 · 绿色', NULL, '3aed98e0-f55c-48e3-9a7a-1b5ad9230f09', 'RAW_MATERIAL', :'v_unit_pcs', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 15:20:25.894', '2026-09-20 04:40:26.369', NULL, '2270b034-15a1-4f5f-99be-8ec84a8f28ce', false, NULL, NULL);
INSERT INTO public."Material" (id, "companyId", code, name, specification, "categoryId", "materialType", "baseUnitId", "batchRequired", "expiryRule", "shelfLifeDays", "expiryWarningDays", "defaultTaxRateId", "defaultLocationId", "minStockQty", purchasable, saleable, manufacturable, "isActive", "createdAt", "updatedAt", "imageUrl", "parentMaterialId", "variantEnabled", "imageStorageKey", "imageStorageProvider") VALUES ('c34acebe-44a1-483c-b49f-6b5fbd6a3abe', :'v_company', 'B00001-1655', '色胶-翔发 · 红色', NULL, 'd0a89119-69f1-4715-8b54-4cc4715961e6', 'AUXILIARY', :'v_unit_kg', true, 'SUPPLIER_LABEL_FIRST', NULL, 30, NULL, NULL, NULL, false, false, false, true, '2026-09-03 08:56:25.036', '2026-09-20 04:40:26.414', NULL, 'eafde140-828c-48d7-98fb-b7b37de303cc', false, NULL, NULL);


--
-- Data for Name: MaterialAttribute; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."MaterialAttribute" (id, "materialId", "attributeId") VALUES ('7f96ab2d-0206-4990-a055-f8e55cc44d6d', 'eafde140-828c-48d7-98fb-b7b37de303cc', 'b801e8ea-ad49-48f0-a273-53afe2e72a51');
INSERT INTO public."MaterialAttribute" (id, "materialId", "attributeId") VALUES ('4401518b-1420-4922-8ae5-0e372289cdc7', 'faa7b50f-d1f3-465f-8336-07c163ef2013', 'b7024e4d-5b23-4000-8b9d-829b96bdcfb2');
INSERT INTO public."MaterialAttribute" (id, "materialId", "attributeId") VALUES ('a2354be3-cf62-48cb-9b33-7aac58ff81bb', '900068ea-75c2-4632-8a93-a888792e6f4c', 'b7024e4d-5b23-4000-8b9d-829b96bdcfb2');
INSERT INTO public."MaterialAttribute" (id, "materialId", "attributeId") VALUES ('cccdc768-b0a3-449e-afd1-5a6509ff7e39', '2270b034-15a1-4f5f-99be-8ec84a8f28ce', 'b7024e4d-5b23-4000-8b9d-829b96bdcfb2');


--
-- Data for Name: MaterialVariantValue; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('a7c02a7c-82b4-4587-a331-c53c2d85d438', 'c34acebe-44a1-483c-b49f-6b5fbd6a3abe', 'be5646a7-26c0-402c-a72a-cae273895851');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('b3b9235b-025c-42d9-bf74-77d368f58d0c', '3c3e5fc3-88f9-423d-8a68-07f3d89e51f8', 'ab989deb-cc14-44f0-ab30-539b02fc28d0');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('bb720c58-3dae-4c08-a468-a11ab39416aa', 'ae4de273-fc63-43f2-8cfc-dc2e5c7aaace', '953f8df9-219e-457c-88e6-9b0f36ddd2b5');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('3b821a17-9bfb-4bf6-b7eb-56fd7eacd384', '9804c3b6-e96f-465f-b48b-283d1940b51f', 'f491580c-b419-4154-8108-4be571c4f52a');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('faa3260a-a4c2-4986-915a-6747735c5870', 'cfc4a3e2-9025-413b-af4b-b48bf501731d', 'ab989deb-cc14-44f0-ab30-539b02fc28d0');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('734112db-11d6-4dbb-aec7-f81d66adead0', '916e622b-70c9-451e-9b20-2f8847a1c203', '953f8df9-219e-457c-88e6-9b0f36ddd2b5');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('6ade74a0-24a5-4944-b6f9-cdb263990720', 'ffc209a1-1046-45b3-aacb-dca762951a70', 'f491580c-b419-4154-8108-4be571c4f52a');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('af13505b-ab7b-4920-8ff6-1bc7438425e0', '7d27de85-c292-47e9-a4e0-fb9501fafbb6', 'ab989deb-cc14-44f0-ab30-539b02fc28d0');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('7e8bf2d7-47e4-4a5b-b726-86109de06d80', '1f5df588-d15d-477d-bfc4-50581a947214', '953f8df9-219e-457c-88e6-9b0f36ddd2b5');
INSERT INTO public."MaterialVariantValue" (id, "materialId", "attributeValueId") VALUES ('ece1f1c9-2573-43d0-a2c6-e3840bfc6897', '16d32738-2dea-41c5-84e1-ab171ae3345c', 'f491580c-b419-4154-8108-4be571c4f52a');


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."Supplier" (id, "companyId", code, name, "contactName", phone, address, "currencyCode", "isActive", "createdAt", "updatedAt", "materialCategoryId") VALUES ('df26bd6a-fde1-48c2-8244-421d9ddaf49d', :'v_company', 'AS00001', '胶友通', '冯总', '', '', 'CNY', true, '2026-09-14 01:57:12.438', '2026-09-14 01:57:12.438', '23456810-77a8-4125-b8d5-bad3dbf8f2d0');
INSERT INTO public."Supplier" (id, "companyId", code, name, "contactName", phone, address, "currencyCode", "isActive", "createdAt", "updatedAt", "materialCategoryId") VALUES ('5fd191a2-5e74-4491-ae54-c1a8fda9c2cd', :'v_company', 'AS00002', '金元宝', '侯总', '', '', 'CNY', true, '2026-09-14 01:58:25.481', '2026-09-14 01:58:25.481', '23456810-77a8-4125-b8d5-bad3dbf8f2d0');
INSERT INTO public."Supplier" (id, "companyId", code, name, "contactName", phone, address, "currencyCode", "isActive", "createdAt", "updatedAt", "materialCategoryId") VALUES ('c0cb2680-cffb-4899-975f-83d5132a036e', :'v_company', 'AS00003', '大广', '黄总', '', '', 'CNY', true, '2026-09-14 01:59:27.487', '2026-09-14 01:59:27.487', '23456810-77a8-4125-b8d5-bad3dbf8f2d0');


--
-- Data for Name: PurchaseOrder; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."PurchaseOrder" (id, "documentNo", "companyId", "supplierId", status, "orderDate", "expectedDate", "currencyCode", "taxRateId", "totalAmount", remark, "createdAt", "updatedAt", "exchangeRate", "exchangeRateDate", "netAmount", "taxAmount", "totalAmountCny") VALUES ('4214b236-ba03-49ef-a6dc-12f8bc15baf4', 'PO-1789456917103', :'v_company', 'df26bd6a-fde1-48c2-8244-421d9ddaf49d', 'RECEIVED', '2026-09-15', NULL, 'CNY', NULL, 5661.00, '', '2026-09-15 07:21:57.104', '2026-09-15 08:10:15.93', 1.00000000, '2026-09-15', 5661.00, 0.00, 5661.00);


--
-- Data for Name: SupplierProduct; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."SupplierProduct" (id, "supplierId", "materialId", "isActive", remark, "createdAt", "updatedAt") VALUES ('96d7c3e4-73b9-4f06-aa94-3fedcbcc3ef0', 'df26bd6a-fde1-48c2-8244-421d9ddaf49d', 'e672004c-427c-4c24-a74a-79e2a6ba000d', true, NULL, '2026-09-15 06:07:33.878', '2026-09-15 06:07:33.878');
INSERT INTO public."SupplierProduct" (id, "supplierId", "materialId", "isActive", remark, "createdAt", "updatedAt") VALUES ('f10212f8-bd8d-4786-9037-bc67ccf4ede7', 'c0cb2680-cffb-4899-975f-83d5132a036e', '90114b38-dc78-4a85-9965-d1e632694fe0', true, NULL, '2026-09-20 14:41:29.287', '2026-09-20 14:41:29.287');
INSERT INTO public."SupplierProduct" (id, "supplierId", "materialId", "isActive", remark, "createdAt", "updatedAt") VALUES ('a59a5024-a282-4772-895d-828c4cb6a88b', 'c0cb2680-cffb-4899-975f-83d5132a036e', 'c6579986-0e06-40d0-9b57-f9445e8f245f', true, NULL, '2026-09-20 14:42:05.395', '2026-09-20 14:42:05.395');


--
-- Data for Name: SupplierProductQuote; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: PurchaseOrderLine; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."PurchaseOrderLine" (id, "orderId", "lineNo", "materialId", quantity, "receivedQty", "unitId", "unitPrice", "taxRateId", "batchNo", "productionDate", "expiryDate", "grossAmount", "grossAmountCny", "netAmount", "returnedQty", "supplierBatchNo", "taxAmount", "taxRateSnapshot", "supplierQuoteId", "priceBasis", "supplierTaxRateSnapshot", "taxExcludedPrice", "taxRate") VALUES ('1a5adfc2-eb03-4cd5-8e9b-fc0080af4674', '4214b236-ba03-49ef-a6dc-12f8bc15baf4', 1, 'e672004c-427c-4c24-a74a-79e2a6ba000d', 333.000000, 333.000000, :'v_unit_kg', 17.000000, NULL, NULL, NULL, NULL, 5661.00, 5661.00, 5661.00, 0.000000, '', 0.00, 0.0000, NULL, 'TAX_INCLUDED', 0.0000, 17.000000, 0.0000);


-- PostgreSQL database dump complete
-- ===== 导入数据结束 =====

COMMIT;
