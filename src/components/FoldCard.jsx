/**
 * FoldCard - a card whose body folds away, with a one-line summary of the current choices while it is closed.
 * Used for settings that already have good defaults (difficulty, marking scheme, diagrams): on a phone they start
 * closed, so the page is a short list of things that need a decision; on desktop they start open.
 * (No matchMedia, e.g. in tests: starts open.)
 */
import React, { useState } from "react";
import Icon from "./Icon.jsx";

const onPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;

export default function FoldCard({ title, summary, S, F, children, startOpen }) {
  const [open, setOpen] = useState(startOpen ?? !onPhone());
  return (
    <div style={S.card} className="qa-fold">
      <h3 className="qa-fold-h" style={{ fontFamily: F }}>
        <button type="button" className="qa-fold-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span className="qa-fold-text">
            <span className="qa-fold-title">{title}</span>
            {!open && summary && <span className="qa-fold-sum">{summary}</span>}
          </span>
          <span className={`qa-fold-chev${open ? " is-open" : ""}`} aria-hidden="true"><Icon name="chevron" size={18} /></span>
        </button>
      </h3>
      {open && <div className="qa-fold-body">{children}</div>}
    </div>
  );
}
