/**
 * useSubjectData(subject) - loads one subject's curriculum data on demand and re-renders when it arrives.
 *
 *   const { ready, loading, error, retry } = useSubjectData(lookupKey);
 *
 * `ready` is true when the data is loaded OR there is nothing to load (empty or unknown subject), so callers can
 * treat "ready" as "getStrands() now tells the truth". A failed download (offline) sets `error`; retry() tries again.
 */
import { useCallback, useEffect, useState } from "react";
import { loadSubject, isSubjectLoaded, hasSubject } from "./curriculumIndex.js";

export function useSubjectData(subject) {
  const [, rerender] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(null);
  const loadable = !!subject && hasSubject(subject);
  const ready = !loadable || isSubjectLoaded(subject);

  useEffect(() => {
    setError(null);
    if (!loadable || isSubjectLoaded(subject)) return undefined;
    let alive = true;
    loadSubject(subject).then(
      () => { if (alive) rerender(n => n + 1); },
      (e) => { if (alive) setError(e instanceof Error ? e : new Error(String(e))); },
    );
    return () => { alive = false; };
  }, [subject, loadable, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  return { ready, loading: !ready && !error, error, retry };
}
