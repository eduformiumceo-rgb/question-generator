/**
 * Welcome - shown under the first card until a class is chosen, so the page is never a bare form on an empty screen.
 * Static content only: three "how it works" tiles and a row of what the app does. Every claim here is a real feature.
 */
import React from "react";
import Icon from "./Icon.jsx";

const STEPS = [
  { icon: "book", title: "Pick class and topics", text: "Choose from the NaCCA curriculum, or upload your own scheme of learning." },
  { icon: "sliders", title: "Set up your paper", text: "Exam type, sections, difficulty and marks. Sensible defaults are ready." },
  { icon: "spark", title: "Generate and download", text: "Edit any question, then print it or save it as a Word file with the marking scheme." },
];
const FEATURES = ["BECE and WASSCE styles", "Marking scheme included", "Maths equations", "Word and PDF"];

export default function Welcome({ F }) {
  return (
    <section aria-label="How it works" style={{ fontFamily: F }}>
      <div className="qa-how">
        {STEPS.map((s, i) => (
          <div key={s.title} className={`qa-how-item qa-rise qa-d${i + 1}`}>
            <span className="qa-tile" aria-hidden="true"><Icon name={s.icon} size={19} /></span>
            <h4>{s.title}</h4>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
      <div className="qa-pills qa-rise qa-d3">
        {FEATURES.map(f => <span key={f} className="qa-pill"><Icon name="check" size={13} stroke={2.4} />{f}</span>)}
      </div>
    </section>
  );
}
