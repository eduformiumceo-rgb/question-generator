/* Single sign-in through the Eduformium Hub. File: src/hubSignIn.js
   OFF by default. It turns on when the build variable VITE_HUB_URL is set to the hub's address
   (e.g. https://app.eduformium.com). While it is off, this app's own sign-in window works exactly as before.

   When on, every "Sign in" in this app sends the person to the hub (/?return=planner). The hub signs them in
   (or notices they already are) and brings them straight back here with a one-time code (see completeHubHandoff in auth.js).

   Loop guard: if we already sent them to the hub in the last 20 seconds and they are back here still signed out,
   the hand-off did not work, so we show this app's own sign-in window instead of bouncing them again. */
const GUARD_KEY = "edu_hub_redirect_at";
const GUARD_MS = 20000;

export function cleanHubUrl(value) {
  const v = String(value || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+$/i.test(v) || /^http:\/\/localhost(:\d+)?$/i.test(v) ? v : "";
}
export const hubSignInUrl = (hub, app) => `${cleanHubUrl(hub)}/?return=${encodeURIComponent(app)}`;
export const guardAllows = (last, now = Date.now()) => !(Number.isFinite(last) && last > 0 && now - last >= 0 && now - last < GUARD_MS);

const HUB = cleanHubUrl(import.meta.env?.VITE_HUB_URL);
export const hubSignInEnabled = () => !!HUB;

/* Returns true when the person was sent to the hub (the caller then does nothing else). */
export function goToHubSignIn(app, { hub = HUB, storage, now = Date.now(), assign } = {}) {
  const base = cleanHubUrl(hub);
  if (!base) return false;
  try {
    const s = storage || globalThis.sessionStorage;
    const last = Number(s.getItem(GUARD_KEY) || 0);
    if (!guardAllows(last, now)) return false;
    s.setItem(GUARD_KEY, String(now));
    (assign || ((u) => globalThis.location.assign(u)))(hubSignInUrl(base, app));
    return true;
  } catch { return false; }
}
