// The two small numbers shown next to the Generate buttons: the credit balance and "X / 5 free left today".
// Both are display-only: the SERVER decides what is actually allowed, so a failed fetch is ignored quietly.
import { useState, useCallback, useEffect } from "react";
import { ACCOUNT_API } from "../examApi.js";
import { getToken } from "../auth.js";

export function useAccountMeters() {
  // Credits are the SAME shared `coins` wallet the Lesson Planner uses - not a separate balance. `creditBalance` is always the
  // RAW value; toDisplayCredits() is applied only at render time ("never show coins raw to the user").
  const [creditBalance, setCreditBalance] = useState(null);
  const fetchBalance = useCallback(async () => {
    try {
      const token = getToken ? getToken() : null;
      if (!token) { setCreditBalance(null); return; }
      const res = await fetch(`${ACCOUNT_API}/balance`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setCreditBalance(data.balance);
    } catch { /* balance display is non-critical - fail quietly */ }
  }, []);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // "X/5 left" on the Free button: a proactive remaining-count, not just a failure message.
  const [freeUsage, setFreeUsage] = useState(null); // { used, limit, remaining }
  const fetchFreeUsage = useCallback(async () => {
    try {
      const token = getToken ? getToken() : null;
      if (!token) { setFreeUsage(null); return; }
      const res = await fetch(`${ACCOUNT_API}/free-usage`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setFreeUsage(await res.json());
    } catch { /* non-critical - fail quietly, the server still enforces the real limit */ }
  }, []);
  useEffect(() => { fetchFreeUsage(); }, [fetchFreeUsage]);

  return { creditBalance, setCreditBalance, fetchBalance, freeUsage, fetchFreeUsage };
}
