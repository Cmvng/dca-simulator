import { useCallback, useState } from "react";
import { listPlans, savePlan, deletePlan, startTracking, stopTracking } from "../lib/savedPlans.js";
import { track } from "../lib/analytics.js";

export function useSavedPlans() {
  const [plans, setPlans] = useState(() => listPlans());
  const refresh = useCallback(() => setPlans(listPlans()), []);

  return {
    plans,
    refresh,
    save: useCallback((args) => { const p = savePlan(args); refresh(); track("plan_saved", { coin: args.coin?.id }); return p; }, [refresh]),
    remove: useCallback((id) => { deletePlan(id); refresh(); }, [refresh]),
    startTracking: useCallback((id, opts) => { const p = startTracking(id, opts); refresh(); track("plan_tracked", {}); return p; }, [refresh]),
    stopTracking: useCallback((id) => { stopTracking(id); refresh(); }, [refresh]),
  };
}
