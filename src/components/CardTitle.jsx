/**
 * CardTitle - one heading style for every card.
 *   level 1 (default): the card's title, 17px deep blue (h3)
 *   level 2:           a sub-section inside a card, 15px (h4), so a card with two topics still has a clear order
 * `desc` is the explanation under it. A short one (up to 48 characters) is always shown. A longer one is shown on
 * desktop and, on a phone, folds behind a small (i) button so the form is not a wall of grey text.
 */
import React, { useState } from "react";

const SHORT = 48;

export default function CardTitle({ children, F, mb = 4, level = 1, desc }) {
  const Tag = level === 2 ? "h4" : "h3";
  const long = typeof desc === "string" && desc.length > SHORT;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`qa-ct${long && !open ? " is-closed" : ""}`} style={{ marginBottom: desc ? 4 : mb, "--qa-mb": `${mb}px` }}>
        <Tag style={{ margin: 0, fontSize: level === 2 ? 15 : 17, fontWeight: 700, fontFamily: F, lineHeight: 1.3 }}>{children}</Tag>
        {long && (
          <button type="button" className="qa-info" aria-label="About this section" aria-expanded={open} onClick={() => setOpen(o => !o)}>i</button>
        )}
      </div>
      {desc && <p className={`qa-desc${long ? " qa-collapsible" : ""}${open ? " is-open" : ""}`} style={{ marginBottom: mb, fontFamily: F }}>{desc}</p>}
    </>
  );
}
