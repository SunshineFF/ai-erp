import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
export { createdDateInRange, ListFilters } from "../ListFilters";
export function useListQueryFilters() {
  const [params, setParams] = useSearchParams();
  const [partnerFilter, setPartnerState] = useState(params.get("partnerId") ?? ""); const [createdDate, setCreatedState] = useState(params.get("createdFrom") ?? ""); const [createdDateEnd, setCreatedEndState] = useState(params.get("createdTo") ?? "");
  useEffect(() => { setPartnerState(params.get("partnerId") ?? ""); setCreatedState(params.get("createdFrom") ?? ""); setCreatedEndState(params.get("createdTo") ?? ""); }, [params]);
  const update = (key: string, value: string, setter: (value: string) => void) => { setter(value); setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); next.set("page", "1"); return next; }); };
  const clearFilters = () => { setPartnerState(""); setCreatedState(""); setCreatedEndState(""); setParams((current) => { const next = new URLSearchParams(current); ["partnerId", "createdFrom", "createdTo"].forEach((key) => next.delete(key)); next.set("page", "1"); return next; }); };
  return { partnerFilter, createdDate, createdDateEnd, setPartnerFilter: (value: string) => update("partnerId", value, setPartnerState), setCreatedDate: (value: string) => update("createdFrom", value, setCreatedState), setCreatedDateEnd: (value: string) => update("createdTo", value, setCreatedEndState), clearFilters };
}
