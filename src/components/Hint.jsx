/**
 * Hint - long explanatory text that folds away on a phone.
 *   Desktop: the text is always shown (small, muted).
 *   Phone:   a small "Details" link opens it; closed by default, so the form stays short and scannable.
 * The switch between the two is pure CSS (.qa-hint-btn / .qa-collapsible in theme.css); this only holds the open flag.
 */
import React, { useState } from "react";

export default function Hint({ children, className = "qa-opt-d", style, label = "Details" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="qa-hint-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? "Hide" : label}
      </button>
      <div className={`${className} qa-collapsible${open ? " is-open" : ""}`} style={style}>{children}</div>
    </>
  );
}
