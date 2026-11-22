/**
 * Welcome - shown under the first card until a class is chosen, so the page is never a bare form on an empty screen.
 * Static content only. Deliberately NOT built from cards (the form cards above are cards; this is an open explainer),
 * and has no icons. Every claim here is a real feature.
 */
import React from "react";

const STEPS = [
  { title: "Pick class and topics", text: "Choose from the NaCCA curriculum, or upload your own scheme of learning." },
  { title: "Set up your paper", text: "Exam type, sections, difficulty and marks. Sensible defaults are ready." },
  { title: "Generate and download", text: "Edit any question, then print it or save it as a Word file with the marking scheme." },
];
const FEATURES = ["BECE and WASSCE styles", "Diagrams and figures", "Marking scheme included", "Maths equations", "Word and PDF"];

export default function Welcome({ F }) {
  return (
    <section aria-label="How it works" style={{ fontFamily: F }}>
      <div className="qa-how">
        {STEPS.map((s, i) => (
          <div key={s.title} className={`qa-how-item qa-rise qa-d${i + 1}`}>
            <div className="qa-how-eyebrow">Step {i + 1}</div>
            <h4>{s.title}</h4>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
      <ul className="qa-feats qa-rise qa-d3" aria-label="Included features">
        {FEATURES.map(f => <li key={f} className="qa-feat">{f}</li>)}
      </ul>
    </section>
  );
}
