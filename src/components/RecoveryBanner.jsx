/**
 * RecoveryBanner - the quiet notice shown after a refresh / crash / redirect, telling the teacher what was
 * restored and what they can do about it. Flat (no shadow, like the rest of the app), announced politely to
 * screen readers, and the buttons wrap under the text on a phone instead of squeezing it.
 *
 *   tone      "info" (something was restored) | "warn" (something was interrupted)
 *   title     one short line
 *   children  optional detail text
 *   actions   [{ label, onClick, primary?, busy? }]
 *   onDismiss closes it (the little ✕)
 */
import React from "react";
import { F, S } from "../sharedStyles.jsx";

export default function RecoveryBanner({ tone = "info", title, children, actions = [], onDismiss, testId }) {
  const warn = tone === "warn";
  return (
    <div
      role="status" aria-live="polite" data-testid={testId || "recovery-banner"}
      style={{
        display: "flex", gap: 12, alignItems: "flex-start", margin: "0 0 18px", padding: "13px 14px 13px 16px",
        borderRadius: 14, fontFamily: F, boxSizing: "border-box",
        background: warn ? "var(--err-bg)" : "var(--brand-soft)",
        border: `1px solid ${warn ? "var(--err-border)" : "var(--tag-border)"}`,
        color: "var(--text-secondary)",   // only the title carries the warning colour: the notice is recoverable, not an alarm
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35, color: warn ? "var(--err-text)" : "var(--text)" }}>{title}</div>
        {children ? <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 3 }}>{children}</div> : null}
        {actions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {actions.map((a) => (
              <button
                key={a.label} type="button" onClick={a.onClick} disabled={a.busy}
                style={a.primary
                  ? { ...S.btn, height: 36, padding: "0 16px", fontSize: 13, opacity: a.busy ? 0.7 : 1 }
                  : { ...S.sm, height: 36, opacity: a.busy ? 0.7 : 1 }}
              >{a.busy ? "Please wait…" : a.label}</button>
            ))}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button" onClick={onDismiss} aria-label="Dismiss"
          style={{
            flexShrink: 0, width: 32, height: 32, margin: "-4px -4px 0 0", border: "none", borderRadius: 99, background: "transparent",
            color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  );
}
