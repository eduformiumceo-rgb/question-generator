/**
 * NumberField
 * A whole-number input that can be cleared and retyped freely.
 *
 * WHY THIS EXISTS: the old inputs parsed the text on every keystroke and forced
 * a value straight back ("if (isNaN(v)) v = 1"). Deleting the last digit
 * therefore snapped a "1" into the box, so the number could never be cleared
 * or replaced by typing a new one. That is the bug this component removes.
 *
 * HOW IT BEHAVES:
 *   - While the teacher types, the text they typed is kept as-is (a "draft"),
 *     including an empty box. Nothing is forced back under their cursor.
 *   - A valid number inside [min, max] is passed to the parent immediately, so
 *     totals (marks, question counts) update live.
 *   - A number above max is clamped to max straight away (typing 99 -> 60).
 *   - A number below min (e.g. the "1" on the way to typing "10" when min is 4)
 *     is NOT pushed to the parent until the field loses focus.
 *   - On blur the draft is settled: out-of-range numbers are clamped, and an
 *     empty / invalid box reverts to the value it had when the teacher clicked
 *     into it (not to an arbitrary 1, and not to a half-deleted "2" from
 *     backspacing "25").
 *   - Digits only (no "e", "-", "." or scroll-wheel changes), numeric keypad on
 *     phones, text auto-selected on focus so a new number simply overwrites,
 *     and ArrowUp / ArrowDown still step the value.
 */
import React, { useRef, useState } from "react";

export const clampInt = (n, min, max) => Math.max(min, Math.min(max, n));

export default function NumberField({
  value, onChange, min = 1, max = 999999, style, onBlur, onFocus, onKeyDown, ...rest
}) {
  const [draft, setDraft] = useState(null); // string while editing, null otherwise
  const valueOnFocus = useRef(value);          // what to restore if the box is left empty

  const shown = draft !== null ? draft : (value === null || value === undefined || value === "" ? "" : String(value));

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, String(max).length + 1);
    if (raw === "") { setDraft(""); return; } // cleared: keep it empty, don't touch the parent
    const n = parseInt(raw, 10);
    if (n > max) { setDraft(String(max)); onChange(max); return; }
    setDraft(raw);
    if (n >= min) onChange(n);
  };

  const handleBlur = (e) => {
    if (draft !== null) {
      const n = parseInt(draft, 10);
      if (draft !== "" && !Number.isNaN(n)) {
        const settled = clampInt(n, min, max);
        if (settled !== value) onChange(settled);
      }
      else if (valueOnFocus.current !== value) onChange(valueOnFocus.current); // empty: undo the live edits
      setDraft(null);
    }
    onBlur?.(e);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = parseInt(draft !== null && draft !== "" ? draft : value, 10);
      const current = Number.isNaN(base) ? (e.key === "ArrowUp" ? min - 1 : min + 1) : base;
      const next = clampInt(current + (e.key === "ArrowUp" ? 1 : -1), min, max);
      setDraft(null);
      onChange(next);
    } else if (e.key === "Enter") {
      e.currentTarget.blur();
    }
    onKeyDown?.(e);
  };

  return (
    <input
      {...rest}
      type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
      value={shown}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={(e) => { valueOnFocus.current = value; e.target.select(); onFocus?.(e); }}
      onKeyDown={handleKeyDown}
      style={style}
    />
  );
}
