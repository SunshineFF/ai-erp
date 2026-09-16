export type ViewKey = "home" | "production" | "purchase" | "shipment" | "finance";

export type User = {
  id: string;
  username: string;
  displayName: string;
  permissions: string[];
};

export type Material = {
  id: string;
  code: string;
  name: string;
  baseUnitId: string;
  purchasable: boolean;
  saleable: boolean;
  manufacturable: boolean;
  materialType: string;
  isActive: boolean;
  parentMaterialId?: string | null;
  variantEnabled?: boolean;
  variantValues?: Array<{ attributeValueId: string; attributeValue?: { code: string; name: string; attribute?: { name: string } } }>;
};

export type ReferenceData = {
  materials: Material[];
  units: Array<{ id: string; code: string; name: string }>;
  locations: Array<{ id: string; code: string; name: string }>;
  taxRates: Array<{ id: string; name: string }>;
};

export type OrderLineDraft = {
  key: number;
  materialId: string;
  quantity: string;
  unitId: string;
  unitPrice: string;
  supplierQuoteId?: string;
  priceBasis?: "TAX_INCLUDED" | "CASH";
  supplierTaxRateSnapshot?: number;
};

export const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
export const blankOrderLine = (): OrderLineDraft => ({ key: Date.now() + Math.random(), materialId: "", quantity: "1", unitId: "", unitPrice: "0", priceBasis: "TAX_INCLUDED" });
