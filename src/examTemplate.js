/**
 * ═══════════════════════════════════════════════════════════════════
 * EDUFORMIUM - AI QUESTIONS GENERATOR
 * Exam paper template + AI system-prompt builder
 *
 * Mirrors the existing lessonTemplate.js / shsLessonTemplate.js pattern:
 *   - buildExamSystemPrompt(...)  → strict instructions sent to the AI
 *   - renderExamHTML(examData)    → deterministic, print-safe HTML render
 *     of whatever structured JSON the AI (or a human edit) produces
 *
 * The AI is NEVER trusted to emit raw HTML for the exam body - it returns
 * structured JSON (sections → questions → parts), and this file is the
 * single place that turns that JSON into markup. That keeps print/PDF
 * layout, numbering (1a, 1b, i, ii) and dark-mode-safe printing correct
 * and consistent no matter what the model returns.
 * ═══════════════════════════════════════════════════════════════════
 */

/* ────────────────────────────────────────────────────────────────
   1. SYSTEM PROMPT
   ──────────────────────────────────────────────────────────────── */

/**
 * @param {Object} cfg
 *  schoolName, className, subject, term, examType, durationMinutes,
 *  topics (string[]), pastedSyllabus (string),
 *  difficulty ("Easy"|"Moderate"|"Hard"),
 *  languageStyle ("Simple"|"Balanced"|"Advanced"),
 *  cognitiveLevels (string[] subset of ["Recall","Application","Critical Thinking"]),
 *  sections: [{ id:"A", label:"Objective (Multiple Choice)", questionCount, marksPerQuestion, type }]
 *  allowDiagrams (bool)
 */
export function buildExamSystemPrompt(cfg) {
  const {
    schoolName = "", className = "", subject = "", term = "",
    examType = "Class Test", durationMinutes = 60,
    topics = [], pastedSyllabus = "",
    difficulty = "Moderate", languageStyle = "Balanced",
    cognitiveLevels = ["Recall", "Application"],
    sections = [], allowDiagrams = true,
  } = cfg;

  const totalMarks = sections.reduce(
    (sum, s) => sum + (Number(s.questionCount) || 0) * (Number(s.marksPerQuestion) || 0), 0
  );

  const sectionSpec = sections.map(s =>
    `  - Section ${s.id} - ${s.label} (${s.type}): ${s.questionCount} question(s), ${s.marksPerQuestion} mark(s) each, ${(Number(s.questionCount)||0)*(Number(s.marksPerQuestion)||0)} marks total.`
  ).join("\n");

  const topicLine = topics.length
    ? topics.join("; ")
    : (pastedSyllabus ? "(see pasted syllabus below)" : "(no specific topics supplied - use standard scope for the class/subject)");

  return `You are an expert examiner writing a ${examType} for a Ghana Education Service (GES/NaCCA) school.

Return ONLY valid JSON - no markdown fences, no commentary - matching exactly this shape:

{
  "title": string,                     // e.g. "MID-TERM EXAMINATION"
  "instructions": string[],            // top-of-paper instructions, e.g. "Answer ALL questions in Section A", "Write your answers in the booklet provided"
  "sections": [
    {
      "id": "A",
      "label": string,                 // e.g. "Section A: Objective Test"
      "type": "objective" | "structured" | "essay",
      "instructions": string,          // section-level instruction line
      "questions": [
        {
          "number": 1,
          "text": string,              // the question stem
          "options": string[]|null,    // 4 options ("A.","B.","C.","D." prefixes NOT included, just text) for objective type, else null
          "correctOption": "A"|"B"|"C"|"D"|null,   // objective only
          "parts": [                   // for structured/essay: sub-parts like (a), (b) - empty array if none
            { "label": "a", "text": string, "marks": number,
              "subparts": [ { "label": "i", "text": string, "marks": number } ] }
          ],
          "marks": number,             // total marks for this question (sum of parts if any)
          "diagram": { "needed": boolean, "description": string } | null,
          "cognitiveLevel": "Recall"|"Application"|"Critical Thinking",
          "markingGuide": string       // model answer / marking points for this question (Section B/C); for Section A this can be a one-line rationale
        }
      ]
    }
  ],
  "answerKey": [ { "number": 1, "answer": "A" } ],   // Section A objective answers only
  "totalMarks": number
}

EXAM PARAMETERS
  School: ${schoolName || "(not specified)"}
  Class/Grade: ${className || "(not specified)"}
  Subject: ${subject || "(not specified)"}
  Term: ${term || "(not specified)"}
  Exam type: ${examType}
  Duration: ${durationMinutes} minutes
  Curriculum: GES (Ghana Education Service / NaCCA)
  Topics to cover: ${topicLine}
  ${pastedSyllabus ? `Pasted syllabus/reference text (use this as the authoritative scope):\n"""\n${pastedSyllabus}\n"""` : ""}
  Difficulty: ${difficulty}
  Language style: ${languageStyle === "Simple" ? "simple and clear, short sentences, avoid rare vocabulary" : languageStyle === "Advanced" ? "advanced academic wording appropriate for top-band students" : "balanced - clear but properly academic"}
  Cognitive levels to emphasise: ${cognitiveLevels.join(", ")}
  Diagrams: ${allowDiagrams ? "allowed - flag diagram.needed=true and describe it in diagram.description whenever a question genuinely benefits from a labelled diagram, graph, map or figure" : "do not request diagrams"}

STRUCTURE (must match exactly - do not add or remove sections/questions)
${sectionSpec}
  Total marks across the paper: ${totalMarks}

STRICT RULES
1. Follow GES/NaCCA exam-paper conventions: formal register, no chatty tone, no emoji.
2. Number questions continuously within each section starting at 1. Use "a", "b", "c" for parts and "i", "ii", "iii" for sub-parts, exactly as the JSON schema's "label" fields.
3. Every question must map to one of the supplied topics (or the pasted syllabus) - never invent off-syllabus content.
4. No two questions may test the same fact/skill in the same way - avoid repetition across the whole paper.
5. Match the requested difficulty and cognitive-level mix as closely as possible across all sections.
6. Objective (Section A / multiple choice) questions must have exactly 4 options, exactly one correct, and 3 plausible distractors (common misconceptions, not silly options).
7. Structured/essay questions must carry a full marking scheme/model answer in "markingGuide" - specific enough that another teacher could mark from it.
8. Marks per question (and per part, if parts are used) must sum to the "marks" requested for that question in the STRUCTURE above.
9. Keep every diagram description concrete enough that an illustrator or the teacher could sketch it (labels, axes, key features) - never leave it vague.
10. Output nothing but the JSON object.`;
}

/**
 * Builds a system prompt for ONE section only. Generating section-by-section
 * (rather than the whole paper in a single AI call) is a deliberate
 * reliability choice: a 40-question single-call paper risks the model
 * truncating mid-JSON near the token limit, silently corrupting the whole
 * generation. Small, focused calls per section make truncation
 * near-impossible, let the server retry just the failed section instead of
 * the whole paper, and let the client show real per-section progress
 * instead of one long blocking spinner.
 *
 * @param {Object} cfg    - same shape as buildExamSystemPrompt's cfg, plus
 *   optional `includeMarkingScheme` (boolean, default true). When false,
 *   the model is told to skip marking-guide prose entirely (saves output
 *   tokens and generation time) and the answer key/marking scheme UI is
 *   hidden client-side - for teachers who just want a quick question set
 *   (e.g. for a worksheet, or to send to a colleague for review before the
 *   marking scheme is written). When true, the marking guidance is asked
 *   for in the actual GES/WAEC convention per question type: point-by-point
 *   mark allocation for structured questions, a banded Level 1/2/3 rubric
 *   for essay questions, and a one-line rationale (why the key is right and
 *   each distractor is wrong) for objective questions - not just "A is
 *   correct."
 * @param {Object} section - the single { id, label, type, questionCount, marksPerQuestion }
 * @param {Boolean} isFirstSection - whether to also request the paper-level
 *   "title" and "instructions" fields (only needed once)
 */
export function buildSectionPrompt(cfg, section, isFirstSection) {
  const {
    schoolName = "", className = "", subject = "", term = "",
    examType = "Class Test", durationMinutes = 60,
    topics = [], pastedSyllabus = "",
    difficulty = "Moderate", languageStyle = "Balanced",
    cognitiveLevels = ["Recall", "Application"], allowDiagrams = true,
    includeMarkingScheme = true,
  } = cfg;

  const topicLine = topics.length
    ? topics.join("; ")
    : (pastedSyllabus ? "(see pasted syllabus below)" : "(no specific topics supplied - use standard scope for the class/subject)");

  const sectionMarks = (Number(section.questionCount) || 0) * (Number(section.marksPerQuestion) || 0);

  const paperLevelFields = isFirstSection ? `
  "title": string,                     // e.g. "MID-TERM EXAMINATION" - only on the first section
  "instructions": string[],            // top-of-paper instructions - only on the first section` : "";

  const markingGuideFieldDoc = includeMarkingScheme
    ? `"markingGuide": string           // REQUIRED, professional marking scheme - see MARKING SCHEME RULES below for the exact format by question type`
    : `"markingGuide": ""               // marking scheme was NOT requested for this paper - always return an empty string here, do not write any marking guidance`;

  const markingRulesBlock = includeMarkingScheme ? `
MARKING SCHEME RULES (GES/WAEC convention - "markingGuide" must follow the format for this section's type)
${section.type === "objective" ? `- Objective: one line stating the correct option's letter, then a brief clause on why it's correct AND a brief clause on why each of the other three options is a plausible-but-wrong distractor (e.g. "B is correct - mitochondria release energy via respiration. A is wrong because...; C confuses...; D confuses...").` : ""}${section.type === "structured" ? `- Structured: a POINT-BY-POINT breakdown that allocates every mark to a specific idea, step, or fact - never a vague paragraph. Format each part as a short list, e.g. "(a) [1] correct formula stated; [1] correct substitution; [1] correct final answer with unit." State any acceptable alternative methods/answers, and note common wrong answers that must NOT receive credit even if superficially similar.` : ""}${section.type === "essay" ? `- Essay: a BANDED RUBRIC with 3 levels matching WAEC/GES essay-marking convention, each with a mark range and a one-sentence descriptor of what that band's response looks like, e.g. "Level 1 (1-${Math.ceil(section.marksPerQuestion*0.3)}): superficial response, little relevant content. Level 2 (${Math.ceil(section.marksPerQuestion*0.3)+1}-${Math.ceil(section.marksPerQuestion*0.7)}): relevant content with some development, limited critical engagement. Level 3 (${Math.ceil(section.marksPerQuestion*0.7)+1}-${section.marksPerQuestion}): well-developed, critically engaged, addresses the question fully." Then list 3-5 specific content points a strong answer would include.` : ""}
- Every marking guide must be specific enough that a different teacher, reading only the marking guide, could mark a pupil's script consistently - vague guidance like "award marks for a good answer" is not acceptable.` : `
MARKING SCHEME RULES
- The teacher requested QUESTIONS ONLY for this paper - do not write a marking guide, model answer, or point allocation of any kind. Leave "markingGuide" as an empty string "" for every question. Still set "marks" on each question/part normally (the mark allocation itself is part of the question paper, not the marking scheme).`;

  return `You are an expert examiner writing ONE SECTION of a ${examType} for a Ghana Education Service (GES/NaCCA) school. Other sections are generated separately - write ONLY this section's questions, nothing else.

Return ONLY valid JSON - no markdown fences, no commentary - matching exactly this shape:

{${paperLevelFields}
  "section": {
    "id": "${section.id}",
    "label": "${section.label}",
    "type": "${section.type}",
    "instructions": string,
    "questions": [
      {
        "number": 1,                   // number ONLY within this section, starting at 1
        "text": string,
        "options": string[]|null,      // exactly 4 for objective type, else null
        "correctOption": "A"|"B"|"C"|"D"|null,
        "parts": [ { "label": "a", "text": string, "marks": number, "subparts": [ { "label": "i", "text": string, "marks": number } ] } ],
        "marks": number,
        "diagram": {
          "needed": boolean,
          "description": string,
          "generatable": boolean,      // true ONLY if this is a clean geometric/graph/number-line/coordinate-plane figure you can draw precisely in SVG (e.g. a triangle with labelled sides, a bar chart, a number line, a coordinate grid). false for anything needing real-world illustration (a labelled diagram of a plant cell, a map, a photo-realistic scene) - those get a text placeholder for the teacher to fill in.
          "svg": string|null           // if generatable=true: a COMPLETE, valid, self-contained <svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg">...</svg> string using only black/white/greyscale strokes (this prints on paper), with all labels as <text> elements. If generatable=false, this must be null.
        } | null,
        "cognitiveLevel": "Recall"|"Application"|"Critical Thinking",
        ${markingGuideFieldDoc}
      }
    ]
  }
}

SECTION PARAMETERS
  School: ${schoolName || "(not specified)"} | Class: ${className || "(not specified)"} | Subject: ${subject || "(not specified)"} | Term: ${term || "(not specified)"}
  Exam type: ${examType} | Duration: ${durationMinutes} minutes | Curriculum: GES (Ghana Education Service / NaCCA)
  Topics: ${topicLine}
  ${pastedSyllabus ? `Pasted syllabus/reference text (authoritative scope):\n"""\n${pastedSyllabus}\n"""` : ""}
  Difficulty: ${difficulty} | Language style: ${languageStyle === "Simple" ? "simple and clear" : languageStyle === "Advanced" ? "advanced academic wording" : "balanced"} | Cognitive levels: ${cognitiveLevels.join(", ")}
  Diagrams: ${allowDiagrams ? "allowed - see the diagram schema notes above; only set generatable=true when you can actually draw it precisely" : "do not request diagrams (set needed=false on every question)"}

THIS SECTION MUST HAVE EXACTLY ${section.questionCount} question(s), ${section.marksPerQuestion} mark(s) each (${sectionMarks} marks total for this section).

STRICT RULES
1. Formal exam register, no chatty tone, no emoji.
2. Number questions 1..${section.questionCount} within this section only.
3. Use "a","b","c" for parts and "i","ii","iii" for sub-parts.
4. Every question must map to the supplied topics/syllabus - never invent off-syllabus content.
5. No repeated questions within this section.
6. Objective questions: exactly 4 options, one correct, three plausible distractors.
7. Marks per question (and parts, if used) must sum to the requested total.
8. Output nothing but the JSON object.
9. Never use em dashes (the long dash character) anywhere in the paper. Use commas, full stops, colons or brackets instead.
${markingRulesBlock}`;
}


const OPT_LETTERS = ["A", "B", "C", "D", "E", "F"];

/* ────────────────────────────────────────────────────────────────
   3. HTML RENDERER
   ──────────────────────────────────────────────────────────────── */

/**
 * @param {Object} examData  - parsed JSON matching the schema above
 * @param {Object} meta      - { schoolName, className, subject, term, examType, durationMinutes, landscape, diagramImages: {questionNumber: dataURL} }
 * @param {"paper"|"answerKey"} mode
 */
/**
 * Produces a shuffled variant of an already-generated exam for anti-cheating
 * "Version A / B / C" papers - standard practice in real invigilated exams.
 * No extra AI call needed: this reorders questions within each section and
 * reorders MCQ options, deterministically from a seed so the same version
 * letter always produces the same shuffle (reproducible if regenerated).
 *
 * @param {Object} examData - the generated exam (unmodified)
 * @param {String} seed - anything stable, e.g. "B" or "version-2"
 * @returns {Object} a new examData with shuffled order - the original is untouched
 */
export function createExamVariant(examData, seed) {
  const rng = seededRandom(seed);
  const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const newAnswerKey = [];
  const newSections = (examData.sections || []).map(section => {
    const shuffledQuestions = shuffle(section.questions || []).map((q, idx) => {
      const newNumber = idx + 1;
      let newQ = { ...q, number: newNumber };

      if (Array.isArray(q.options) && q.options.length && q.correctOption) {
        const letters = ["A", "B", "C", "D", "E", "F"].slice(0, q.options.length);
        const correctIdx = letters.indexOf(q.correctOption);
        const pairs = q.options.map((opt, i) => ({ opt, wasCorrect: i === correctIdx }));
        const shuffledPairs = shuffle(pairs);
        newQ = {
          ...newQ,
          options: shuffledPairs.map(p => p.opt),
          correctOption: letters[shuffledPairs.findIndex(p => p.wasCorrect)],
        };
      }
      if (newQ.correctOption) newAnswerKey.push({ number: newNumber, answer: newQ.correctOption });
      return newQ;
    });
    return { ...section, questions: shuffledQuestions };
  });

  return { ...examData, sections: newSections, answerKey: newAnswerKey };
}

/** Small deterministic PRNG (mulberry32) so the same seed always shuffles the same way. */
function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h = (h ^= h >>> 16) >>> 0;
    return h / 4294967296;
  };
}

/** Initials for the fallback school seal, e.g. "St. Mary's JHS" -> "SMJ". */
function schoolInitials(name) {
  const skip = new Set(["of", "the", "and", "for", "&"]);
  return String(name || "")
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z]/g, ""))
    .filter(w => w && !skip.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase())
    .join("")
    .slice(0, 3);
}

/**
 * Clean, print-safe monogram seal (double ring + initials) used in the paper
 * header when the school hasn't uploaded a logo, so the letterhead never
 * looks bare. Returns "" when there is no school name to take initials from.
 */
export function schoolMonogramSVG(name) {
  const letters = schoolInitials(name);
  if (!letters) return "";
  const fs = letters.length >= 3 ? 27 : letters.length === 2 ? 33 : 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
    `<circle cx="50" cy="50" r="47" fill="#ffffff" stroke="#111111" stroke-width="3"/>` +
    `<circle cx="50" cy="50" r="41" fill="none" stroke="#111111" stroke-width="1"/>` +
    `<text x="50" y="${50 + fs * 0.35}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs}" fill="#111111">${letters}</text>` +
    `</svg>`;
}

export const OPTIONS_LAYOUTS = [
  { id: "vertical", label: "Vertical (A, B, C, D stacked)" },
  { id: "two", label: "Two columns" },
  { id: "row", label: "One row" },
];

export function renderExamHTML(examData, meta = {}, mode = "paper") {
  const {
    schoolName = "", className = "", subject = "", term = "",
    examType = "Exam", durationMinutes = 60, landscape = false,
    diagramImages = {}, schoolLogo = null, examVersion = "",
    optionsLayout = "vertical",
  } = meta;
  const layout = ["vertical", "two", "row"].includes(optionsLayout) ? optionsLayout : "vertical";

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const nl = (t) => esc(t).replace(/\n/g, "<br/>");
  // Safe for use inside a CSS string literal (page footer text).
  const cssStr = (s) => String(s ?? "").replace(/[\\"\n\r]/g, " ").replace(/</g, "").slice(0, 80);

  const sections = examData.sections || [];
  const sumMarks = (qs) => (qs || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
  const computedTotal = sections.reduce((s, sec) => s + sumMarks(sec.questions), 0);
  const totalMarks = computedTotal || Number(examData.totalMarks) || 0;

  const renderDiagram = (q) => {
    if (!q.diagram || !q.diagram.needed) return "";
    const img = diagramImages[q.number];
    // Priority: teacher-uploaded image > AI-generated SVG (geometric/graph figures
    // the model can draw precisely) > text placeholder (anything needing real
    // illustration - a cell diagram, a map - that a human should supply).
    if (img) {
      return `<div class="diagram-box"><img src="${img}" alt="Diagram for question ${q.number}" class="diagram-img"/></div>`;
    }
    if (q.diagram.generatable && q.diagram.svg) {
      return `<div class="diagram-box diagram-svg-wrap">${q.diagram.svg}</div>`;
    }
    return `<div class="diagram-box"><div class="diagram-placeholder">[ DIAGRAM: ${esc(q.diagram.description || "see description")} ]</div></div>`;
  };

  const renderOptions = (q) => {
    if (!q.options || !q.options.length) return "";
    const cols = layout === "row" ? Math.min(q.options.length, 4) : 2;
    const style = layout === "vertical" ? "" : ` style="grid-template-columns:repeat(${cols},1fr)"`;
    return `<div class="opts opts-${layout}"${style}>${q.options.map((o, i) =>
      `<div class="opt"><span class="opt-letter">${OPT_LETTERS[i]}.</span><span class="opt-text">${nl(o)}</span></div>`
    ).join("")}</div>`;
  };

  const renderSubparts = (subparts) => {
    if (!subparts || !subparts.length) return "";
    return `<div class="subparts">${subparts.map(sp =>
      `<div class="row sub-row"><span class="lbl">(${esc(sp.label)})</span><span class="txt">${nl(sp.text)}</span><span class="marks">[${sp.marks}]</span></div>`
    ).join("")}</div>`;
  };

  const renderParts = (parts) => {
    if (!parts || !parts.length) return "";
    return `<div class="parts">${parts.map(p => `
      <div class="part">
        <div class="row part-row"><span class="lbl">(${esc(p.label)})</span><span class="txt">${nl(p.text)}</span><span class="marks">[${p.marks}]</span></div>
        ${renderSubparts(p.subparts)}
      </div>`).join("")}</div>`;
  };

  const renderQuestion = (q) => {
    const hasParts = Array.isArray(q.parts) && q.parts.length > 0;
    return `
    <div class="question" data-qnum="${q.number}">
      <div class="row q-row${hasParts ? " has-parts" : ""}">
        <span class="lbl q-num">${q.number}.</span>
        <div class="q-body">
          <div class="q-text">${nl(q.text)}</div>
          ${renderDiagram(q)}
          ${renderOptions(q)}
          ${renderParts(q.parts)}
        </div>
        ${hasParts ? "" : `<span class="marks">[${q.marks}]</span>`}
      </div>
    </div>`;
  };

  const renderSection = (s) => {
    const secMarks = sumMarks(s.questions);
    const qs = s.questions || [];
    return `
    <div class="section">
      <div class="section-start">
      <div class="section-header">
        <div class="section-line">
          <span class="section-title">${esc(s.label)}</span>
          ${secMarks ? `<span class="section-marks">${secMarks} marks</span>` : ""}
        </div>
        ${s.instructions ? `<div class="section-instructions">${esc(s.instructions)}</div>` : ""}
      </div>
      ${qs.length ? renderQuestion(qs[0]) : ""}
      </div>
      ${qs.slice(1).map(renderQuestion).join("")}
    </div>`;
  };

  // Letterhead shared by the question paper and the marking scheme.
  const logoMarkup = schoolLogo
    ? `<img src="${schoolLogo}" alt="School logo" class="school-logo"/>`
    : (schoolMonogramSVG(schoolName) ? `<div class="school-logo school-seal">${schoolMonogramSVG(schoolName)}</div>` : "");

  const letterhead = (titleText) => `
      <div class="lh-row">
        <div class="lh-side">${logoMarkup}</div>
        <div class="lh-text">
          <div class="school-name">${esc(schoolName || "________________________________")}</div>
        </div>
        <div class="lh-side"></div>
      </div>
      <div class="lh-rule"></div>
      <div class="exam-title">${titleText}</div>`;

  const titleText = `${esc(examData.title || examType.toUpperCase())}${examVersion ? ` <span class="exam-version">VERSION ${esc(examVersion)}</span>` : ""}`;

  const metaCell = (label, value) =>
    `<td><div class="meta-label">${label}</div><div class="meta-value">${esc(value) || "&nbsp;"}</div></td>`;

  const headerBlock = `
    <div class="paper-header">
      ${letterhead(titleText)}
      <table class="meta-grid">
        <tr>
          ${metaCell("Subject", subject)}
          ${metaCell("Class", className)}
          ${metaCell("Term", term)}
          ${metaCell("Duration", `${durationMinutes} mins`)}
          ${totalMarks ? metaCell("Total Marks", totalMarks) : ""}
        </tr>
      </table>
      <div class="candidate">
        <div class="cand-field grow"><span>Name:</span><i></i></div>
        <div class="cand-field w-index"><span>Index No.:</span><i></i></div>
        <div class="cand-field w-date"><span>Date:</span><i></i></div>
        <div class="score-box"><span>Score</span><b>/ ${totalMarks || ""}</b></div>
      </div>
      ${(examData.instructions || []).length ? `
      <div class="instructions">
        <div class="instr-title">Instructions to Candidates</div>
        <ol>${examData.instructions.map(i => `<li>${esc(i)}</li>`).join("")}</ol>
      </div>` : ""}
    </div>`;

  const renderAnswerKey = () => {
    const key = examData.answerKey || [];
    const hasAnyMarkingGuide = sections.some(s => (s.questions || []).some(q => q.markingGuide && q.markingGuide.trim()));
    const keyHeader = `
      <div class="paper-header answer-header">
        ${letterhead(`MARKING SCHEME${examVersion ? ` <span class="exam-version">VERSION ${esc(examVersion)}</span>` : ""}`)}
        <table class="meta-grid">
          <tr>
            ${metaCell("Subject", subject)}
            ${metaCell("Class", className)}
            ${metaCell("Term", term)}
            ${totalMarks ? metaCell("Total Marks", totalMarks) : ""}
          </tr>
        </table>
      </div>`;
    if (!key.length && !hasAnyMarkingGuide) {
      return `
        ${keyHeader}
        <div class="answer-page">
          <h2>MARKING SCHEME</h2>
          <p class="no-marking-scheme">This paper was generated in <b>Questions Only</b> mode - no answer key or marking
          scheme was requested. Regenerate with "Questions + Marking Scheme" enabled to get one.</p>
        </div>`;
    }
    return `
      ${keyHeader}
      <div class="answer-page">
        ${key.length ? `
        <h2>SECTION A: ANSWER KEY</h2>
        <div class="key-grid">
          ${key.map(k => `<div class="key-cell"><b>${k.number}.</b> ${esc(k.answer)}</div>`).join("")}
        </div>` : ""}
        <h2>MARKING SCHEME - SECTIONS B &amp; C</h2>
        ${sections.filter(s => s.type !== "objective").map(s => `
          <h3>${esc(s.label)}</h3>
          ${(s.questions || []).map(q => `
            <div class="mark-block">
              <div class="mark-qnum"><span>Question ${q.number}</span><span class="marks">[${q.marks}]</span></div>
              <div class="mark-guide">${nl(q.markingGuide)}</div>
            </div>`).join("")}
        `).join("")}
      </div>`;
  };

  const body = mode === "answerKey"
    ? renderAnswerKey()
    : `${headerBlock}${sections.map(renderSection).join("")}
       <div class="end-mark"><span>END OF PAPER</span></div>`;

  const footerLeft = cssStr([schoolName, subject].filter(Boolean).join("  |  "));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(examData.title || examType)} - ${esc(subject)}</title>
<style>
  * { box-sizing: border-box; }
  html,body{ margin:0; padding:0; background:#E9EBEF; font-family:"Times New Roman",Times,"Liberation Serif",Georgia,serif; color:#111; }
  .page{ max-width:794px; margin:24px auto; background:#fff; padding:44px 52px 52px; box-shadow:0 1px 4px rgba(0,0,0,.12); font-size:12pt; line-height:1.5; }

  /* ── Letterhead ─────────────────────────────────────────── */
  .paper-header{ margin-bottom:20px; }
  .lh-row{ display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .lh-side{ width:84px; flex-shrink:0; display:flex; align-items:center; justify-content:flex-start; }
  .lh-text{ flex:1; text-align:center; }
  .school-logo{ width:84px; height:84px; object-fit:contain; display:block; }
  .school-seal svg{ width:100%; height:100%; display:block; }
  .school-name{ font-size:21pt; font-weight:700; text-transform:uppercase; letter-spacing:.06em; line-height:1.2; }
  .lh-rule{ margin:10px 0 0; border-top:3px solid #111; border-bottom:1px solid #111; height:5px; }
  .exam-title{ text-align:center; font-size:14pt; font-weight:700; text-transform:uppercase; letter-spacing:.12em; margin:12px 0 10px; }
  .exam-version{ font-weight:600; letter-spacing:.06em; border:1px solid #111; padding:1px 7px; margin-left:8px; font-size:10pt; vertical-align:middle; }

  .meta-grid{ width:100%; border-collapse:collapse; border:1.5px solid #111; table-layout:fixed; }
  .meta-grid td{ border-right:1px solid #111; padding:5px 9px 6px; vertical-align:top; }
  .meta-grid td:last-child{ border-right:none; }
  .meta-label{ font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#444; line-height:1.3; }
  .meta-value{ font-size:11pt; font-weight:700; line-height:1.35; }

  .candidate{ display:flex; align-items:flex-end; gap:18px; margin-top:16px; font-size:11pt; }
  .cand-field{ display:flex; align-items:flex-end; gap:6px; }
  .cand-field.grow{ flex:1; }
  .cand-field.w-index{ width:30%; }
  .cand-field.w-date{ width:20%; }
  .cand-field span{ white-space:nowrap; font-weight:700; }
  .cand-field i{ flex:1; border-bottom:1px solid #111; height:1.1em; }
  .score-box{ border:1.5px solid #111; padding:3px 12px 4px; min-width:84px; text-align:center; line-height:1.25; }
  .score-box span{ display:block; font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#444; }
  .score-box b{ font-size:11pt; }

  .instructions{ margin-top:16px; border:1px solid #111; padding:8px 14px 8px; font-size:10.5pt; line-height:1.55; }
  .instr-title{ font-weight:700; text-transform:uppercase; letter-spacing:.1em; font-size:9.5pt; border-bottom:1px solid #999; padding-bottom:3px; margin-bottom:4px; }
  .instructions ol{ margin:4px 0 0 18px; padding:0; }
  .instructions li{ margin:1px 0; }

  /* ── Sections ───────────────────────────────────────────── */
  .section{ margin-top:22px; }
  .section-header{ background:#EDEEF1; border-top:1.5px solid #111; border-bottom:1.5px solid #111; padding:6px 10px 6px; margin-bottom:14px; }
  .section-start{ break-inside:avoid; page-break-inside:avoid; }
  .section-line{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .section-title{ font-size:12pt; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .section-marks{ font-size:10pt; font-weight:700; white-space:nowrap; }
  .section-instructions{ font-size:10.5pt; font-style:italic; color:#222; margin-top:2px; line-height:1.45; }

  /* ── Questions ──────────────────────────────────────────── */
  .question{ margin-bottom:16px; font-size:12pt; line-height:1.5; page-break-inside:avoid; }
  .row{ display:grid; grid-template-columns:2.3em 1fr 3.4em; column-gap:4px; align-items:start; }
  .row.has-parts{ grid-template-columns:2.3em 1fr; }
  .lbl{ font-weight:700; }
  .marks{ font-weight:700; white-space:nowrap; text-align:right; }
  .q-text{ margin-bottom:2px; }

  .opts{ margin-top:6px; }
  .opt{ display:grid; grid-template-columns:1.8em 1fr; align-items:start; line-height:1.45; }
  .opt-letter{ font-weight:700; }
  .opts-vertical .opt{ margin:3px 0; }
  .opts-two, .opts-row{ display:grid; column-gap:20px; row-gap:5px; }

  .parts{ margin-top:8px; }
  .part{ margin-top:6px; }
  .part-row{ grid-template-columns:2.3em 1fr 3.4em; }
  .subparts{ margin:4px 0 0 2.3em; }
  .sub-row{ grid-template-columns:2.3em 1fr 3.4em; margin-top:3px; font-size:11.5pt; }

  .diagram-box{ margin:10px 0; }
  .diagram-placeholder{ border:1.5px dashed #888; padding:18px; font-size:10.5pt; color:#444; text-align:center; background:#F7F7F8; font-style:italic; }
  .diagram-img{ max-width:100%; max-height:260px; display:block; margin:0 auto; border:1px solid #BBB; }
  .diagram-svg-wrap{ display:flex; justify-content:center; }
  .diagram-svg-wrap svg{ max-width:100%; max-height:230px; }

  .end-mark{ text-align:center; margin-top:28px; }
  .end-mark span{ display:inline-block; font-weight:700; letter-spacing:.2em; font-size:11pt; border-top:1px solid #111; border-bottom:1px solid #111; padding:3px 26px; }

  /* ── Marking scheme ─────────────────────────────────────── */
  .answer-page h2{ font-size:12pt; text-transform:uppercase; letter-spacing:.06em; background:#EDEEF1; border-top:1.5px solid #111; border-bottom:1.5px solid #111; padding:6px 10px; margin:24px 0 12px; }
  .answer-page h3{ font-size:11.5pt; margin:16px 0 4px; text-decoration:underline; }
  .no-marking-scheme{ font-size:11.5pt; color:#333; line-height:1.6; background:#F7F7F8; border:1px dashed #888; padding:14px 16px; margin-top:10px; }
  .key-grid{ display:grid; grid-template-columns:repeat(10,1fr); gap:0; font-size:11pt; border-left:1px solid #111; border-top:1px solid #111; }
  .key-cell{ padding:5px 6px; text-align:center; border-right:1px solid #111; border-bottom:1px solid #111; }
  .mark-block{ margin-top:12px; font-size:11.5pt; page-break-inside:avoid; }
  .mark-qnum{ font-weight:700; display:flex; justify-content:space-between; border-bottom:1px solid #BBB; padding-bottom:2px; }
  .mark-guide{ margin-top:5px; line-height:1.55; color:#111; }

  /* ── PRINT: dark-mode-safe, solid black, correct margins ──────── */
  @media print {
    @page {
      size: A4 ${landscape ? "landscape" : "portrait"}; margin: 16mm 16mm 20mm;
      @bottom-left { content: "${footerLeft}"; font-family:"Times New Roman",Times,serif; font-size:8.5pt; color:#444; }
      @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family:"Times New Roman",Times,serif; font-size:8.5pt; color:#444; }
    }
    html { color-scheme: light only !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { background:#fff !important; color:#000 !important; }
    .page{ box-shadow:none !important; margin:0 !important; max-width:none !important; padding:0 !important; font-size:11.5pt; }
    .question{ font-size:11.5pt; }
    .diagram-img{ max-height:200px; }
    .answer-page h2, .answer-page h3{ break-after:avoid; }
    .question, .mark-block{ break-inside:avoid; }
    .paper-header{ break-after:avoid; }
  }
</style>
</head>
<body>
  <div class="page">${body}</div>
</body>
</html>`;
}

/**
 * Minimal safety check on AI-returned SVG before it's ever rendered: must be
 * a well-formed <svg> root, reasonably sized, and contain none of the tags
 * that could execute script or load external content in a print window
 * (script/foreignObject/iframe/image with an http(s) href - external image
 * refs would silently fail offline and are also an easy injection vector).
 * Anything that fails this check is treated as "not generatable" and falls
 * back to the text placeholder instead of being rendered.
 */
export function isSafeGeneratedSVG(svg) {
  if (typeof svg !== "string" || svg.length > 20000) return false;
  const trimmed = svg.trim();
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return false;
  if (/<script|<foreignObject|<iframe|on\w+\s*=|javascript:/i.test(trimmed)) return false;
  if (/<image[^>]+href\s*=\s*["']https?:/i.test(trimmed)) return false;
  return true;
}

/**
 * Validates a parsed exam JSON against the structure requested, so
 * malformed/truncated AI output is caught before rendering.
 * Returns { ok:boolean, errors:string[] }
 */
export function validateExamData(examData, expectedSections = []) {
  const errors = [];
  if (!examData || typeof examData !== "object") return { ok: false, errors: ["Empty or unparsable response."] };
  if (!Array.isArray(examData.sections) || !examData.sections.length) errors.push("No sections returned.");
  expectedSections.forEach(exp => {
    const got = (examData.sections || []).find(s => s.id === exp.id);
    if (!got) { errors.push(`Section ${exp.id} is missing.`); return; }
    const questions = got.questions || [];
    const gotCount = questions.length;
    if (gotCount !== Number(exp.questionCount)) {
      errors.push(`Section ${exp.id} expected ${exp.questionCount} question(s), got ${gotCount}.`);
      return; // question-count mismatch makes the marks check below meaningless - skip it
    }

    // Marks-integrity check: catches a model that generates the right NUMBER
    // of questions but gets the arithmetic wrong (e.g. a 10-mark question
    // whose parts sum to 8) - a subtler failure than truncation, but just as
    // damaging on a real exam paper, since a wrong total means a teacher
    // has to hand-fix the mark scheme before they can use it.
    const expectedSectionMarks = Number(exp.questionCount) * Number(exp.marksPerQuestion);
    const actualSectionMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    if (actualSectionMarks !== expectedSectionMarks) {
      errors.push(`Section ${exp.id} marks don't add up: expected ${expectedSectionMarks} total, got ${actualSectionMarks}.`);
    }
    questions.forEach(q => {
      if (Array.isArray(q.parts) && q.parts.length) {
        const partsSum = q.parts.reduce((sum, p) => sum + (Number(p.marks) || 0), 0);
        if (partsSum !== Number(q.marks)) {
          errors.push(`Section ${exp.id}, Question ${q.number}: parts don't sum to the question's mark total (parts=${partsSum}, question marked out of ${q.marks}).`);
        }
      }
    });
  });
  // Sanitize any diagram SVGs in place - untrusted model output never reaches print.
  (examData.sections || []).forEach(s => (s.questions || []).forEach(q => {
    if (q.diagram?.svg && !isSafeGeneratedSVG(q.diagram.svg)) {
      q.diagram.generatable = false;
      q.diagram.svg = null;
    }
  }));
  return { ok: errors.length === 0, errors };
}
