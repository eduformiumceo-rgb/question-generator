/**
 * FormControls - small shared controls of the paper generator: the on/off switch, the segmented choice group and the
 * generation progress panel. Split out of QuestionsGenerator.jsx; they hold no state of the page.
 */
import React from "react";
import { F } from "../sharedStyles.jsx";

/** Accessible on/off switch. A single <button> - no hidden checkbox inside a <label>,
 *  which previously fired twice per tap (span onClick + label→input onChange) and
 *  cancelled itself out, so the toggles appeared dead. */
export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative", width: 44, height: 26, flexShrink: 0, marginLeft: 12, padding: 0,
        border: "none", borderRadius: 99, cursor: "pointer", transition: "background .15s",
        background: checked ? "var(--btn)" : "var(--border-strong)",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", transition: "left .15s", pointerEvents: "none", boxShadow: "none",
      }} />
    </button>
  );
}

/** Progress panel: real per-section fill, an animated "working" segment, elapsed time. */
/** Compact segmented control: one clearly-labelled choice group (professional toolbar look). */
export function Segmented({ label, value, onChange, options, ariaLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: "none", color: "var(--text-secondary)", fontFamily: F }}>{label}</span>
      <div role="group" aria-label={ariaLabel || label} style={{ display: "inline-flex", border: "1px solid var(--border-strong)", borderRadius: 9, overflow: "hidden", background: "var(--card-bg)" }}>
        {options.map((o, i) => {
          const on = value === o.id;
          return (
            <button key={o.id} type="button" title={o.title} aria-pressed={on} onClick={() => onChange(o.id)} style={{
              height: 34, padding: "0 13px", minWidth: o.compact ? 34 : undefined, border: "none", cursor: "pointer",
              borderLeft: i === 0 ? "none" : "1px solid var(--border-strong)",
              background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--tag-text)" : "var(--text)",
              fontFamily: F, fontSize: 13, fontWeight: on ? 700 : 500,
            }}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

export function GenerationProgress({ progress, elapsed }) {
  const total = Math.max(progress?.total || 1, 1);
  const done = progress?.sectionsDone?.size || 0;
  const current = Math.min(progress?.index || 1, total);
  const mm = Math.floor(elapsed / 60), ss = String(elapsed % 60).padStart(2, "0");
  return (
    <div style={{ marginBottom: 10 }} aria-live="polite">
      <style>{`@keyframes qgPulse{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < done;
          const isActive = !isDone && i === done;
          return (
            <div key={i} style={{
              flex: 1, height: 6, borderRadius: 3,
              background: isDone || isActive ? "#0D9488" : "var(--border)",
              animation: isActive ? "qgPulse 1.2s ease-in-out infinite" : "none",
              transition: "background .2s",
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
        <span>{progress?.sectionLabel ? `Writing ${progress.sectionLabel} (${current} of ${total})` : "Starting…"}</span>
        <span>{mm}:{ss}</span>
      </div>
    </div>
  );
}

