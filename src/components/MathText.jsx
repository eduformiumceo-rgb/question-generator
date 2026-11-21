/** Shows text that may contain $maths$ (live preview, lists). Plain text stays plain React text. */
import React, { useMemo } from "react";
import { hasMath, textWithMathToHtml } from "../mathText.js";

export default function MathText({ text, ...rest }) {
  const s = String(text ?? "");
  const html = useMemo(() => (hasMath(s) ? textWithMathToHtml(s) : null), [s]);
  return html === null ? <span {...rest}>{s}</span> : <span {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
}
