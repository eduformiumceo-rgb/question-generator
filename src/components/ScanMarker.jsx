/**
 * ScanMarker - "Scan & mark": read filled WASSCE-type answer sheets from scans / photos / PDFs and mark them.
 * Everything happens in the browser; no picture leaves the device.
 *
 * Props:
 *   S, F          shared styles / font
 *   keyFor(ver)   returns { questionNumber: "A".. } for the paper version ("A" | "B" | "C" | "D") or null when no paper is generated
 *   expectedN     number of questions on the sheet (used when a sheet's QR code can't be read)
 *   optionCount, digits   sheet settings (same fallback)
 *   The teacher can set the marks for each question (default 1; half marks allowed) and correct any index number the reader got wrong;
 *   duplicates, the score table and the CSV all use the corrected number.
 *   load, reader  injectable for tests (default: scanFiles.loadScanFile, omrReader.readWassceSheet)
 */
import React, { useRef, useState } from "react";
import { readWassceSheet, scoreSheet, resultsCsv } from "../omrReader.js";
import { loadScanFile, SCAN_ACCEPT } from "../scanFiles.js";

const parseTyped = (text) => String(text || "").toUpperCase().replace(/[^A-E]/g, "");

export default function ScanMarker({ S, F, keyFor, expectedN, optionCount = 4, digits = 10, load = loadScanFile, reader = readWassceSheet }) {
  const inputRef = useRef(null);
  const [typedKey, setTypedKey] = useState("");
  const [rows, setRows] = useState([]);       // { id, file, read, score, key } | { id, file, error }
  const [marksText, setMarksText] = useState("1");      // marks for each question, as typed
  const [edits, setEdits] = useState({});          // { rowId: corrected index number }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const seq = useRef(0);

  const haveKey = !!(keyFor && keyFor("A") && Object.keys(keyFor("A")).length);
  const typed = parseTyped(typedKey);
  const keyFrom = (version) => {
    if (typed) return typed;
    return haveKey ? (keyFor(version) || keyFor("A")) : null;
  };

  const run = async (files) => {
    const list = Array.from(files || []); if (!list.length) return;
    setBusy(true); setNote("");
    const out = [];
    for (const f of list) {
      let pages = [];
      try { pages = await load(f); } catch (e) { out.push({ id: ++seq.current, file: f.name, error: e.message || "Could not open this file." }); continue; }
      for (const pg of pages) {
        await new Promise(r => setTimeout(r, 0));          // let the page breathe between sheets
        try {
          const read = reader(pg.image, { n: expectedN, optionCount, digits });
          if (!read.ok) { out.push({ id: ++seq.current, file: pg.name, error: read.error }); continue; }
          out.push({ id: ++seq.current, file: pg.name, read, image: null });
        } catch (e) { out.push({ id: ++seq.current, file: pg.name, error: "Could not read this sheet." }); }
      }
    }
    setRows(prev => [...prev, ...out]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const marksEach = (() => { const v = Number(String(marksText).replace(",", ".")); return Number.isFinite(v) && v > 0 && v <= 100 ? v : 1; })();
  const marksBad = String(marksText).trim() !== "" && !(Number(String(marksText).replace(",", ".")) > 0 && Number(String(marksText).replace(",", ".")) <= 100);
  const wantDigits = (r) => (r.read && r.read.indexNumber && r.read.indexNumber.length) || digits;
  const scored = rows.map(r => {
    if (r.error) return r;
    const key = keyFrom(r.read.version);
    // the teacher's correction, if any, replaces what the reader saw; everything below (duplicates, CSV) uses it
    const hasEdit = Object.prototype.hasOwnProperty.call(edits, r.id);          // an emptied box stays empty (so it can be retyped)
    const edited = hasEdit && edits[r.id] !== r.read.indexNumber;               // "corrected" only when it really differs from the scan
    const indexNumber = hasEdit ? edits[r.id] : r.read.indexNumber;
    const read = { ...r.read, indexNumber, indexOk: edited ? (/^\d+$/.test(indexNumber) && indexNumber.length === r.read.indexNumber.length) : r.read.indexOk };   // a correction must be all digits and as long as the sheet's number
    return { ...r, read, edited, key, score: key ? scoreSheet(read, key, marksEach) : null };
  });
  const noKey = scored.some(r => !r.error && !r.score);
  const okRows = scored.filter(r => !r.error && r.score);
  const maxN = Math.max(0, ...okRows.map(r => r.read.n));

  const download = () => {
    const csv = resultsCsv(okRows, maxN);
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "objective-results.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const dup = (r) => r.read && r.read.indexOk && scored.filter(x => x.read && x.read.indexNumber === r.read.indexNumber && !x.read.absent).length > 1;
  const editIndex = (id, v) => setEdits(prev => ({ ...prev, [id]: String(v).replace(/\D/g, "").slice(0, 20) }));

  const th = { textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", fontSize: 15, borderBottom: "1px solid var(--border)", verticalAlign: "top" };

  return (
    <div style={S.card} data-testid="scan-card">
      <div style={{ fontFamily: F, fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Scan &amp; mark</div>
      <div className="qa-note" style={{ fontFamily: F, lineHeight: 1.6, marginBottom: 14 }}>
        Scan or photograph the filled WASSCE-type answer sheets (flat, all four corners in the picture) and add them here. The index number, paper version and every answer are read from the sheet and marked against your answer key. Nothing leaves your device.
      </div>

      <div className="qa-group">
        <label style={S.lbl}>Answer key</label>
        {haveKey && !typed ? (
          <div className="qa-note" style={{ fontFamily: F, lineHeight: 1.6 }} data-testid="scan-key-auto">Using the answer key of the paper you generated (Version B, C and D sheets are marked with their own shuffled key).</div>
        ) : (
          <div className="qa-note" style={{ fontFamily: F, marginBottom: 8 }}>{haveKey ? "Using the key typed below instead of the generated paper's." : "No generated paper here yet, so type the answers in order (for example ABCDDCBA…)."}</div>
        )}
        <input type="text" value={typedKey} onChange={e => setTypedKey(e.target.value)} placeholder="Optional: type the answers in order, e.g. ABCDDCBA" aria-label="Answer key typed in order" style={{ ...S.inp, fontFamily: "monospace" }} />
        {typed && <div className="qa-note" style={{ fontFamily: F, marginTop: 6 }}>{typed.length} answers typed.</div>}
      </div>

      <div className="qa-group">
        <label style={S.lbl} htmlFor="scan-marks">Marks for each question</label>
        <input id="scan-marks" type="text" inputMode="decimal" value={marksText} onChange={e => setMarksText(e.target.value)} aria-label="Marks for each question" aria-invalid={marksBad} style={{ ...S.inp, width: 110, ...(marksBad ? { borderColor: "var(--danger, #b3261e)" } : null) }} />
        <div className="qa-note" style={{ fontFamily: F, marginTop: 6 }}>{marksBad ? "Enter a number above 0, such as 1 or 0.5. Using 1 for now." : `Each right answer scores ${marksEach}; a sheet of ${expectedN} questions is out of ${Math.round(expectedN * marksEach * 100) / 100}.`}</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 6 }}>
        <input ref={inputRef} type="file" accept={SCAN_ACCEPT} multiple onChange={e => run(e.target.files)} style={{ display: "none" }} data-testid="scan-input" aria-label="Add scanned answer sheets" />
        <button type="button" style={{ ...S.btn, height: 44, padding: "0 20px" }} disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>{busy ? "Reading…" : "Add scanned sheets"}</button>
        {rows.length > 0 && <button type="button" style={S.sm} onClick={() => { setRows([]); setEdits({}); }}>Clear all</button>}
        {okRows.length > 0 && <button type="button" style={S.sm} onClick={download}>Download results (CSV)</button>}
      </div>
      <div className="qa-note" style={{ fontFamily: F, marginTop: 8 }}>Pictures and PDFs (one sheet per page) work. Print at 100% so the sheet matches its marks.</div>

      {note && <div className="qa-note" role="status" style={{ fontFamily: F, marginTop: 8 }}>{note}</div>}
      {noKey && <div role="alert" style={{ fontFamily: F, marginTop: 12, color: "var(--danger, #b3261e)", fontWeight: 600 }}>No answer key yet: generate the paper, or type the answers above, to see scores.</div>}

      {scored.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F }} data-testid="scan-results">
            <thead><tr><th style={th}>Sheet</th><th style={th}>Index number</th><th style={th}>Version</th><th style={th}>Score</th><th style={th}>Check</th></tr></thead>
            <tbody>
              {scored.map(r => r.error ? (
                <tr key={r.id}><td style={td}>{r.file}</td><td style={{ ...td, color: "var(--danger, #b3261e)" }} colSpan={4}>{r.error}</td></tr>
              ) : (
                <tr key={r.id}>
                  <td style={td}>{r.file}{r.read.absent ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Marked absent</div> : null}</td>
                  <td style={td}>
                    <input type="text" inputMode="numeric" value={r.read.indexNumber} onChange={e => editIndex(r.id, e.target.value)} aria-label={`Index number for ${r.file}`} aria-invalid={!r.read.indexOk}
                      title="Click to correct this index number" style={{ ...S.inp, width: `${Math.max(12, wantDigits(r) + 6)}ch`, minWidth: `${wantDigits(r) + 6}ch`, boxSizing: "border-box", minHeight: 36, padding: "4px 10px", fontFamily: "monospace", letterSpacing: ".08em", ...(r.read.indexOk ? null : { borderColor: "var(--danger, #b3261e)" }) }} />
                    {r.edited ? <div style={{ fontFamily: F, fontSize: 12, color: "var(--text-muted)" }}>Corrected <button type="button" style={{ ...S.sm, minHeight: 0, padding: "0 6px", fontSize: 12 }} onClick={() => setEdits(prev => { const n = { ...prev }; delete n[r.id]; return n; })}>undo</button></div> : null}
                    {dup(r) ? <div style={{ fontFamily: F, fontSize: 12, color: "var(--danger, #b3261e)" }}>Duplicate index number</div> : null}
                  </td>
                  <td style={td}>{r.read.version || "-"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.score ? `${r.score.score} / ${r.score.total}` : "-"}{r.score ? <div style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)" }}>{r.score.wrong} wrong · {r.score.blank} blank{r.score.multiple ? ` · ${r.score.multiple} double` : ""}</div> : null}</td>
                  <td style={td}>{r.read.review.length || !r.read.indexOk || !r.read.qr ? (
                    <span style={{ fontSize: 13 }}>
                      {!r.read.indexOk ? "Index number needs correcting. " : ""}{!r.read.qr ? "Sheet ID not read. " : ""}{r.read.review.length ? `Look at question${r.read.review.length > 1 ? "s" : ""} ${r.read.review.slice(0, 12).join(", ")}${r.read.review.length > 12 ? "…" : ""}.` : ""}
                    </span>
                  ) : <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Clean</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
