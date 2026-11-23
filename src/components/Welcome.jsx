/**
 * Welcome - what is included, shown under the first card until a class is chosen.
 * A tidy 2 x 2 grid (one line of title, one line of detail each) instead of a wrapping strip of loose phrases.
 * (The numbered steps live only in the hero, so they are not repeated here.)
 */
import React from "react";

const FEATURES = [
  { t: "BECE & WASSCE styles", d: "Real exam layouts" },
  { t: "Marking schemes", d: "Answers and marks" },
  { t: "Diagrams & equations", d: "Figures and maths" },
  { t: "Word & PDF", d: "Print or keep editing" },
];

export default function Welcome({ F }) {
  return (
    <section aria-label="What is included" style={{ fontFamily: F }}>
      <ul className="qa-feats qa-rise qa-d3" aria-label="Included features">
        {FEATURES.map(f => (
          <li key={f.t} className="qa-feat">
            <strong>{f.t}</strong>
            <span>{f.d}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
