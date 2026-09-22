/**
 * examPrompt.js (Cloudflare Functions copy)
 * ─────────────────────────────────────────────────────────────────
 * This is buildSectionPrompt(), duplicated verbatim from
 * src/examTemplate.js — NOT imported across the functions/ ↔ src/
 * boundary, for the same reason moderation.js is duplicated (see that
 * file's header): different bundlers resolve cross-directory relative
 * imports differently, and a silent build failure in production is far
 * worse than one clearly-commented duplicated function.
 *
 * If you edit the prompt/schema in src/examTemplate.js, mirror the
 * change here too. They must stay byte-identical.
 * ─────────────────────────────────────────────────────────────────
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
    : (pastedSyllabus ? "(see pasted syllabus below)" : "(no specific topics supplied — use standard scope for the class/subject)");

  const sectionMarks = (Number(section.questionCount) || 0) * (Number(section.marksPerQuestion) || 0);

  const paperLevelFields = isFirstSection ? `
  "title": string,                     // e.g. "MID-TERM EXAMINATION" — only on the first section
  "instructions": string[],            // top-of-paper instructions — only on the first section` : "";

  const markingGuideFieldDoc = includeMarkingScheme
    ? `"markingGuide": string           // REQUIRED, professional marking scheme — see MARKING SCHEME RULES below for the exact format by question type`
    : `"markingGuide": ""               // marking scheme was NOT requested for this paper — always return an empty string here, do not write any marking guidance`;

  const markingRulesBlock = includeMarkingScheme ? `
MARKING SCHEME RULES (GES/WAEC convention — "markingGuide" must follow the format for this section's type)
${section.type === "objective" ? `- Objective: one line stating the correct option's letter, then a brief clause on why it's correct AND a brief clause on why each of the other three options is a plausible-but-wrong distractor (e.g. "B is correct — mitochondria release energy via respiration. A is wrong because...; C confuses...; D confuses...").` : ""}${section.type === "structured" ? `- Structured: a POINT-BY-POINT breakdown that allocates every mark to a specific idea, step, or fact — never a vague paragraph. Format each part as a short list, e.g. "(a) [1] correct formula stated; [1] correct substitution; [1] correct final answer with unit." State any acceptable alternative methods/answers, and note common wrong answers that must NOT receive credit even if superficially similar.` : ""}${section.type === "essay" ? `- Essay: a BANDED RUBRIC with 3 levels matching WAEC/GES essay-marking convention, each with a mark range and a one-sentence descriptor of what that band's response looks like, e.g. "Level 1 (1-${Math.ceil(section.marksPerQuestion*0.3)}): superficial response, little relevant content. Level 2 (${Math.ceil(section.marksPerQuestion*0.3)+1}-${Math.ceil(section.marksPerQuestion*0.7)}): relevant content with some development, limited critical engagement. Level 3 (${Math.ceil(section.marksPerQuestion*0.7)+1}-${section.marksPerQuestion}): well-developed, critically engaged, addresses the question fully." Then list 3-5 specific content points a strong answer would include.` : ""}
- Every marking guide must be specific enough that a different teacher, reading only the marking guide, could mark a pupil's script consistently — vague guidance like "award marks for a good answer" is not acceptable.` : `
MARKING SCHEME RULES
- The teacher requested QUESTIONS ONLY for this paper — do not write a marking guide, model answer, or point allocation of any kind. Leave "markingGuide" as an empty string "" for every question. Still set "marks" on each question/part normally (the mark allocation itself is part of the question paper, not the marking scheme).`;

  return `You are an expert examiner writing ONE SECTION of a ${examType} for a Ghana Education Service (GES/NaCCA) school. Other sections are generated separately — write ONLY this section's questions, nothing else.

Return ONLY valid JSON — no markdown fences, no commentary — matching exactly this shape:

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
          "generatable": boolean,      // true ONLY if this is a clean geometric/graph/number-line/coordinate-plane figure you can draw precisely in SVG (e.g. a triangle with labelled sides, a bar chart, a number line, a coordinate grid). false for anything needing real-world illustration (a labelled diagram of a plant cell, a map, a photo-realistic scene) — those get a text placeholder for the teacher to fill in.
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
  Diagrams: ${allowDiagrams ? "allowed — see the diagram schema notes above; only set generatable=true when you can actually draw it precisely" : "do not request diagrams (set needed=false on every question)"}

THIS SECTION MUST HAVE EXACTLY ${section.questionCount} question(s), ${section.marksPerQuestion} mark(s) each (${sectionMarks} marks total for this section).

STRICT RULES
1. Formal exam register, no chatty tone, no emoji.
2. Number questions 1..${section.questionCount} within this section only.
3. Use "a","b","c" for parts and "i","ii","iii" for sub-parts.
4. Every question must map to the supplied topics/syllabus — never invent off-syllabus content.
5. No repeated questions within this section.
6. Objective questions: exactly 4 options, one correct, three plausible distractors.
7. Marks per question (and parts, if used) must sum to the requested total.
8. Output nothing but the JSON object.
${markingRulesBlock}`;
}