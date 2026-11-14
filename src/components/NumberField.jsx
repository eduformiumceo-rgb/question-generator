/**
 * NumberField
 * A number input that lets the user clear it and type freely.
 *
 * While typing, the box holds exactly what the user typed (including empty).
 * The parent only receives a value once it is a valid whole number >= min
 * (values above max are capped as they type). On blur, an empty or invalid
 * box snaps back to the last valid value, and the number is clamped to min/max.
 */
import React, { useEffect, useRef, useState } from "react";

export default function NumberField({ value, onCommit, min = 1, max = Infinity, style, ...rest }) {
  const [text, setText] = useState(String(value ?? ""));
  const focused = useRef(false);

  // Keep in sync with outside changes (e.g. reset), but never while typing.
  useEffect(() => {
    if (!focused.current) setText(String(value ?? ""));
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw === "") { setText(""); return; }
    if (!/^\d+$/.test(raw)) return; // ignore anything that isn't a whole number
    let n = parseInt(raw, 10);
    if (n > max) n = max;
    setText(String(n));
    if (n >= min) onCommit(n);
  };

  const handleBlur = () => {
    focused.current = false;
    const n = parseInt(text, 10);
    if (isNaN(n)) { setText(String(value ?? min)); return; }
    const clamped = Math.max(min, Math.min(max, n));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={Number.isFinite(max) ? max : undefined}
      value={text}
      onFocus={(e) => { focused.current = true; rest.onFocus?.(e); }}
      onChange={handleChange}
      onBlur={handleBlur}
      style={style}
    />
  );
}
