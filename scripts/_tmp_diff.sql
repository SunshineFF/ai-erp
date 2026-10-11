SELECT 'Unit' t, code, id FROM "Unit"
UNION ALL SELECT 'MCat', code, id FROM "MaterialCategory"
UNION ALL SELECT 'Attr', code, id FROM "ProductAttribute"
UNION ALL SELECT 'AttrVal', code, id FROM "ProductAttributeValue"
UNION ALL SELECT 'Tax', code, id FROM "TaxRate"
UNION ALL SELECT 'Company', code, id FROM "Company";
