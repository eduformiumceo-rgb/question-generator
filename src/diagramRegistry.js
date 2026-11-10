/**
 * diagramRegistry.js - the single list of drawable diagram templates, plus
 * the safe entry points the rest of the app uses.
 */
import { _templatesPart1 } from "./diagramTemplates.js";
import { _templatesGeometry } from "./diagramTemplatesGeometry.js";
import { _templatesMisc } from "./diagramTemplatesMisc.js";

export const DIAGRAM_TEMPLATES = [..._templatesPart1, ..._templatesGeometry, ..._templatesMisc];
export const templateById = (id) => DIAGRAM_TEMPLATES.find(t => t.id === id) || null;

/**
 * Draw a template. Never throws: bad or incomplete params simply return null,
 * and the caller falls back to the text placeholder.
 * @returns {{ svg: string, params: object } | null} params are the normalised ones
 */
export function renderDiagramTemplate(id, rawParams) {
  const t = templateById(id);
  if (!t) return null;
  try {
    const params = t.normalize(rawParams && typeof rawParams === "object" ? rawParams : {});
    if (!params) return null;
    const svg = t.render(params);
    return svg ? { svg, params } : null;
  } catch {
    return null;
  }
}

/** The AI is told exactly which templates exist and what JSON each takes. */
export function describeTemplatesForPrompt() {
  return DIAGRAM_TEMPLATES.map(t => `  - "${t.id}" (${t.label}; ${t.subjects}) e.g. ${JSON.stringify(t.example)}`).join("\n");
}

/** The paragraph added to the AI prompt whenever diagrams are allowed. Mirrored to functions/_shared/diagramGuide.js (see tests/promptSync.test.js). */
export function diagramGuideText() {
  return `DIAGRAM TEMPLATES (figures are drawn by code, never by you - do NOT write SVG)
When a question needs a figure that one of these templates can draw exactly, set "generatable": true, "template": the template id, and "params": the JSON that template takes. Use only real numbers and labels, and make sure the question text and the figure agree (same lengths, angles, names and values). Never write in the question text a value that the pupils are meant to find from the figure. For anything a template cannot draw (a labelled plant cell, a map, an animal, apparatus, a photograph), set "generatable": false, "template": null, "params": null, and describe the figure in "description" so the teacher can supply a picture.
Templates, each with an example of its params:
${describeTemplatesForPrompt()}
For a right-angled triangle, "sideLengths" lists BC, CA, AB and the side opposite the right angle must be the longest (the hypotenuse).`;
}
