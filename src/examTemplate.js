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
import { IMAGE_SIZES, isSafeImageDataUrl, imageSizeKey } from "./imageUtils.js";
import { diagramGuideText, renderDiagramTemplate } from "./diagramRegistry.js";
import { classWithProgramme, termCell } from "./shsLevel.js";
import { imageAlign, imagePlacement, diagramDrawing, figureLabels, captionText } from "./examFigures.js";
import { figureLines, hasPartFigureLines, ownerImageOk, ownerDrawing } from "./partFigures.js";
import { beceStyleBlock, beceSchemeBlock, answerableMarks, getBeceProfile, minutesLabel, cleanBeceTitle, BECE_OBJECTIVE_INSTRUCTIONS } from "./beceStyle.js";

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
    schoolName = "", className = "", programme = "", subject = "", term = "",
    examType = "Class Test", durationMinutes = 60,
    topics = [], pastedSyllabus = "",
    difficulty = "Moderate", languageStyle = "Balanced",
    cognitiveLevels = ["Recall", "Application"], allowDiagrams = true,
    includeMarkingScheme = true,
  } = cfg;
  const isBece = cfg.examStyle === "bece";
  const startNum = isBece ? (Number(section.numberFrom) || 1) : 1;
  const endNum = startNum + (Number(section.questionCount) || 1) - 1;
  const beceNote = isBece ? "\n  Level: JHS pupils sitting the Basic Education Certificate Examination (BECE) in Ghana. Pitch every question at BECE standard and follow the BECE-STYLE PAPER rules below." : "";

  // SHS papers name the programme and are pitched at WASSCE standard. The programme is
  // free text from the browser, so it is reduced to letters/spaces before it reaches the prompt.
  const programmeClean = String(programme || "").replace(/[^A-Za-z &/-]/g, "").trim().slice(0, 40);
  const shsNote = /^SHS\s*[123]$/i.test(String(className).trim())
    ? `\n  Level: Senior High School (${String(className).trim()}), ${programmeClean && programmeClean !== "Core Subjects" ? `${programmeClean} programme` : "core subject"}. Pitch the paper at SHS / WASSCE standard: SHS-level vocabulary and depth, with application and reasoning questions rather than recall alone.`
    : "";

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

  const markingRulesBlock = (includeMarkingScheme && isBece) ? beceSchemeBlock(cfg, section) : includeMarkingScheme ? `
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
        "number": ${startNum},                   // number ONLY within this section, starting at ${startNum}
        "text": string,
        "options": string[]|null,      // exactly 4 for objective type, else null
        "correctOption": "A"|"B"|"C"|"D"|null,
        "parts": [ { "label": "a", "text": string, "marks": number, "subparts": [ { "label": "i", "text": string, "marks": number } ] } ],
        "marks": number,
        "diagram": {
          "needed": boolean,
          "description": string,
          "generatable": boolean,      // true ONLY when one of the DIAGRAM TEMPLATES below draws it exactly; false for anything needing real-world illustration (a plant cell, a map, apparatus) - those get a text placeholder for the teacher to fill in.
          "template": string|null,     // the template id when generatable=true, else null
          "params": object|null        // that template's params (numbers and labels only) when generatable=true, else null
        } | null,
        "cognitiveLevel": "Recall"|"Application"|"Critical Thinking",
        ${markingGuideFieldDoc}
      }
    ]
  }
}

${allowDiagrams ? diagramGuideText() + "\n\n" : ""}SECTION PARAMETERS
  School: ${schoolName || "(not specified)"} | Class: ${className || "(not specified)"} | Subject: ${subject || "(not specified)"} | Term: ${term || "(not specified)"}${shsNote}${beceNote}
  Exam type: ${examType} | Duration: ${durationMinutes} minutes | Curriculum: GES (Ghana Education Service / NaCCA)
  Topics: ${topicLine}
  ${pastedSyllabus ? `Pasted syllabus/reference text (authoritative scope):\n"""\n${pastedSyllabus}\n"""` : ""}
  Difficulty: ${difficulty} | Language style: ${languageStyle === "Simple" ? "simple and clear" : languageStyle === "Advanced" ? "advanced academic wording" : "balanced"} | Cognitive levels: ${cognitiveLevels.join(", ")}
  Diagrams: ${allowDiagrams ? "allowed - see the DIAGRAM TEMPLATES above; only set generatable=true when a template fits exactly" : "do not request diagrams (set needed=false on every question)"}

THIS SECTION MUST HAVE EXACTLY ${section.questionCount} question(s), ${section.marksPerQuestion} mark(s) each (${sectionMarks} marks total for this section).

STRICT RULES
1. Formal exam register, no chatty tone, no emoji.
2. Number questions ${startNum}..${endNum} within this section only.
3. Use "a","b","c" for parts and "i","ii","iii" for sub-parts.
4. Every question must map to the supplied topics/syllabus - never invent off-syllabus content.
5. No repeated questions within this section.
6. Objective questions: exactly 4 options, one correct, three plausible distractors.
7. Marks per question (and parts, if used) must sum to the requested total.
8. Output nothing but the JSON object.
9. Never use em dashes (the long dash character) anywhere in the paper. Use commas, full stops, colons or brackets instead.
${beceStyleBlock(cfg, section)}
${markingRulesBlock}`;
}


const OPT_LETTERS = ["A", "B", "C", "D", "E", "F"];

/* ────────────────────────────────────────────────────────────────
   3. HTML RENDERER
   ──────────────────────────────────────────────────────────────── */

/**
 * @param {Object} examData  - parsed JSON matching the schema above
 * @param {Object} meta      - { schoolName, className, subject, term, examType, durationMinutes, landscape, each question may carry image: { src, size, caption } }
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
    const keepOrder = examData.style === "bece" && section.type !== "objective";
    const shuffledQuestions = (keepOrder ? (section.questions || []) : shuffle(section.questions || [])).map((q, idx) => {
      const newNumber = keepOrder ? q.number : idx + 1;
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

/* ────────────────────────────────────────────────────────────────
   SCHOOL EMBLEM (generated fallback when no logo is uploaded)
   ──────────────────────────────────────────────────────────────── */

/** Initials for the generated emblem, e.g. "St. Mary's JHS" -> "SMJ". */
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

// Words that start the "type of school" part of a name ("... Junior High School").
const SCHOOL_TYPE_WORDS = new Set([
  "junior", "senior", "basic", "primary", "preparatory", "prep", "international", "technical",
  "high", "school", "academy", "college", "complex", "montessori", "nursery", "kindergarten",
  "day", "boarding", "vocational", "institute", "centre", "center", "learning", "jhs", "shs", "jss", "sss", "shts", "tvet", "stem",
]);

/**
 * Splits a school name into the distinctive part and the "type of school"
 * part so a crest can set them on the top and bottom arcs:
 *   "St. Mary's Junior High School" -> ["ST. MARY'S", "JUNIOR HIGH SCHOOL"]
 *   "Achimota School"               -> ["ACHIMOTA", "SCHOOL"]
 *   "Sunrise Learning Centre"       -> ["SUNRISE LEARNING CENTRE", ""]
 */
export function splitSchoolName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const idx = words.findIndex((w, i) => i > 0 && SCHOOL_TYPE_WORDS.has(w.replace(/[^A-Za-z]/g, "").toLowerCase()));
  const core = (idx === -1 ? words : words.slice(0, idx)).join(" ").toUpperCase();
  const tail = idx === -1 ? "" : words.slice(idx).join(" ").toUpperCase();
  return [core, tail];
}

const xmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Print-safe, greyscale school crest used in the letterhead when no logo has
 * been uploaded: double ring, school name set on the arcs, an open book and
 * the school's initials in the centre. It is a neutral generic design, never
 * an imitation of any real institution's or examining body's seal, so it is
 * safe for any school, class test or mock paper. Returns "" without a name.
 */
export function schoolCrestSVG(name) {
  const letters = schoolInitials(name);
  const clean = String(name || "").trim();
  if (!clean) return "";
  const [core, tail] = splitSchoolName(clean);

  const CHAR_W = 0.8;           // average width of a bold capital incl. letter-spacing, in em
  const ARC = 128;              // usable arc length (viewBox units) before the side stars
  const R_TOP = 44.5;           // baseline radius of the top arc text

  /** Largest size that fits the arc; drops words (never squeezes below legibility) when it can't. */
  const fitArc = (text, base, min, fromEnd) => {
    let words = text.split(" ").filter(Boolean);
    while (words.length) {
      const t = words.join(" ");
      const size = Math.min(base, ARC / (t.length * CHAR_W));
      if (size >= min || words.length === 1) {
        const est = t.length * size * CHAR_W;
        return { text: t, size: Math.max(size, min * 0.85), len: Math.min(est, ARC) };
      }
      words = fromEnd ? words.slice(1).filter((w, i) => i > 0 || w !== "&") : words.slice(0, -1);
    }
    return null;
  };

  const top = core.length > 2 ? fitArc(core, 11, 8, false) : null;
  const bot = tail ? fitArc(tail, 9.5, 7.6, true) : null;
  const R_BOT = R_TOP + (bot ? bot.size * 0.7 : 6);   // bottom text hangs from its outer edge

  const topPath = `M ${60 - R_TOP},60 A ${R_TOP},${R_TOP} 0 0,1 ${60 + R_TOP},60`;
  const botPath = `M ${60 - R_BOT},60 A ${R_BOT},${R_BOT} 0 0,0 ${60 + R_BOT},60`;
  const font = `font-family="Georgia, 'Times New Roman', serif" fill="#111111"`;
  const initialsSize = letters.length >= 3 ? 25 : letters.length === 2 ? 31 : 38;
  const arcText = (id, t, ls) =>
    `<text ${font} font-weight="700" font-size="${t.size.toFixed(1)}"><textPath href="#${id}" xlink:href="#${id}" startOffset="50%" text-anchor="middle" textLength="${t.len.toFixed(1)}" lengthAdjust="spacing">${xmlEsc(t.text)}</textPath></text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${xmlEsc(clean)} emblem">` +
    `<defs><path id="eduTop" d="${topPath}"/><path id="eduBot" d="${botPath}"/></defs>` +
    `<circle cx="60" cy="60" r="58" fill="#ffffff" stroke="#111111" stroke-width="3"/>` +
    `<circle cx="60" cy="60" r="54.5" fill="none" stroke="#111111" stroke-width="0.8"/>` +
    `<circle cx="60" cy="60" r="38" fill="none" stroke="#111111" stroke-width="1.4"/>` +
    `<circle cx="60" cy="60" r="35.5" fill="none" stroke="#111111" stroke-width="0.6"/>` +
    (top ? arcText("eduTop", top) : "") +
    (bot ? arcText("eduBot", bot) : "") +
    // Separator stars where the two arcs meet (a star pair also fills the ring when there is no text).
    `<text x="7.2" y="63.6" font-size="9" text-anchor="middle" ${font}>&#9733;</text>` +
    `<text x="112.8" y="63.6" font-size="9" text-anchor="middle" ${font}>&#9733;</text>` +
    (!bot ? `<text x="60" y="108" font-size="8" text-anchor="middle" letter-spacing="6" ${font}>&#9733;&#9733;&#9733;</text>` : "") +
    `<text x="60" y="${letters ? 63 : 70}" text-anchor="middle" ${font} font-weight="700" font-size="${letters ? initialsSize : 30}">${letters || "&#9733;"}</text>` +
    // Open book beneath the initials.
    `<g fill="none" stroke="#111111" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="M41,76 Q50.5,71 60,76 Q69.5,71 79,76 L79,89 Q69.5,84 60,89 Q50.5,84 41,89 Z"/>` +
    `<path d="M60,76 L60,89"/></g>` +
    `</svg>`;
}

/** Kept for backwards compatibility: older code imported the placeholder under this name. */
export const schoolMonogramSVG = schoolCrestSVG;

export const OPTIONS_LAYOUTS = [
  { id: "vertical", label: "Stacked", title: "A, B, C, D listed one under another" },
  { id: "two", label: "2 Columns", title: "Options arranged in two columns" },
  { id: "row", label: "1 Row", title: "All options on a single line" },
];

/** Candidate-ID styles for the paper header. */
export const ID_MODES = [
  { id: "line", label: "Line (Index No.: ______)" },
  { id: "boxes", label: "Boxes (one per digit, WAEC style)" },
  { id: "none", label: "None" },
];

/**
 * One-tap paper-format presets for the UI. "school" is the everyday class
 * test / term exam; "public" mirrors the conventions of public examination
 * papers (BECE, WASSCE and mock papers set for them): index-number boxes, a
 * sealed-paper notice and "Turn over" on every page but the last.
 * Everything stays individually adjustable after a preset is applied.
 */
export const PAPER_PRESETS = {
  school: { id: "school", label: "School exam", idMode: "line", idDigits: 10, idLabel: "Index No.", notice: false, turnOver: true },
  public: { id: "public", label: "BECE / WASSCE style", idMode: "boxes", idDigits: 10, idLabel: "Index Number", notice: true, turnOver: true },
};

export const DEFAULT_NOTICE = "Do not open this question paper until you are told to do so";

/** Clamps the number of index-number boxes to something that fits an A4 line. */
export function clampIdDigits(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 10;
  return Math.min(15, Math.max(4, v));
}

/* ────────────────────────────────────────────────────────────────
   Paginator: runs inside the generated document. It measures every block
   of the paper at the real page width and lays them onto fixed A4 sheets,
   which is the only way to get the same "Page X of Y" and a "Turn over" note
   on every page except the last in EVERY browser (CSS page-margin boxes are
   Chromium-only and cannot skip the final page). Preview, print and PDF all
   come from the same sheets, so what you see is what you print.
   ──────────────────────────────────────────────────────────────── */
const PAGINATE_SCRIPT = `
(function () {
  var doc = document, root = doc.documentElement, started = false;
  function txt(id) { var n = doc.getElementById(id); return n ? n.textContent : ""; }
  function make(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  function paginate() {
    var src = doc.getElementById("src"), out = doc.getElementById("sheets");
    if (!src || !out) return;
    var blocks = Array.prototype.slice.call(src.children);
    var turnOver = root.getAttribute("data-turn-over") === "1";
    var footLeft = txt("foot-left"), turnText = txt("foot-turn") || "Turn over";

    root.classList.add("measuring");
    var probe = make("section", "sheet probe"), probeBody = make("div", "sheet-body");
    probe.appendChild(probeBody); doc.body.appendChild(probe);
    var cap = probeBody.getBoundingClientRect().height;
    var sheetW = probe.getBoundingClientRect().width;
    doc.body.removeChild(probe);

    blocks.forEach(function (b) {
      b._h = b.getBoundingClientRect().height;
      b._pt = parseFloat(getComputedStyle(b).paddingTop) || 0;
    });

    var pages = [[]], used = 0, EPS = 0.75;
    function page() { return pages[pages.length - 1]; }
    function newPage() { pages.push([]); used = 0; }
    function place(b) {
      var top = page().length === 0;
      var need = top ? b._h - b._pt : b._h;
      if (!top && used + need > cap + EPS) { newPage(); top = true; need = b._h - b._pt; }
      if (top) b.classList.add("at-top");
      page().push(b); used += need;
    }

    var i = 0;
    while (i < blocks.length) {
      var chain = [blocks[i]];
      while (chain[chain.length - 1].getAttribute("data-keep") === "1" && i + chain.length < blocks.length) {
        chain.push(blocks[i + chain.length]);
      }
      i += chain.length;
      if (chain[0].getAttribute("data-break") === "1" && page().length > 0) newPage();
      var sum = 0; chain.forEach(function (b) { sum += b._h; });
      var topSum = sum - chain[0]._pt, atTop = page().length === 0;
      if (atTop ? topSum <= cap + EPS : used + sum <= cap + EPS) { chain.forEach(place); continue; }
      if (!atTop && topSum <= cap + EPS) { newPage(); chain.forEach(place); continue; }
      chain.forEach(place);   // taller than a page: break between its blocks
    }

    out.innerHTML = "";
    var total = pages.length;
    pages.forEach(function (pg, idx) {
      var sheet = make("section", "sheet"), body = make("div", "sheet-body"), foot = make("div", "sheet-foot");
      pg.forEach(function (b) { body.appendChild(b); });
      foot.appendChild(make("span", "f-left", footLeft));
      foot.appendChild(make("span", "f-mid", "Page " + (idx + 1) + " of " + total));
      foot.appendChild(make("span", "f-right", turnOver && idx < total - 1 ? turnText : ""));
      sheet.appendChild(body); sheet.appendChild(foot); out.appendChild(sheet);
    });
    root.classList.remove("measuring");
    root.classList.add("paginated");
    root._sheetW = sheetW;
    fit();
  }

  // Screens narrower than an A4 sheet see the whole page scaled down; print is never scaled.
  function fit() {
    var out = doc.getElementById("sheets"), w = root._sheetW;
    if (!out || !w) return;
    var z = Math.min(1, (root.clientWidth - 16) / w);
    out.style.zoom = z < 1 ? String(z) : "";
  }

  function start() {
    if (started) return; started = true;
    try { paginate(); }
    catch (e) { root.classList.remove("measuring"); root.classList.add("nopaginate"); if (window.console) console.error("Pagination failed", e); }
    window.__paperReady = true;
  }

  var pending = Array.prototype.filter.call(doc.images, function (im) { return !im.complete; });
  var left = pending.length;
  var fonts = (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : Promise.resolve();
  function afterImages() { fonts.then(start, start); }
  if (!left) afterImages();
  else pending.forEach(function (im) {
    function done() { if (--left === 0) afterImages(); }
    im.addEventListener("load", done); im.addEventListener("error", done);
  });
  setTimeout(start, 4000);
  window.addEventListener("resize", fit);
})();
`;

export function renderExamHTML(examData, meta = {}, mode = "paper") {
  const {
    schoolName = "", className = "", programme = "", subject = "", term = "",
    examType = "Exam", durationMinutes = 60, landscape = false,
    schoolLogo = null, examVersion = "",
    optionsLayout = "vertical",
    schoolMotto = "", emblem = "auto",
    idMode = "line", idDigits = 10, idLabel = "",
    turnOver = true, notice = false, noticeText = DEFAULT_NOTICE,
  } = meta;
  const layout = ["vertical", "two", "row"].includes(optionsLayout) ? optionsLayout : "vertical";
  const candidateId = ["line", "boxes", "none"].includes(idMode) ? idMode : "line";
  const idCount = clampIdDigits(idDigits);

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const nl = (t) => esc(t).replace(/\n/g, "<br/>");

  // BECE papers: a line like [FIGURE 1(a): ...] becomes a figure placeholder box; marks print as [n marks].
  // When a real figure (picture or drawing) exists for it, it takes the place of the FIRST placeholder line.
  const rich = (t, fig = "") => {
    if (!bece) return nl(t);
    const out = [];
    let used = false;
    String(t ?? "").split("\n").forEach(line => {
      if (/^\s*\[FIGURE[^\]]*\]\s*$/i.test(line)) {
        if (fig && !used) { out.push(fig); used = true; }
        else out.push(`<div class="diagram-box"><div class="diagram-placeholder">${esc(line.trim())}</div></div>`);
      } else out.push(esc(line) + "<br/>");
    });
    return out.join("").replace(/<br\/>$/, "");
  };
  let curShow = true, curObj = false, curAns = false;     // set per section while it renders (BECE)
  const markText = (n) => bece ? (curShow && !curObj ? `[${n} mark${Number(n) === 1 ? "" : "s"}]` : "") : `[${n}]`;
  const ansLines = (n) => (bece && curAns && !curObj) ? `<div class="ans-lines">${"<i></i>".repeat(Math.max(2, Math.min(9, n)))}</div>` : "";

  const sections = examData.sections || [];
  const bece = examData.style === "bece";
  const profile = bece ? getBeceProfile(subject) : null;
  const sumMarks = (qs) => (qs || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
  const computedTotal = sections.reduce((s, sec) => s + sumMarks(sec.questions), 0);
  const totalMarks = (bece ? sections.reduce((a, sc) => a + answerableMarks(sc), 0) : computedTotal) || computedTotal || Number(examData.totalMarks) || 0;

  // A "block" is the smallest unit the paginator will never split. keep=true
  // glues a block to the one after it (a heading to its first question, a
  // question stem to its first part) so a page never ends on an orphan.
  const blk = (html, cls = "", keep = false) =>
    `<div class="blk${cls ? " " + cls : ""}"${keep ? ' data-keep="1"' : ""}${/\bbrk\b/.test(cls) ? ' data-break="1"' : ""}>${html}</div>`;

  // Priority: teacher-supplied picture (any question) > AI-generated SVG
  // (geometric/graph figures the model can draw precisely) > text placeholder
  // (anything needing real illustration that a human should supply).
  const labels = figureLabels(examData);
  const renderImage = (q, o = q) => {
    const { maxW, maxH } = IMAGE_SIZES[imageSizeKey(o.image)];
    const caption = captionText(o.image, labels.get(o));
    return `<figure class="q-figure al-${imageAlign(o.image)}"><img class="q-fig-img" src="${o.image.src}" alt="${caption ? esc(caption) : `Figure for question ${q.number}`}" style="max-width:min(100%,${maxW}px);max-height:${maxH}px"/>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;
  };
  // A figure belonging to one PART of a question (BECE 1(a), 1(b), ...): the picture, else the drawing, else nothing.
  const partFigureHtml = (q, p) => {
    if (ownerImageOk(p)) return renderImage(q, p);
    const svg = ownerDrawing(p);
    return svg && isSafeGeneratedSVG(svg) ? `<div class="diagram-box diagram-svg-wrap">${svg}</div>` : "";
  };
  const hasImage = (q) => !!(q.image && isSafeImageDataUrl(q.image.src));
  const renderDiagram = (q) => {
    if (hasImage(q) && imagePlacement(q) < 0) return renderImage(q);
    if (hasImage(q)) return ""; // placed under one of its parts instead
    if (!q.diagram || !q.diagram.needed) return "";
    const svg = diagramDrawing(q);
    // Re-checked at print time: a saved exam comes back from the database, so never trust stored markup.
    if (svg && isSafeGeneratedSVG(svg)) return `<div class="diagram-box diagram-svg-wrap">${svg}</div>`;
    if (hasPartFigureLines(q)) return ""; // each part prints its own figure box
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
      `<div class="row sub-row"><span class="lbl">(${esc(sp.label)})</span><span class="txt">${rich(sp.text)}</span><span class="marks">${bece ? "" : `[${sp.marks}]`}</span></div>${ansLines(2)}`
    ).join("")}</div>`;
  };

  const renderPart = (p, figure = "", q = {}) => {
    const pf = partFigureHtml(q, p);
    const inline = bece && figureLines(p.text).length > 0;
    return `
      <div class="row has-parts part-wrap"><span></span>
        <div class="q-body"><div class="part">
          <div class="row part-row"><span class="lbl">(${esc(p.label)})</span><span class="txt">${rich(p.text, inline ? pf : "")}</span><span class="marks">${markText(p.marks)}</span></div>
          ${inline ? "" : pf}
          ${renderSubparts(p.subparts)}
          ${(p.subparts && p.subparts.length) ? "" : ansLines(Math.round((Number(p.marks) || 1) * 1.5))}
          ${figure}
        </div></div>
      </div>`;
  };

  /** One question -> one or more blocks (a multi-part question may break between its parts). */
  const renderQuestionBlocks = (q, keepNext) => {
    const parts = Array.isArray(q.parts) ? q.parts : [];
    const hasParts = parts.length > 0;
    const qFigure = renderDiagram(q);
    const qInline = bece && figureLines(q.text).length > 0;
    const stem = `
    <div class="question${bece && hasParts && !String(q.text || "").trim() && !hasImage(q) && !(q.diagram && q.diagram.needed) ? " q-empty" : ""}" data-qnum="${q.number}">
      <div class="row q-row${hasParts ? " has-parts" : ""}">
        <span class="lbl q-num">${q.number}.</span>
        <div class="q-body">
          <div class="q-text">${rich(q.text, qInline ? qFigure : "")}</div>
          ${qInline && qFigure ? "" : qFigure}
          ${renderOptions(q)}
        </div>
        ${hasParts ? "" : `<span class="marks">${markText(q.marks)}</span>`}
      </div>
    </div>`;
    if (!hasParts) return [blk(stem, "q", keepNext)];
    return [
      blk(stem, "q q-stem", true),
      ...parts.map((p, i) => blk(renderPart(p, hasImage(q) && imagePlacement(q) === i ? renderImage(q) : "", q), `q-part${i === parts.length - 1 ? " q-last" : ""}`, keepNext && i === parts.length - 1)),
    ];
  };

  const SAMPLE_OPTIONS = ["Green", "Red", "Orange", "Purple"];
  const renderBeceSectionBlocks = (s, idx) => {
    curShow = s.showPartMarks !== false; curObj = s.type === "objective"; curAns = !!profile.answerInPaper;
    const qs = s.questions || [];
    const prev = sections[idx - 1], next = sections[idx + 1];
    const out = [];
    if (!prev || prev.paper !== s.paper) {
      const pNo = s.paper === 1 ? 1 : 2;
      const pf = pNo === 1 ? profile.paper1 : profile.paper2;
      const pMarks = sections.filter(x => x.paper === s.paper).reduce((a, x) => a + answerableMarks(x), 0);
      const intro = pNo === 1 ? BECE_OBJECTIVE_INSTRUCTIONS : (profile.paper2.intro || []);
      const sample = pNo === 1 ? `
        <div class="p1-example">
          <div>Which of the following is a primary colour?</div>
          ${SAMPLE_OPTIONS.map((o, i) => `<div class="p1-opt"><span>${OPT_LETTERS[i]}.</span> ${o}</div>`).join("")}
          <div>The correct answer is <b>Red</b> which is lettered <b>B</b> and therefore answer space <b>B</b> would be shaded.</div>
          <div class="p1-bubbles"><span>A</span><span class="on">B</span><span>C</span><span>D</span></div>
        </div>
        <p class="p1-now">Now answer the following questions.</p>` : "";
      out.push(blk(`
        <div class="paper-banner">
          <div class="pb-top"><span></span><div class="pb-title">PAPER ${pNo}<div class="pb-sub">${esc(pf.name)}</div><div class="pb-marks">[${pMarks} marks]</div></div><span class="pb-time">${esc(minutesLabel(pf.minutes))}</span></div>
          <div class="pb-intro">${intro.map(t => `<p>${esc(t)}</p>`).join("")}</div>
          ${sample}
        </div>`, `pbanner${(pNo === 1 || !prev) ? " brk" : ""}`, true));
    }
    if (s.heading || (s.rubric && s.type !== "objective")) {
      const secMarks = answerableMarks(s);
      out.push(blk(`
        <div class="bece-sec">
          ${s.heading ? `<div class="bs-head">${esc(s.heading)}</div>` : ""}
          ${(s.sub || s.theme) ? `<div class="bs-sub">${esc(s.sub || s.theme)}</div>` : ""}
          ${(s.heading && secMarks && s.type !== "objective") ? `<div class="bs-marks">[${secMarks} marks]</div>` : ""}
          ${s.rubric ? `<div class="bs-rubric">${esc(s.rubric)}</div>` : ""}
        </div>`, "sec", qs.length > 0));
    }
    qs.forEach(q => out.push(...renderQuestionBlocks(q, false)));
    if (!next || next.paper !== s.paper) {
      out.push(blk(`<div class="end-mark"><span>${s.paper === 1 ? "END OF PAPER" : "END OF ESSAY TEST"}</span></div>`, "endmark"));
    }
    return out;
  };

  const renderSectionBlocks = (s, idx) => {
    if (bece) return renderBeceSectionBlocks(s, idx);
    const secMarks = sumMarks(s.questions);
    const qs = s.questions || [];
    const header = blk(`
      <div class="section-header">
        <div class="section-line">
          <span class="section-title">${esc(s.label)}</span>
          ${secMarks ? `<span class="section-marks">${secMarks} marks</span>` : ""}
        </div>
        ${s.instructions ? `<div class="section-instructions">${esc(s.instructions)}</div>` : ""}
      </div>`, "sec", qs.length > 0);
    return [header, ...qs.flatMap(q => renderQuestionBlocks(q, false))];
  };

  // ── Letterhead (shared by the question paper and the marking scheme) ──
  // Priority: uploaded logo > generated crest (unless switched off) > nothing.
  const crest = emblem !== "none" ? schoolCrestSVG(schoolName) : "";
  const logoMarkup = schoolLogo
    ? `<img src="${schoolLogo}" alt="School logo" class="school-logo"/>`
    : (crest ? `<div class="school-logo school-seal">${crest}</div>` : "");

  const letterhead = (titleText) => `
      <div class="lh-row">
        <div class="lh-side">${logoMarkup}</div>
        <div class="lh-text">
          <div class="school-name">${esc(schoolName || "________________________________")}</div>
          ${schoolMotto ? `<div class="school-motto">${esc(schoolMotto)}</div>` : ""}
        </div>
        <div class="lh-side"></div>
      </div>
      <div class="lh-rule"></div>
      <div class="exam-title">${titleText}</div>`;

  const paperTitle = bece ? cleanBeceTitle(examData.title, examType) : examData.title;
  const titleText = `${esc(paperTitle || examType.toUpperCase())}${examVersion ? ` <span class="exam-version">VERSION ${esc(examVersion)}</span>` : ""}`;

  const metaCell = (label, value) =>
    `<td><div class="meta-label">${label}</div><div class="meta-value">${esc(value) || "&nbsp;"}</div></td>`;

  const idLabelText = idLabel || (candidateId === "boxes" ? "Index Number" : "Index No.");
  const scoreBox = `<div class="score-box"><span>Score</span><b>/ ${totalMarks || ""}</b></div>`;
  const candidateBlock = candidateId === "boxes" ? `
      <div class="candidate">
        <div class="cand-row">
          <div class="cand-field grow"><span>Candidate's Name:</span><i></i></div>
          <div class="cand-field w-date"><span>Date:</span><i></i></div>
          ${scoreBox}
        </div>
        <div class="cand-row id-row">
          <span class="id-label">${esc(idLabelText)}</span>
          <div class="idcells" role="presentation">${"<i></i>".repeat(idCount)}</div>
        </div>
      </div>` : `
      <div class="candidate">
        <div class="cand-row">
          <div class="cand-field grow"><span>Name:</span><i></i></div>
          ${candidateId === "line" ? `<div class="cand-field w-index"><span>${esc(idLabelText)}:</span><i></i></div>` : ""}
          <div class="cand-field w-date"><span>Date:</span><i></i></div>
          ${scoreBox}
        </div>
      </div>`;

  // BECE papers open with a COVER PAGE that fills the whole sheet (letterhead at the top,
  // the subject centred in the free space, candidate details and instructions at the foot),
  // and Paper 2 / Paper 1 then start on page 2, like a real exam booklet.
  const coverSubject = bece ? `
      <div class="cv-subject">
        <div class="cv-rule"></div>
        <div class="cv-sub-name">${esc(subject || "")}</div>
        <div class="cv-sub-line">${esc([classWithProgramme(className, programme), term].filter(Boolean).join("  |  "))}</div>
        ${profile ? `<div class="cv-sub-papers">${esc(profile.paper2.name)} and ${esc(profile.paper1.name)}</div>` : ""}
        <div class="cv-rule"></div>
      </div>` : "";

  const headerBlock = blk(`
    <div class="paper-header${bece ? " cover-page" : ""}">
      ${letterhead(titleText)}
      ${notice ? `<div class="notice">${esc(noticeText || DEFAULT_NOTICE)}</div>` : ""}
      ${coverSubject}
      <table class="meta-grid">
        <tr>
          ${metaCell("Subject", subject)}
          ${metaCell("Class", classWithProgramme(className, programme))}
          ${metaCell(...termCell(term))}
          ${metaCell("Duration", `${durationMinutes} mins`)}
          ${totalMarks ? metaCell("Total Marks", totalMarks) : ""}
        </tr>
      </table>
      ${candidateBlock}
      ${(examData.instructions || []).length ? `
      <div class="instructions">
        <div class="instr-title">Instructions to Candidates</div>
        <ol>${examData.instructions.map(i => `<li>${esc(i)}</li>`).join("")}</ol>
      </div>` : ""}
    </div>`, bece ? "hdr cover" : "hdr");

  const renderAnswerKeyBlocks = () => {
    const key = examData.answerKey || [];
    const hasAnyMarkingGuide = sections.some(s => (s.questions || []).some(q => q.markingGuide && q.markingGuide.trim()));
    const keyHeader = blk(`
      <div class="paper-header answer-header">
        ${letterhead(`MARKING SCHEME${examVersion ? ` <span class="exam-version">VERSION ${esc(examVersion)}</span>` : ""}`)}
        <table class="meta-grid">
          <tr>
            ${metaCell("Subject", subject)}
            ${metaCell("Class", classWithProgramme(className, programme))}
            ${metaCell(...termCell(term))}
            ${totalMarks ? metaCell("Total Marks", totalMarks) : ""}
          </tr>
        </table>
      </div>`, "hdr");
    if (!key.length && !hasAnyMarkingGuide) {
      return [keyHeader, blk(`
        <div class="answer-page">
          <h2>MARKING SCHEME</h2>
          <p class="no-marking-scheme">This paper was generated in <b>Questions Only</b> mode - no answer key or marking
          scheme was requested. Regenerate with "Questions + Marking Scheme" enabled to get one.</p>
        </div>`, "ak")];
    }
    const out = [keyHeader];
    if (key.length) {
      out.push(blk(`<div class="answer-page"><h2>${bece ? "PAPER 1: OBJECTIVE TEST, ANSWER KEY" : "SECTION A: ANSWER KEY"}</h2>
        <div class="key-grid">
          ${key.map(k => `<div class="key-cell"><b>${k.number}.</b> ${esc(k.answer)}</div>`).join("")}
        </div></div>`, "ak"));
    }
    const guideTable = (text) => {
      const rows = String(text || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
        const p = l.split("::").map(x => x.trim());
        return p.length >= 3 ? { ref: p[0], sol: p[1], mk: p.slice(2).join(" :: ") } : { ref: "", sol: l, mk: "" };
      });
      const head = `<thead><tr><th>QUESTION NO.</th><th>${profile.scheme === "table" ? "SOLUTION" : "EXPECTED ANSWERS"}</th><th>MARKS</th></tr></thead>`;
      const chunks = [];
      for (let i = 0; i < rows.length; i += 12) chunks.push(rows.slice(i, i + 12));
      return chunks.map(ch => `<table class="bece-scheme">${head}<tbody>${ch.map(r => {
        const up = r.ref.toUpperCase();
        const kind = up === "TOTAL" ? "tot" : up === "NOTE" ? "note" : "";
        return `<tr class="${kind}"><td>${kind ? "" : nl(r.ref)}</td><td>${up === "TOTAL" ? "<b>TOTAL</b>" : nl(r.sol)}</td><td>${nl(r.mk)}</td></tr>`;
      }).join("")}</tbody></table>`);
    };
    if (bece) {
      const rubricLines = (profile.paper2.intro || []).slice(0, 3);
      out.push(blk(`<div class="answer-page"><h2>PAPER 2: ESSAY, MARKING SCHEME</h2><p class="bece-rubric"><b>RUBRICS:</b> ${esc(rubricLines.join(" "))}</p></div>`, "ak", true));
    } else {
      out.push(blk(`<div class="answer-page"><h2>MARKING SCHEME - SECTIONS B &amp; C</h2></div>`, "ak", true));
    }
    sections.filter(s => s.type !== "objective").forEach(s => {
      const qs = s.questions || [];
      const pick = bece && s.answerAny ? `<p class="bece-rubric">Candidates answer any ${s.answerAny} of the ${qs.length || s.questionCount} questions in this section. Each question carries ${(qs[0] && qs[0].marks) || s.marksPerQuestion} marks.</p>` : "";
      out.push(blk(`<div class="answer-page"><h3>${esc(bece && s.heading ? `${s.heading}${s.sub || s.theme ? `: ${s.sub || s.theme}` : ""}` : s.label)}</h3>${pick}</div>`, "ak", qs.length > 0));
      qs.forEach(q => {
        const head = `<div class="answer-page"><div class="mark-block"><div class="mark-qnum"><span>Question ${q.number}</span><span class="marks">${bece ? `[${q.marks} marks]` : `[${q.marks}]`}</span></div>`;
        if (bece && /::/.test(q.markingGuide || "")) {
          const tabs = guideTable(q.markingGuide);
          tabs.forEach((t, ti) => out.push(blk(`${ti === 0 ? head : `<div class="answer-page"><div class="mark-block">`}${t}</div></div>`, "ak")));
        } else {
          out.push(blk(`${head}<div class="mark-guide">${nl(q.markingGuide)}</div></div></div>`, "ak"));
        }
      });
    });
    return out;
  };

  const blocks = mode === "answerKey"
    ? renderAnswerKeyBlocks()
    : [headerBlock, ...sections.flatMap(renderSectionBlocks), ...(bece ? [] : [blk(`<div class="end-mark"><span>END OF PAPER</span></div>`, "endmark")])];

  const footerLeft = [schoolName, subject, examVersion ? `Version ${examVersion}` : ""].filter(Boolean).join("  |  ");
  const showTurnOver = mode === "paper" && turnOver !== false;
  const PW = landscape ? 297 : 210, PH = landscape ? 210 : 297;

  return `<!DOCTYPE html>
<html data-turn-over="${showTurnOver ? "1" : "0"}"${bece ? ' data-bece="1"' : ""}${landscape ? ' data-landscape="1"' : ""}>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc((bece ? cleanBeceTitle(examData.title, examType) : examData.title) || examType)} - ${esc(subject)}</title>
<style>
  :root{ --pw:${PW}mm; --ph:${PH}mm; --mx:16mm; --mt:14mm; --mb:22mm; --bw:calc(var(--pw) - 2 * var(--mx)); --bh:calc(var(--ph) - var(--mt) - var(--mb)); color-scheme: light only; }
  * { box-sizing: border-box; }
  html,body{ margin:0; padding:0; background:#E9EBEF; font-family:"Times New Roman",Times,"Liberation Serif",Georgia,serif; color:#111; }

  /* ── Source blocks + A4 sheets ───────────────────────────── */
  #src{ width:var(--bw); max-width:100%; margin:24px auto; background:#fff; padding:14mm 16mm; font-size:11.5pt; line-height:1.5; }
  .measuring #src{ position:absolute; left:0; top:0; margin:0; padding:0; visibility:hidden; width:var(--bw); max-width:none; }
  .paginated #src{ display:none; }
  #sheets{ padding:8px 0 24px; }
  .sheet{ position:relative; width:var(--pw); height:var(--ph); margin:0 auto 16px; padding:var(--mt) var(--mx) 0; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.16); font-size:11.5pt; line-height:1.5; overflow:hidden; }
  .sheet-body{ width:var(--bw); height:var(--bh); }
  .sheet.probe{ position:absolute; left:0; top:0; visibility:hidden; margin:0; }
  .sheet-foot{ position:absolute; left:var(--mx); right:var(--mx); bottom:9mm; display:grid; grid-template-columns:1fr auto 1fr; align-items:baseline; column-gap:10px; border-top:.75pt solid #777; padding-top:4px; font-size:8.5pt; color:#444; line-height:1.2; }
  .sheet-foot .f-left{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sheet-foot .f-mid{ text-align:center; white-space:nowrap; }
  .sheet-foot .f-right{ text-align:right; font-style:italic; font-weight:700; font-size:10pt; color:#111; white-space:nowrap; }
  html:not(.paginated):not(.nopaginate) #sheets:empty{ display:none; }
  .blk{ display:flow-root; }
  .blk.at-top{ padding-top:0 !important; }

  /* ── Letterhead ─────────────────────────────────────────── */
  .paper-header{ margin-bottom:6px; }
  .lh-row{ display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .lh-side{ width:92px; flex-shrink:0; display:flex; align-items:center; justify-content:flex-start; }
  .lh-text{ flex:1; text-align:center; }
  .school-logo{ width:92px; height:92px; object-fit:contain; display:block; }
  .school-seal svg{ width:100%; height:100%; display:block; }
  .school-name{ font-size:21pt; font-weight:700; text-transform:uppercase; letter-spacing:.06em; line-height:1.2; }
  .school-motto{ margin-top:3px; font-size:10.5pt; font-style:italic; letter-spacing:.03em; color:#222; }
  .lh-rule{ margin:10px 0 0; border-top:3px solid #111; border-bottom:1px solid #111; height:5px; }
  .exam-title{ text-align:center; font-size:14pt; font-weight:700; text-transform:uppercase; letter-spacing:.12em; margin:12px 0 10px; }
  .exam-version{ font-weight:600; letter-spacing:.06em; border:1px solid #111; padding:1px 7px; margin-left:8px; font-size:10pt; vertical-align:middle; }
  .notice{ margin:0 0 10px; border:1.5px solid #111; text-align:center; font-weight:700; text-transform:uppercase; letter-spacing:.09em; font-size:9.5pt; padding:5px 10px; }

  .meta-grid{ width:100%; border-collapse:collapse; border:1.5px solid #111; table-layout:fixed; }
  .meta-grid td{ border-right:1px solid #111; padding:5px 9px 6px; vertical-align:top; }
  .meta-grid td:last-child{ border-right:none; }
  .meta-label{ font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#444; line-height:1.3; }
  .meta-value{ font-size:11pt; font-weight:700; line-height:1.35; }

  .candidate{ margin-top:16px; font-size:11pt; }
  .cand-row{ display:flex; align-items:flex-end; gap:18px; }
  .cand-row + .cand-row{ margin-top:12px; }
  .cand-field{ display:flex; align-items:flex-end; gap:6px; }
  .cand-field.grow{ flex:1; }
  .cand-field.w-index{ width:30%; }
  .cand-field.w-date{ width:20%; }
  .cand-field span{ white-space:nowrap; font-weight:700; }
  .cand-field i{ flex:1; border-bottom:1px solid #111; height:1.1em; }
  .score-box{ border:1.5px solid #111; padding:3px 12px 4px; min-width:84px; text-align:center; line-height:1.25; }
  .score-box span{ display:block; font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#444; }
  .score-box b{ font-size:11pt; }
  .id-row{ align-items:center; gap:12px; }
  .id-label{ font-weight:700; white-space:nowrap; }
  .idcells{ display:inline-flex; }
  .idcells i{ display:block; width:8.4mm; height:9.6mm; border:1.4px solid #111; margin-left:-1.4px; background:#fff; }
  .idcells i:first-child{ margin-left:0; }

  .instructions{ margin-top:16px; border:1px solid #111; padding:8px 14px 8px; font-size:10.5pt; line-height:1.55; }
  .instr-title{ font-weight:700; text-transform:uppercase; letter-spacing:.1em; font-size:9.5pt; border-bottom:1px solid #999; padding-bottom:3px; margin-bottom:4px; }
  .instructions ol{ margin:4px 0 0 18px; padding:0; }
  .instructions li{ margin:1px 0; }

  /* ── BECE cover page: fills the sheet ───────────────────── */
  .blk.cover .cover-page{ min-height:calc(var(--bh) - 3px); display:flex; flex-direction:column; margin-bottom:0; }
  .cover-page .school-name{ font-size:24pt; }
  .cover-page .exam-title{ font-size:15pt; margin:14px 0 12px; }
  .cover-page .notice{ margin:2px 0 6px; font-size:10pt; padding:7px 12px; }
  .cv-subject{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:16px 0; gap:10px; }
  .cv-rule{ width:55%; border-top:2.5px solid #111; border-bottom:.75pt solid #111; height:5px; }
  .cv-sub-name{ font-size:30pt; font-weight:700; text-transform:uppercase; letter-spacing:.08em; line-height:1.2; margin-top:8px; }
  .cv-sub-line{ font-size:13pt; letter-spacing:.06em; text-transform:uppercase; color:#222; }
  .cv-sub-papers{ font-size:11pt; font-style:italic; color:#333; margin-bottom:8px; }
  .cover-page .meta-value{ font-size:12pt; }
  .cover-page .candidate{ margin-top:26px; font-size:12pt; }
  .cover-page .cand-row + .cand-row{ margin-top:20px; }
  .cover-page .idcells i{ width:9.4mm; height:11mm; }
  .cover-page .instructions{ margin-top:26px; font-size:11pt; line-height:1.6; padding:10px 16px 10px; }
  /* Landscape sheets are short: tighten the cover so it still fits exactly on one page. */
  html[data-landscape="1"] .cover-page .school-name{ font-size:20pt; }
  html[data-landscape="1"] .cover-page .school-logo{ width:70px; height:70px; }
  html[data-landscape="1"] .cover-page .exam-title{ margin:8px 0 8px; }
  html[data-landscape="1"] .cv-subject{ padding:4px 0; gap:4px; }
  html[data-landscape="1"] .cv-sub-name{ font-size:22pt; margin-top:2px; }
  html[data-landscape="1"] .cv-sub-line{ font-size:11pt; }
  html[data-landscape="1"] .cv-sub-papers, html[data-landscape="1"] .cover-page .meta-grid{ display:none; }
  html[data-landscape="1"] .cover-page .candidate{ margin-top:12px; }
  html[data-landscape="1"] .cover-page .cand-row + .cand-row{ margin-top:12px; }
  html[data-landscape="1"] .cover-page .instructions{ margin-top:12px; line-height:1.4; font-size:10.5pt; }

  /* ── Sections ───────────────────────────────────────────── */
  .blk.sec{ padding-top:22px; padding-bottom:14px; }
  .section-header{ background:#EDEEF1; border-top:1.5px solid #111; border-bottom:1.5px solid #111; padding:6px 10px 6px; }
  .section-line{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .section-title{ font-size:12pt; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .section-marks{ font-size:10pt; font-weight:700; white-space:nowrap; }
  .section-instructions{ font-size:10.5pt; font-style:italic; color:#222; margin-top:2px; line-height:1.45; }

  /* ── Questions ──────────────────────────────────────────── */
  .blk.q{ padding-bottom:16px; }
  .blk.q-stem{ padding-bottom:4px; }
  .blk.q-part{ padding-bottom:6px; }
  .blk.q-last{ padding-bottom:16px; }
  .question{ font-size:11.5pt; line-height:1.5; }
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

  .part-wrap{ font-size:11.5pt; line-height:1.5; }
  .part{ margin-top:2px; }
  .part-row{ grid-template-columns:2.3em 1fr 3.4em; }
  .subparts{ margin:4px 0 0 2.3em; }
  .sub-row{ grid-template-columns:2.3em 1fr 3.4em; margin-top:3px; font-size:11.5pt; }

  .diagram-box{ margin:10px 0; }
  .diagram-placeholder{ border:1.5px dashed #888; padding:18px; font-size:10.5pt; color:#444; text-align:center; background:#F7F7F8; font-style:italic; }
  .q-figure{ margin:10px 0; text-align:center; }
  .q-figure.al-left{ text-align:left; } .q-figure.al-left .q-fig-img{ margin-left:0; }
  .q-figure.al-right{ text-align:right; } .q-figure.al-right .q-fig-img{ margin-right:0; }
  .q-fig-img{ display:block; margin:0 auto; width:auto; height:auto; border:1px solid #BBB; }
  .q-figure figcaption{ margin-top:4px; font-size:9.5pt; font-style:italic; color:#333; }
  .diagram-svg-wrap{ display:flex; justify-content:center; }
  .diagram-svg-wrap svg{ max-width:min(100%,420px); max-height:260px; height:auto; }

  .blk.endmark{ padding-top:22px; }
  .end-mark{ text-align:center; }
  .end-mark span{ display:inline-block; font-weight:700; letter-spacing:.2em; font-size:11pt; border-top:1px solid #111; border-bottom:1px solid #111; padding:3px 26px; }

  /* ── Marking scheme ─────────────────────────────────────── */
  .answer-page h2{ font-size:12pt; text-transform:uppercase; letter-spacing:.06em; background:#EDEEF1; border-top:1.5px solid #111; border-bottom:1.5px solid #111; padding:6px 10px; margin:22px 0 12px; }
  .answer-page h3{ font-size:11.5pt; margin:14px 0 2px; text-decoration:underline; }
  .no-marking-scheme{ font-size:11.5pt; color:#333; line-height:1.6; background:#F7F7F8; border:1px dashed #888; padding:14px 16px; margin-top:10px; }
  .key-grid{ display:grid; grid-template-columns:repeat(10,1fr); gap:0; font-size:11pt; border-left:1px solid #111; border-top:1px solid #111; }
  .key-cell{ padding:5px 6px; text-align:center; border-right:1px solid #111; border-bottom:1px solid #111; }
  .mark-block{ margin-top:10px; font-size:11.5pt; }
  .mark-qnum{ font-weight:700; display:flex; justify-content:space-between; border-bottom:1px solid #BBB; padding-bottom:2px; }
  .mark-guide{ margin-top:5px; line-height:1.55; color:#111; }
  .at-top .answer-page h2, .at-top .answer-page h3{ margin-top:0; }
  /* ── BECE style ── */
  html[data-bece="1"] .row{ grid-template-columns:2.3em 1fr 5.6em; }
  html[data-bece="1"] .row.has-parts{ grid-template-columns:2.3em 1fr; }
  html[data-bece="1"] .marks{ font-weight:400; }
  html[data-bece="1"] .question.q-empty{ margin-bottom:-1.7em; }
  html[data-bece="1"] .question.q-empty .q-text{ display:none; }
  .paper-banner{ margin:14px 0 8px; font-size:11pt; }
  .pb-top{ display:grid; grid-template-columns:1fr auto 1fr; align-items:start; }
  .pb-title{ text-align:center; font-variant:small-caps; font-weight:700; font-size:12.5pt; line-height:1.35; }
  .pb-sub{ font-weight:400; font-size:11pt; letter-spacing:.04em; }
  .pb-marks{ font-weight:400; font-size:11pt; font-variant:normal; }
  .pb-time{ text-align:right; font-size:11pt; }
  .pb-intro{ margin-top:8px; font-style:italic; line-height:1.5; }
  .pb-intro p{ margin:3px 0; }
  .p1-example{ margin:10px 0 6px 12px; line-height:1.5; font-size:10.5pt; }
  .p1-opt{ margin-left:16px; } .p1-opt span{ display:inline-block; width:1.6em; }
  .p1-bubbles{ display:flex; gap:14px; justify-content:center; margin:6px 0; }
  .p1-bubbles span{ border:1px solid #111; width:34px; text-align:center; font-size:9.5pt; }
  .p1-bubbles span.on{ background:#111; color:#fff; }
  .p1-now{ font-style:italic; margin:8px 0 0; }
  .bece-sec{ text-align:center; margin:14px 0 6px; }
  .bs-head{ font-variant:small-caps; font-weight:700; font-size:12pt; letter-spacing:.03em; }
  .bs-sub{ font-variant:small-caps; font-size:11pt; }
  .bs-marks{ font-size:11pt; }
  .bs-rubric{ font-style:italic; font-size:11pt; margin-top:2px; }
  .ans-lines{ margin:4px 0 6px 2.3em; } .ans-lines i{ display:block; border-bottom:1px dotted #444; height:1.55em; }
  .bece-rubric{ font-size:11pt; line-height:1.5; margin:6px 0; }
  table.bece-scheme{ width:100%; border-collapse:collapse; font-size:10.5pt; margin-top:6px; }
  table.bece-scheme th{ border:1px solid #111; background:#EDEEF1; padding:5px 8px; font-size:10pt; letter-spacing:.04em; }
  table.bece-scheme th:first-child{ width:16%; } table.bece-scheme th:last-child{ width:26%; }
  table.bece-scheme td{ border:1px solid #111; padding:5px 8px; vertical-align:top; line-height:1.45; }
  table.bece-scheme tr.tot td{ background:#F7F7F8; text-align:right; } table.bece-scheme tr.tot td:nth-child(2){ text-align:left; }
  table.bece-scheme tr.note td{ font-style:italic; }

  /* Fallback if the paginator ever fails: plain flowing page, browser-numbered. */
  .nopaginate #sheets{ display:none; }

  /* ── PRINT: sheets ARE the pages; dark-mode-safe, solid black ──── */
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 0; }
  @media print {
    html { color-scheme: light only !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { background:#fff !important; color:#000 !important; }
    #sheets{ zoom:1 !important; padding:0 !important; }
    .sheet{ margin:0 !important; box-shadow:none !important; height:calc(var(--ph) - 0.5mm); break-after:page; page-break-after:always; }
    .sheet:last-child{ break-after:auto; page-break-after:auto; }
    .nopaginate #src{ margin:0 auto; box-shadow:none; }
    .blk{ break-inside:avoid; }
  }
</style>
</head>
<body>
  <div id="src">${blocks.join("")}</div>
  <div id="sheets"></div>
  <div id="foot-left" hidden>${esc(footerLeft)}</div>
  <div id="foot-turn" hidden>Turn over</div>
  <script>${PAGINATE_SCRIPT}</script>
</body>
</html>`;
}

/**
 * Strict allowlist check on any SVG before it is inlined into the printable
 * page. Only drawing elements and presentation attributes pass: no script,
 * foreignObject, style blocks, event handlers, external references or
 * anything the parser can't account for. Anything that fails is treated as
 * "not drawable" and falls back to the text placeholder.
 */
const SVG_TAGS = new Set(["svg", "g", "defs", "line", "rect", "circle", "ellipse", "polyline", "polygon", "path", "text", "tspan", "textpath", "title", "desc", "pattern", "marker"]);
const SVG_ATTRS = new Set([
  "xmlns", "xmlns:xlink", "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "fill-opacity", "opacity", "fill-rule",
  "transform", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "dx", "dy", "paint-order",
  "letter-spacing", "textlength", "lengthadjust", "startoffset", "id", "role", "aria-label", "preserveaspectratio", "patternunits", "orient",
  "markerwidth", "markerheight", "refx", "refy", "marker-end", "marker-start", "href", "xlink:href",
]);
export function isSafeGeneratedSVG(svg) {
  if (typeof svg !== "string" || svg.length > 20000) return false;
  const trimmed = svg.trim();
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return false;
  if (/javascript:|data:|<!|<\?|&#x?0*(?:106|74|6a)/i.test(trimmed)) return false;
  const tagRe = /<\s*(\/?)\s*([A-Za-z][\w:.-]*)([^<>]*)>/g;
  const leftover = trimmed.replace(tagRe, "");
  if (leftover.includes("<")) return false; // a "<" the tag scanner could not account for
  let m;
  while ((m = tagRe.exec(trimmed))) {
    const [, closing, rawName, rawAttrs] = m;
    if (!SVG_TAGS.has(rawName.toLowerCase())) return false;
    if (closing) continue;
    const attrRe = /([^\s=/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    const rest = rawAttrs.replace(attrRe, (full, name, v1, v2) => {
      const n = name.toLowerCase(), v = (v1 ?? v2 ?? "").trim();
      if (!SVG_ATTRS.has(n)) { a = false; return ""; }
      if ((n === "href" || n === "xlink:href") && !v.startsWith("#")) { a = false; return ""; }
      if (n === "xmlns" || n === "xmlns:xlink") {
        if (v !== "http://www.w3.org/2000/svg" && v !== "http://www.w3.org/1999/xlink") a = false;
        return "";
      }
      if (/url\(\s*(?!#)/i.test(v) || /^\s*(?:https?:|\/\/)/i.test(v)) { a = false; return ""; }
      return "";
    });
    if (a === false) return false;
    if (rest.replace(/[\s/]/g, "")) return false; // unquoted or malformed attribute
  }
  return true;
}

/**
 * Turns a question's diagram request into something printable, in place.
 * A template + params is drawn by code (accurate by construction); a raw SVG
 * (older saved exams) must pass the allowlist; anything else becomes the
 * text placeholder. The normalised params are kept so the teacher can edit.
 */
export function prepareDiagram(q) {
  const d = q?.diagram;
  if (!d || typeof d !== "object") return;
  if (d.template) {
    const r = renderDiagramTemplate(String(d.template), d.params);
    if (r && isSafeGeneratedSVG(r.svg)) { d.svg = r.svg; d.params = r.params; d.generatable = true; return; }
    d.template = null; d.params = null; d.svg = null; d.generatable = false;
    return;
  }
  if (d.svg && !isSafeGeneratedSVG(d.svg)) { d.generatable = false; d.svg = null; }
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
  // Draw template diagrams, and sanitise anything else - untrusted model output never reaches print.
  (examData.sections || []).forEach(s => (s.questions || []).forEach(q => { prepareDiagram(q); }));
  return { ok: errors.length === 0, errors };
}
