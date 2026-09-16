import { useEffect, useState } from "react";
import { request } from "../api";
export function useReferenceData() { const [data, setData] = useState<any>({ units: [], categories: [], locations: [], taxRates: [] }); useEffect(() => { void request<any>("/materials/bootstrap").then(setData); }, []); return data; }
