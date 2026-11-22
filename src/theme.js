/**
 * theme.js - Light / Auto / Dark. Light is the default.
 * The choice is saved under "glpg_theme" (same key AuthCallback already reads).
 * "auto" follows the device setting and updates live if the device switches.
 */
export const THEME_KEY = "glpg_theme";
export const THEME_MODES = ["light", "auto", "dark"];

export function getThemeMode() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "system") return "auto"; // older saved value
    return THEME_MODES.includes(v) ? v : "light";
  } catch { return "light"; }
}

const prefersDark = () => {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
};
export const resolveTheme = (mode) => (mode === "dark" || (mode === "auto" && prefersDark()) ? "dark" : "light");

export function applyTheme(mode, { animate = true } = {}) {
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  if (animate) { root.classList.add("theme-switching"); requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching"))); }
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#1C1C1E" : "#0D9488");
}

export function setThemeMode(mode) {
  if (!THEME_MODES.includes(mode)) mode = "light";
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode: still applies this session */ }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent("edu-theme-change", { detail: mode }));
}

/** Call once at startup: applies the saved mode and tracks device changes while in "auto". */
export function initTheme() {
  applyTheme(getThemeMode(), { animate: false });
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (getThemeMode() === "auto") applyTheme("auto"); };
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
  } catch { /* ignore */ }
}
