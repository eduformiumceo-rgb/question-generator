/**
 * useAutosave(value, save, { delay, enabled })
 *
 * Calls save(value) once `value` has stopped changing for `delay` ms, so typing never hammers storage.
 * It ALSO saves straight away when the page is hidden or closed ("pagehide" / "visibilitychange"):
 * mobile browsers (iOS Safari especially) often kill a background tab without ever firing "beforeunload",
 * so waiting for the debounce timer there would lose the last few seconds of work.
 *
 *   value    pass a memoised object: a new identity means "something changed"
 *   save     (value) => void | Promise. Errors are swallowed: autosave must never break the page.
 *   enabled  false pauses saving (nothing is queued while paused; the next change after enabling is saved)
 */
import { useCallback, useEffect, useRef } from "react";

export function useAutosave(value, save, { delay = 800, enabled = true } = {}) {
  const latest = useRef(value);
  const saver = useRef(save);
  const timer = useRef(null);
  const pending = useRef(false);
  const active = useRef(enabled);
  latest.current = value;
  saver.current = save;
  active.current = enabled;

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!pending.current) return;
    pending.current = false;
    if (!active.current) return; // paused: never write while paused, not even on page-hide
    try { Promise.resolve(saver.current(latest.current)).catch(() => {}); } catch { /* never break the page */ }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  }, [value, enabled, delay, flush]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush(); // leaving the screen: write whatever is still waiting
    };
  }, [flush]);
}
