/**
 * Icon - tiny inline SVG icons (stroke style, inherit text colour).
 * Inline SVG instead of an icon library: zero extra downloads, zero runtime cost.
 */
import React from "react";

const PATHS = {
  cap: ["M2 9l10-5 10 5-10 5z", "M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"],
  book: ["M4 19.5V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2z", "M4 19.5A2 2 0 0 0 6 21.5h13"],
  file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6", "M9 17h4"],
  layout: ["M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z", "M4 9h16", "M10 9v11"],
  clipboard: ["M9 4h6v3H9z", "M8 5.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-2", "M9 12h6", "M9 16h4"],
  sliders: ["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9", "M13 5v4h4V5z", "M7 15v4h4v-4z"],
  list: ["M4 6h16", "M4 12h16", "M4 18h10"],
  checklist: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6.5l1.2 1.2L7.5 5.5", "M4 12.5l1.2 1.2 2.3-2.2", "M4 18.5l1.2 1.2 2.3-2.2"],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  shield: ["M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z", "M8.5 12l2.5 2.5 4.5-5"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  spark: ["M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z", "M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"],
  download: ["M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 20h14"],
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, size = 20, stroke = 1.8, style }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }}>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
