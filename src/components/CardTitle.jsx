/**
 * CardTitle - one heading style for every card.
 *   level 1 (default): the card's title, 18px deep blue (h3)
 *   level 2:           a sub-section inside a card, 15px (h4), so a card with two topics still has a clear order
 * `desc` is the one-line explanation under it. No icons.
 */
import React from "react";

export default function CardTitle({ children, F, mb = 4, level = 1, desc }) {
  const Tag = level === 2 ? "h4" : "h3";
  return (
    <>
      <div className="qa-ct" style={{ marginBottom: desc ? 4 : mb }}>
        <Tag style={{ margin: 0, fontSize: level === 2 ? 15 : 18, fontWeight: 700, fontFamily: F, lineHeight: 1.3 }}>{children}</Tag>
      </div>
      {desc && <p className="qa-desc" style={{ marginBottom: mb, fontFamily: F }}>{desc}</p>}
    </>
  );
}
