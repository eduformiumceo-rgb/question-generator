/** CardTitle - a card heading with a small icon tile, so every card has the same recognisable header. */
import React from "react";
import Icon from "./Icon.jsx";

export default function CardTitle({ icon, children, F, mb = 4 }) {
  return (
    <div className="qa-ct" style={{ marginBottom: mb }}>
      {icon && <span className="qa-tile" aria-hidden="true"><Icon name={icon} size={19} /></span>}
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>{children}</h3>
    </div>
  );
}
