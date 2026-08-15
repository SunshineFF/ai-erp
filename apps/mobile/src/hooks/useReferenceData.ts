import { useEffect, useState } from "react";
import { api } from "../api";
import type { ReferenceData } from "../types";

const empty: ReferenceData = { materials: [], units: [], locations: [], taxRates: [] };

export function useReferenceData(enabled: boolean) {
  const [data, setData] = useState<ReferenceData>(empty);
  const [error, setError] = useState("");
  useEffect(() => { if (enabled) void api<ReferenceData>("/materials/bootstrap").then(setData).catch((reason) => setError(reason.message)); }, [enabled]);
  return { data, error };
}
