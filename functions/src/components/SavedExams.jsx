/**
 * SavedExams - the "My Exams" page. Same look and behaviour as the Lesson
 * Planner's HistoryTab: storage bar (n / 10), search, Open + delete per row,
 * Clear All with confirmation. Opening a row loads the full paper back into
 * the generator so it can be previewed, edited, printed or exported to Word.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ExamHistory, MAX_SAVED_EXAMS } from "../examHistory.js";

const Center = ({ F, icon, title, children, tone }) => (
  <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)", fontFamily: F }}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>{icon}</div>
    <p style={{ margin: "0 0 8px", fontWeight: 600, color: tone === "err" ? "var(--red-text)" : "var(--text)" }}>{title}</p>
    <div style={{ fontSize: 12.5, maxWidth: 360, margin: "0 auto", lineHeight: 1.5 }}>{children}</div>
  </div>
);
const SKELETON_CSS = `@keyframes sx-shimmer{0%{background-position:-300px 0}100%{background-position:300px 0}}
.sx-sk{background:linear-gradient(90deg,var(--border) 0%,var(--input-bg) 40%,var(--border) 80%);background-size:600px 100%;animation:sx-shimmer 1.3s linear infinite;border-radius:8px}
@media (prefers-reduced-motion:reduce){.sx-sk{animation:none}}`;
const SkeletonRows = ({ n = 4 }) => (
  <div aria-busy="true" aria-label="Loading your exams">
    <style>{SKELETON_CSS}</style>
    <div className="sx-sk" style={{ height: 62, borderRadius: 10, marginBottom: 16 }} />
    <div className="sx-sk" style={{ height: 44, borderRadius: 99, marginBottom: 16 }} />
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
        <div className="sx-sk" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="sx-sk" style={{ height: 13, width: `${60 - i * 6}%`, marginBottom: 8 }} />
          <div className="sx-sk" style={{ height: 10, width: "40%" }} />
        </div>
        <div className="sx-sk" style={{ width: 74, height: 38, borderRadius: 99 }} />
      </div>
    ))}
  </div>
);
const svgProps = { width: 44, height: 44, viewBox: "0 0 24 24", fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const IconFile = ({ size = 16, stroke = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
);
const IconEye = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
);

export default function SavedExams({ user, refreshKey = 0, onOpen, onBack, onSignIn, onCount, S, F }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [q, setQ] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [undoId, setUndoId] = useState(null);
  const [showSk, setShowSk] = useState(false); // skeleton only if loading takes >150 ms, so fast loads don't flash
  useEffect(() => {
    if (!loading) { setShowSk(false); return; }
    const t = setTimeout(() => setShowSk(true), 150);
    return () => clearTimeout(t);
  }, [loading]);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const saveRename = async (e) => {
    const title = renameVal.trim();
    setRenamingId(null);
    if (!title || title === e.title) return;
    const before = e.title;
    setExams((list) => list.map((x) => (x.id === e.id ? { ...x, title } : x)));
    try { await ExamHistory.update(e.id, { title }); }
    catch (err) {
      setExams((list) => list.map((x) => (x.id === e.id ? { ...x, title: before } : x)));
      setActionError(err?.message || "Couldn't rename that exam.");
    }
  };
  // Deletes are applied to the screen instantly, and only sent to the server after a
  // 5 s window in which they can be undone. Anything still pending when the page closes
  // is sent straight away so a delete is never silently lost.
  const pending = useRef(new Map()); // id -> { item, index, timer }
  useEffect(() => () => {
    pending.current.forEach((p, id) => { clearTimeout(p.timer); ExamHistory.del(id).catch(() => {}); });
    pending.current.clear();
  }, []);

  useEffect(() => {
    setLoadError(""); setActionError("");
    if (!user) { setLoading(false); setExams([]); return; }
    let cancelled = false;
    setLoading(true);
    ExamHistory.list()
      .then((all) => { const rows = all.filter(r => !pending.current.has(r.id)); if (!cancelled) { setExams(rows); onCount?.(rows.length); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setLoadError(e?.message || "Unknown error loading exams"); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshKey]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return exams.filter((e) => !needle || [e.title, e.subject, e.class, e.exam_type].join(" ").toLowerCase().includes(needle));
  }, [exams, q]);

  const del = (id) => {
    setActionError("");
    const index = exams.findIndex((e) => e.id === id);
    if (index < 0) return;
    const item = exams[index];
    const next = exams.filter((e) => e.id !== id);
    setExams(next); onCount?.(next.length); setUndoId(id);
    const timer = setTimeout(async () => {
      try { await ExamHistory.del(id); pending.current.delete(id); }
      catch (e) { // the server refused: put it back rather than pretend it's gone
        pending.current.delete(id);
        setExams((list) => { const copy = [...list]; copy.splice(Math.min(index, copy.length), 0, item); onCount?.(copy.length); return copy; });
        setActionError(e?.message || "Couldn't delete that exam.");
      }
      setUndoId((cur) => (cur === id ? null : cur));
    }, 5000);
    pending.current.set(id, { item, index, timer });
  };
  const undo = (id) => {
    const p = pending.current.get(id);
    if (!p) return;
    clearTimeout(p.timer); pending.current.delete(id);
    setExams((list) => { const copy = [...list]; copy.splice(Math.min(p.index, copy.length), 0, p.item); onCount?.(copy.length); return copy; });
    setUndoId(null);
  };
  const clearAll = async () => {
    setActionError("");
    try { await ExamHistory.clear(); pending.current.forEach(p => clearTimeout(p.timer)); pending.current.clear(); setUndoId(null); setExams([]); onCount?.(0); }
    catch (e) { setActionError(e?.message || "Couldn't clear your exams."); }
    finally { setConfirmClear(false); }
  };
  const open = async (id) => {
    setOpeningId(id); setActionError("");
    try { await onOpen(id); }
    catch (e) { setActionError(e?.message || "Couldn't open that exam."); }
    finally { setOpeningId(null); }
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)", fontFamily: F }}>My Exams</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", fontFamily: F }}>Your saved papers, available on any device.</p>
      </div>
      <button type="button" style={{ ...S.sm }} onClick={onBack}>Back to generator</button>
    </div>
  );

  if (!user) return (
    <div>{header}
      <Center F={F} title="Sign in to see your exams" icon={<svg {...svgProps} stroke="var(--border-strong)"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}>
        <p style={{ margin: "0 0 14px" }}>Generated exams are saved to your account automatically.</p>
        <button type="button" onClick={onSignIn} style={{ ...S.btn, margin: "0 auto", height: 42 }}>Sign In</button>
      </Center>
    </div>
  );

  if (loading) return (
    <div>{header}{showSk && <SkeletonRows />}</div>
  );

  if (loadError) return (
    <div>{header}
      <Center F={F} tone="err" title="Couldn't load your exams" icon={<svg {...svgProps} stroke="var(--red-text)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16.01" /></svg>}>
        <p style={{ margin: "0 0 12px", fontFamily: "monospace", wordBreak: "break-word" }}>{loadError}</p>
        <button type="button" style={{ ...S.sm, margin: "0 auto" }} onClick={() => { setLoading(true); setLoadError(""); ExamHistory.list().then((r) => { setExams(r); onCount?.(r.length); }).catch((e) => setLoadError(e?.message || "Error")).finally(() => setLoading(false)); }}>Try again</button>
      </Center>
    </div>
  );

  const undoBar = undoId && (
    <div role="status" style={{
      position: "fixed", left: 12, right: 12, bottom: "max(16px, env(safe-area-inset-bottom, 16px))", margin: "0 auto", maxWidth: 420, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px 10px 16px", borderRadius: 12,
      background: "var(--card-bg)", border: "1px solid var(--border-strong)", boxShadow: "none", fontFamily: F, fontSize: 13, color: "var(--text)",
    }}>
      <span>Exam deleted</span>
      <button type="button" onClick={() => undo(undoId)} style={{ ...S.sm, height: 34, fontWeight: 700, color: "var(--accent)", borderColor: "var(--accent)" }}>Undo</button>
    </div>
  );

  if (!exams.length) return (
    <div>{header}{undoBar}
      <Center F={F} title="No saved exams yet" icon={<svg {...svgProps} stroke="var(--border-strong)"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>}>
        Generate an exam and it will be saved here automatically. You can keep up to {MAX_SAVED_EXAMS}.
      </Center>
    </div>
  );

  const used = exams.length, total = MAX_SAVED_EXAMS;
  const pct = Math.min((used / total) * 100, 100);
  const isFull = used >= total, isNearFull = used >= total - 1;
  const barColor = isFull ? "var(--red-text)" : isNearFull ? "var(--orange-text)" : "var(--accent)";

  return (
    <div>
      {header}
      {undoBar}
      <div style={{ marginBottom: 16, padding: "11px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: F }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Exam Storage</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isFull ? "var(--red-text)" : isNearFull ? "var(--orange-text)" : "var(--text-secondary)" }}>{used} / {total}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: barColor, transition: "width .4s ease" }} />
        </div>
        {isNearFull && (
          <div style={{ marginTop: 7, fontSize: 11.5, color: barColor, lineHeight: 1.5 }}>
            {isFull ? "Storage full: saving a new exam will remove your oldest one." : "1 slot remaining: next save will remove your oldest exam."}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...S.inp, flex: "1 1 200px", borderRadius: 99 }} placeholder="Search exams..." value={q} onChange={(e) => setQ(e.target.value)} />
        {confirmClear ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>Delete all exams?</span>
            <button type="button" style={{ ...S.danger, padding: "6px 12px", fontSize: 12, height: "auto" }} onClick={clearAll}>Yes, delete</button>
            <button type="button" style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8, border: "1.5px solid var(--border-strong)", background: "var(--input-bg)", color: "var(--text)", cursor: "pointer", fontFamily: F }} onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" style={S.danger} onClick={() => setConfirmClear(true)}>Clear All</button>
        )}
      </div>

      {actionError && <div style={S.err}>{actionError}</div>}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: F, marginBottom: 12, fontWeight: 500 }}>
        {filtered.length} exam{filtered.length !== 1 ? "s" : ""}
      </div>

      {filtered.map((e) => {
        const subtitle = [e.exam_type, e.class, new Date(e.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · ");
        return (
          <div key={e.id} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-soft)", border: "1.5px solid var(--tag-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--accent)" }}>
                <IconFile />
              </div>
              <div style={{ minWidth: 0 }}>
                {renamingId === e.id ? (
                  <input autoFocus value={renameVal} maxLength={200} aria-label="Exam name"
                    onChange={(ev) => setRenameVal(ev.target.value)}
                    onBlur={() => saveRename(e)}
                    onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); if (ev.key === "Escape") { setRenamingId(null); } }}
                    style={{ ...S.inp, minHeight: 34, padding: "4px 10px", fontSize: 13, fontWeight: 700 }} />
                ) : (
                  <div style={{ color: "var(--text)", fontFamily: F, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {e.title || `${e.subject} ${e.class}`.trim() || "Untitled Exam"}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: F, marginTop: 3, wordBreak: "break-word" }}>{[e.subject, subtitle].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <button type="button" disabled={openingId === e.id} onClick={() => open(e.id)} style={{ ...S.sm, minHeight: 38, fontWeight: 600, opacity: openingId === e.id ? 0.6 : 1 }}>
                {openingId === e.id ? "Opening…" : "Open"}
              </button>
              <button type="button" aria-label="Rename exam" style={{ ...S.sm, minHeight: 38 }}
                onClick={() => { setRenamingId(e.id); setRenameVal(e.title || ""); }}>
                Rename
              </button>
              <button type="button" aria-label="Delete exam" style={{ ...S.danger, minHeight: 38 }} onClick={() => del(e.id)}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
