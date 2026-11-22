/**
 * Welcome - a quiet line of what is included, shown under the first card until a class is chosen.
 * (The numbered steps now live only in the hero, so they are not repeated here.)
 */
import React from "react";

const FEATURES = ["BECE and WASSCE styles", "Diagrams and figures", "Marking scheme included", "Maths equations", "Word and PDF"];

export default function Welcome({ F }) {
  return (
    <section aria-label="What is included" style={{ fontFamily: F }}>
      <ul className="qa-feats qa-rise qa-d3" aria-label="Included features">
        {FEATURES.map(f => <li key={f} className="qa-feat">{f}</li>)}
      </ul>
    </section>
  );
}
