import { useEffect, useState } from "react";
import { api } from "../api";
import type { ReferenceData } from "../types";

const empty: ReferenceData = { materials: [], units: [], locations: [], taxRates: [] };

export function useReferenceData(enabled: boolean) {
  const [data, setData] = useState<ReferenceData>(empty);
  const [error, setError] = useState("");
  useEffect(() => { if (enabled) void Promise.all([api<ReferenceData>("/materials/bootstrap"), api<ReferenceData["materials"]>("/materials/options")]).then(([base, materials]) => setData({ ...base, materials })).catch((reason) => setError(reason.message)); }, [enabled]);
  return { data, error };
}
