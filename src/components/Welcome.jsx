/**
 * Welcome - what is included, shown under the first card until a class is chosen.
 * A tidy 2 x 2 grid (one line of title, one line of detail each) instead of a wrapping strip of loose phrases.
 * (The numbered steps live only in the hero, so they are not repeated here.)
 */
import React from "react";

const FEATURES = [
  { t: "BECE and WASSCE styles", d: "Real exam layouts, set up for you" },
  { t: "Marking scheme included", d: "Answers and mark allocation" },
  { t: "Diagrams and equations", d: "Figures drawn, maths typeset" },
  { t: "Word and PDF", d: "Print it or keep editing" },
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
