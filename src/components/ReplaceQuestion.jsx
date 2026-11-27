/**
 * ReplaceQuestion - "write me a different question" for one question.
 * Optional note ("make it harder"), a spinner while the server works, a clear
 * error, and one-step Undo so a teacher can never lose a question they liked.
 */
import React, { useState, useId } from "react";

export default function ReplaceQuestion({ question, onReplace, onApply, S, F }) {
  const inputId = useId();   // unique even when two sections both have a "question 1"
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previous, setPrevious] = useState(null);

  const run = async () => {
    setBusy(true); setError("");
    const old = question;
    try {
      const nq = await onReplace(note.trim());
      setPrevious(old);
      onApply(nq);
      setOpen(false); setNote("");
    } catch (e) {
      if (e?.name !== "AbortError") setError(e?.message || "Couldn't write a replacement question.");
    } finally { setBusy(false); }
  };

  const small = { ...S.sm, height: 32, fontSize: 12, padding: "0 14px" };
  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={small} onClick={() => { setOpen(true); setError(""); }}>Replace question</button>
          {previous && <button type="button" style={small} onClick={() => { onApply(previous); setPrevious(null); }}>Undo replace</button>}
        </div>
      ) : (
        <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 12, padding: 12 }}>
          <label style={{ ...S.lbl, marginBottom: 5 }} htmlFor={inputId}>What should the new question be like? (optional)</label>
          <input
            id={inputId} value={note} maxLength={200} onChange={e => setNote(e.target.value)} disabled={busy}
            placeholder="e.g. make it harder, use a Ghanaian example, test a different point"
            style={{ ...S.inp, height: 38, fontSize: 13, width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={{ ...S.btn, height: 36, fontSize: 13, padding: "0 18px", opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={run}>
              {busy ? "Writing..." : "Write new question"}
            </button>
            <button type="button" style={small} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>Costs 0.1 credit (free in Free mode). You can undo.</span>
          </div>
          {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: "var(--err-text, #B91C1C)", fontFamily: F }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
