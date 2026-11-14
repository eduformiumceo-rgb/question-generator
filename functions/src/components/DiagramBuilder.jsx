/**
 * DiagramBuilder - draw an exact diagram from a form, with a live preview.
 * Pick a template (triangle, bar chart, number line, circuit...), fill in the
 * numbers and labels, and the figure is drawn to scale. The same templates the
 * AI uses, so a teacher can correct or replace any AI diagram in seconds.
 */
import React, { useMemo, useState } from "react";
import { DIAGRAM_TEMPLATES, templateById, renderDiagramTemplate } from "../diagramRegistry.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
const REGION_LABELS = { A: "Only the 1st set", B: "Only the 2nd set", C: "Only the 3rd set", AB: "1st and 2nd", AC: "1st and 3rd", BC: "2nd and 3rd", ABC: "All three", outside: "Outside all sets" };

/** Text boxes need their own text state: "3, " must stay "3, " while the teacher is still typing. */
const toText = (f, v) => {
  if (f.type === "list" || f.type === "numlist") return Array.isArray(v) ? v.map(x => (typeof x === "object" && x ? `${x.type}${x.label ? ":" + x.label : ""}` : x)).join(", ") : "";
  if (f.type === "branches") return (Array.isArray(v) ? v : []).map(b => (Array.isArray(b) ? b.map(x => (x && x.type ? (x.label ? `${x.type}:${x.label}` : x.type) : x)).join(", ") : String(b))).join("\n");
  if (f.type === "lines") return f.format ? f.format(v) : "";
  return "";
};
const fromText = (f, text) => {
  if (f.type === "list") return text.split(",").map(s => s.trim());
  if (f.type === "numlist") return text.split(",").map(s => s.trim()).filter(s => s !== "").map(Number);
  if (f.type === "branches") return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (f.type === "lines") return f.parse(text);
  return text;
};
const TEXTY = ["list", "numlist", "lines", "branches"];

export default function DiagramBuilder({ initial, onUse, onCancel, S, F }) {
  const start = initial?.template && templateById(initial.template) ? initial.template : DIAGRAM_TEMPLATES[0].id;
  const [id, setId] = useState(start);
  const [params, setParams] = useState(() => (initial?.template === start && initial.params ? clone(initial.params) : clone(templateById(start).defaults)));
  const [texts, setTexts] = useState(() => {
    const t = templateById(start), p = initial?.template === start && initial.params ? initial.params : t.defaults, o = {};
    t.fields.filter(f => TEXTY.includes(f.type)).forEach(f => { o[f.key] = toText(f, p[f.key]); });
    return o;
  });
  const tpl = templateById(id);
  const result = useMemo(() => renderDiagramTemplate(id, params), [id, params]);

  const load = (nextId, p) => {
    const t = templateById(nextId), o = {};
    t.fields.filter(f => TEXTY.includes(f.type)).forEach(f => { o[f.key] = toText(f, p[f.key]); });
    setId(nextId); setParams(clone(p)); setTexts(o);
  };
  const set = (key, value) => setParams(p => ({ ...p, [key]: value }));
  const lbl = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", fontFamily: F, display: "block", marginBottom: 4 };
  const inp = { ...S.inp, height: 38, minHeight: 38, fontSize: 13, padding: "0 12px" };

  const field = (f) => {
    const v = params[f.key];
    let control;
    if (f.type === "text") control = <input style={inp} value={v ?? ""} onChange={e => set(f.key, e.target.value)} />;
    else if (f.type === "number") control = <input style={inp} type="number" value={v ?? ""} onChange={e => set(f.key, e.target.value === "" ? null : Number(e.target.value))} />;
    else if (f.type === "bool") return (
      <label key={f.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontFamily: F, color: "var(--text)", marginBottom: 10 }}>
        <input type="checkbox" checked={!!v} onChange={e => set(f.key, e.target.checked)} /> {f.label}
      </label>);
    else if (f.type === "select") control = <select style={inp} value={v ?? ""} onChange={e => set(f.key, e.target.value)}>{f.options.map(o => <option key={o} value={o}>{o || "None"}</option>)}</select>;
    else if (f.type === "regions") {
      const n = (params.setNames || []).filter(Boolean).length >= 3 ? 3 : 2;
      const keys = n === 3 ? ["A", "B", "C", "AB", "AC", "BC", "ABC", "outside"] : ["A", "B", "AB", "outside"];
      control = (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
          {keys.map(k => (
            <div key={k}><span style={{ ...lbl, fontWeight: 500 }}>{REGION_LABELS[k]}</span>
              <input style={inp} value={(params.regions || {})[k] ?? ""} onChange={e => set("regions", { ...(params.regions || {}), [k]: e.target.value })} /></div>
          ))}
        </div>);
    } else if (f.type === "lines" || f.type === "branches") {
      control = <textarea style={{ ...S.inp, height: "auto", minHeight: 72, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }} rows={3} value={texts[f.key] ?? ""}
        onChange={e => { setTexts(t => ({ ...t, [f.key]: e.target.value })); set(f.key, fromText(f, e.target.value)); }} />;
    } else control = <input style={inp} value={texts[f.key] ?? ""} onChange={e => { setTexts(t => ({ ...t, [f.key]: e.target.value })); set(f.key, fromText(f, e.target.value)); }} />;
    return (
      <div key={f.key} style={{ marginBottom: 10 }}>
        <label style={lbl}>{f.label}</label>
        {control}
        {f.help && <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginTop: 3, lineHeight: 1.4 }}>{f.help}</div>}
      </div>
    );
  };

  return (
    <div style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: 14, marginTop: 10, background: "var(--bg-subtle, transparent)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lbl}>Diagram type</label>
          <select style={inp} value={id} onChange={e => load(e.target.value, templateById(e.target.value).defaults)}>
            {DIAGRAM_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <button type="button" style={{ ...S.sm, height: 38 }} onClick={() => load(id, tpl.example)}>Load an example</button>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>{tpl.fields.map(field)}</div>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", fontFamily: F, marginBottom: 6 }}>Preview (this is how it prints)</div>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 8, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 13, fontFamily: F, overflow: "auto" }}
            {...(result ? { dangerouslySetInnerHTML: { __html: result.svg } } : { children: "Fill in the details on the left to see the diagram." })} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" style={{ ...S.sm, height: 38 }} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!result} style={{ ...S.sm, height: 38, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 700, opacity: result ? 1 : 0.5 }}
          onClick={() => onUse({ template: id, params: result.params, svg: result.svg })}>Use this diagram</button>
      </div>
    </div>
  );
}
