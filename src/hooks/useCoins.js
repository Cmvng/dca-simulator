import { useCallback, useEffect, useState } from "react";
import { getCoins } from "../services/api.js";

export function useCoins() {
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ fetchedAt: null, stale: false });
  const [progress, setProgress] = useState(0);

  const load = useCallback(() => {
    setLoading(true); setError(null); setProgress(10);
    const t1 = setTimeout(() => setProgress(40), 400);
    const t2 = setTimeout(() => setProgress(75), 900);
    getCoins()
      .then(r => { setCoins(r.data); setMeta({ fetchedAt: r.fetchedAt, stale: r.stale }); setProgress(100); })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); clearTimeout(t1); clearTimeout(t2); });
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => load(), [load]);

  return { coins, loading, error, retry: load, progress, ...meta };
}
