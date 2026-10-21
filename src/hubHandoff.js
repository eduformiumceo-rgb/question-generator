/* Eduformium Hub hand-off for the Questions app.
   The hub opens this app with ?hub_code=<one-time code>. Before the app draws, take the code out of the address bar,
   swap it (through this app's own server, which checks it with the Lesson Planner) for a normal session, and save it
   the same way a normal sign-in does. The page then starts already signed in. Never throws, never waits more than a
   few seconds, and does nothing at all when there is no code. */
export async function completeHubHandoff({ win = window, store = win.localStorage, fetchFn = fetch, timeoutMs = 6000 } = {}) {
  let code = null;
  try {
    const url = new URL(win.location.href);
    code = url.searchParams.get("hub_code");
    if (code === null) return null;
    url.searchParams.delete("hub_code");
    win.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch { return null; }
  if (!code) return null;

  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn("/api/auth/hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), signal: ctl?.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token || !data.user) return null;
    store.setItem("edu_token", data.token);
    store.setItem("edu_user", JSON.stringify(data.user));
    return data.user;
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
}
