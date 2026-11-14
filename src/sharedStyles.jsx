/**
 * sharedStyles.jsx
 * ─────────────────────────────────────────────────────────────────
 * Exact copy of the style tokens already defined inline in App.jsx
 * (the `F` font constant, the `S` style object, and `THEME_CSS`).
 * They are copied here — not reinvented — so the Questions Generator
 * renders pixel-identically to the Lesson Planner without needing to
 * touch App.jsx.
 *
 * BEST PRACTICE: if you're comfortable editing App.jsx, delete this
 * file and instead add `export` in front of the existing `const F =`
 * and `const S =` declarations there, then import from "./App.jsx"
 * everywhere below. That guarantees the two apps can never drift.
 * ─────────────────────────────────────────────────────────────────
 */

export const F = "'DM Sans',system-ui,-apple-system,sans-serif";

export const S = {
  card: { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 18, padding: "32px 28px 28px", marginBottom: 20, boxShadow: "none" },
  lbl:  { fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: F, display: "block", marginBottom: 7, fontWeight: 600 },
  sel:  {
    background: "var(--input-bg)", border: "1.5px solid var(--border-strong)", borderRadius: 12, padding: "12px 16px",
    color: "var(--text)", fontSize: 15, fontFamily: F, outline: "none", width: "100%", boxSizing: "border-box",
    cursor: "pointer", appearance: "none", WebkitAppearance: "none", minHeight: 48,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239CA3AF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 38,
  },
  inp: { background: "var(--input-bg)", border: "1.5px solid var(--border-strong)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 15, fontFamily: F, outline: "none", width: "100%", boxSizing: "border-box", minHeight: 48 },
  btn: { background: "#0D9488", border: "none", borderRadius: 99, padding: "0 24px", height: 50, color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "0.01em", cursor: "pointer", fontFamily: F, transition: "background .16s,color .16s,opacity .16s,transform .1s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
  sm:  { background: "transparent", border: "1.5px solid var(--border-strong)", borderRadius: 99, padding: "0 16px", height: 40, color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", fontFamily: F, transition: "background .16s,border-color .16s,color .16s,opacity .16s,transform .1s", display: "inline-flex", alignItems: "center", gap: 6, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
  danger: { background: "transparent", border: "1.5px solid rgba(220,38,38,0.25)", borderRadius: 99, padding: "0 16px", height: 40, color: "var(--red-text)", fontSize: 13, cursor: "pointer", fontFamily: F, transition: "background .16s,border-color .16s,opacity .16s,transform .1s", display: "inline-flex", alignItems: "center", gap: 6, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
  out: { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 18, padding: "20px", marginTop: 14, boxShadow: "none" },
  err: { background: "var(--err-bg)", border: "1px solid var(--err-border)", borderRadius: 12, padding: "12px 14px", color: "var(--err-text)", fontFamily: F, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 8 },
};

export const Spinner = () => (
  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.25)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin .75s linear infinite", display: "inline-block", flexShrink: 0 }} />
);
