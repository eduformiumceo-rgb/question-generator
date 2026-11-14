/**
 * beceStyle.js
 * ─────────────────────────────────────────────────────────────────
 * Everything that makes a paper "BECE style", in one place.
 *
 * The structure of each JHS subject below was read from the 2025 BECE papers
 * and marking schemes supplied for this project (Paper 2 first, then Paper 1,
 * exactly as in the real booklet). When the teacher picks BECE style, the
 * sections, question counts, marks, "answer any N" rules, duration, paper
 * wording and marking-scheme format are all chosen automatically from here.
 *
 * IMPORTANT: a copy of this file lives in functions/_shared/beceStyle.js
 * (same reason as examPrompt.js: no imports across the src/ <-> functions/
 * boundary). tests/beceStyle.test.js fails if the two copies drift apart.
 *
 * `verified: false` on a profile means a detail was NOT visible in the
 * supplied papers (noted in `unverified`) and is a sensible default that
 * should be checked against a real paper before it is relied on.
 * ─────────────────────────────────────────────────────────────────
 */

const OBJ_ID = "OBJ";

/** Paper 1 is the same shape in every subject: 40 four-option questions, 1 mark each. */
const paper1 = (minutes = 45, count = 40) => ({
  number: 1, name: "OBJECTIVE TEST", marks: count, minutes,
  section: {
    id: OBJ_ID, label: "Paper 1: Objective Test", type: "objective",
    questionCount: count, marksPerQuestion: 1, enabled: true, paper: 1,
    heading: "", rubric: "Answer all the questions.", numberFrom: 1,
    hint: "Short, clear stems. Exactly four options lettered A to D. Mix direct questions, 'except' questions and a few Roman-numeral statement questions (options such as 'I only', 'I and II only', 'II and III only', 'I, II and III'). Spread the questions across the selected topics.",
  },
});

const sec = (o) => ({ type: "structured", enabled: true, paper: 2, ...o });

export const BECE_PROFILES = {
  "Science": {
    label: "Integrated Science", verified: false,
    unverified: ["Paper 2 duration (cover page not in the supplied copy)"],
    scheme: "points",
    paper2: { name: "ESSAY", marks: 100, minutes: 90,
      intro: ["Answer all the questions in your answer booklet.", "This paper is in two sections: A and B. Answer Question 1 in Section A and any other three questions in Section B."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer all the questions in this section", questionCount: 1, marksPerQuestion: 40, numberFrom: 1,
          hint: "ONE compulsory question of 40 marks with FOUR parts (a) to (d), 10 marks each. Every part is built on a labelled figure ('Figure 1(a) is an illustration of ... Study the figure carefully and answer the questions that follow.') followed by sub-parts (i) to (v) using commands such as 'Name each of...', 'State three...', 'Give the reason...', 'Describe briefly...', or a short calculation. Put the figure description on its own line inside the part text as: [FIGURE 1(a): what the figure shows and its labels]. The four parts must cover four different topics." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer three questions only from this section", questionCount: 4, marksPerQuestion: 20, answerAny: 3, numberFrom: 2,
          hint: "FOUR questions of 20 marks each (candidates answer any three). Each question has parts (a) to (d) whose marks sum to 20 (for example 7+4+6+3 or 6+3+5+6). Each part tests a DIFFERENT topic with short command-word items: 'State three...', 'Describe briefly...', 'Name two...', 'Explain briefly...', plus one short calculation per question where the syllabus allows. Marks are shown per part." }),
      ] },
    paper1: paper1(45),
  },
  "Mathematics": {
    label: "Core Mathematics", verified: true, unverified: ["Paper 1 length assumed 40 questions"],
    scheme: "table", showPartMarks: false, noCalculators: true,
    paper2: { name: "ESSAY", marks: 60, minutes: 60,
      intro: ["Answer four questions only.", "All questions carry equal marks.", "All working must be clearly shown. Marks will not be awarded for correct answers without corresponding working."],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 15, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 15 marks each (candidates answer any four). Each question has parts (a) and (b), with sub-parts (i), (ii), (iii) where needed. Together the six questions cover sets, algebra, number and commissions/interest/proportion, vectors or matrices, mensuration, statistics (pie chart / probability), and a graph or geometry question. Use Ghanaian contexts and GH¢. Do NOT print marks against individual parts; the question carries its 15 marks. Never request a calculator." }),
      ] },
    paper1: paper1(60),
  },
  "English Language": {
    label: "English Language", verified: false, unverified: ["Paper 1 question count and duration (assumed 40 questions, 45 minutes)"],
    scheme: "points",
    paper2: { name: "ESSAY", marks: 60, minutes: 60,
      intro: ["This paper consists of three parts: A, B and C.", "Answer three questions in all: one question from Part A and all the questions in Parts B and C.", "Answer all questions in your answer booklet.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Part A: Writing", type: "essay", heading: "PART A", sub: "WRITING", rubric: "Answer one question only from this part. Your composition should be about 250 words long.", questionCount: 3, marksPerQuestion: 30, answerAny: 1, numberFrom: 1,
          hint: "THREE composition prompts of 30 marks each (candidates answer one): a formal or informal letter, an article for a newspaper or magazine, and a story or speech. Each prompt is one or two sentences set in a realistic Ghanaian school or community situation." }),
        sec({ id: "B", label: "Part B: Reading", heading: "PART B", sub: "READING", rubric: "Read the following passage carefully and answer all the questions which follow.", questionCount: 1, marksPerQuestion: 20, numberFrom: 4,
          hint: "ONE question of 20 marks: a first-person narrative passage of about 300 words (put the whole passage in the question text) with some words or phrases underlined using plain underscores, followed by parts (a) to (g): comprehension questions, 'explain in your own words' expressions, 'give another word or phrase that means the same' items, and a summary or title item asking for 'not more than ten words'." }),
        sec({ id: "C", label: "Part C: Literature", heading: "PART C", sub: "LITERATURE", rubric: "Answer all the questions in this part.", questionCount: 1, marksPerQuestion: 10, numberFrom: 5,
          hint: "ONE question of 10 marks: a short extract from a prescribed Ghanaian drama or prose text the candidates study, then parts (a) to (c) on characters, meaning of a line, and mood or theme." }),
      ] },
    paper1: paper1(45),
  },
  "Social Studies": {
    label: "Social Studies", verified: true, unverified: [],
    scheme: "points",
    paper2: { name: "ESSAY", marks: 60, minutes: 60,
      intro: ["This paper consists of three sections: I, II and III.", "Answer three questions only. One compulsory question from Section I, and one question each from Sections II and III.", "All questions carry equal marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Section I", heading: "SECTION I (COMPULSORY)", sub: "", rubric: "", questionCount: 1, marksPerQuestion: 20, numberFrom: 1, subFromTopic: true,
          hint: "ONE compulsory question of 20 marks: (a) a definition or explanation item [4 marks], (b) a 'State four...' item [4 marks], (c) a 'Suggest four possible reasons / ways...' item built on a short real-life scenario (a family, class or community) [12 marks]." }),
        sec({ id: "B", label: "Section II", heading: "SECTION II", sub: "", rubric: "Answer one question only from this section", questionCount: 2, marksPerQuestion: 20, answerAny: 1, numberFrom: 2, subFromTopic: true,
          hint: "TWO questions of 20 marks each (candidates answer one), from a different theme than Section I. Each: (a)(i)(ii) explain a term in a classroom or community situation and give two examples [4+4], (b) 'Suggest/Highlight four ...' [12]." }),
        sec({ id: "C", label: "Section III", heading: "SECTION III", sub: "", rubric: "Answer one question only from this section", questionCount: 2, marksPerQuestion: 20, answerAny: 1, numberFrom: 4, subFromTopic: true,
          hint: "TWO questions of 20 marks each (candidates answer one), from a third theme. Same shape as Section II: (a) 8 marks (identify/explain), (b) 12 marks (suggest/highlight four ...)." }),
      ] },
    paper1: paper1(45),
  },
  "Religious and Moral Education": {
    label: "Religious and Moral Education", verified: true, unverified: ["Paper 1 length and Paper 2 duration assumed"],
    scheme: "points",
    paper2: { name: "ESSAY", marks: 60, minutes: 60,
      intro: ["Answer three questions in all: question one which is compulsory and any two questions from Section B.", "Each question carries 20 marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "COMPULSORY", rubric: "", questionCount: 1, marksPerQuestion: 20, numberFrom: 1,
          hint: "ONE compulsory question of 20 marks, parts (a) and (b), usually 'Give reasons why...' (12 marks) and 'State factors that...' (8 marks), on a moral, social or religious theme." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer any two questions from this section", questionCount: 3, marksPerQuestion: 20, answerAny: 2, numberFrom: 2,
          hint: "THREE questions of 20 marks each (candidates answer any two). Each has parts (a) 4 marks, (b) 6 marks, (c) 10 marks, covering Christianity, Islam and African Traditional Religion across the paper (e.g. sacrifices, festivals, rites of passage, moral teachings)." }),
      ] },
    paper1: paper1(45),
  },
  "Computing": {
    label: "Computing", verified: true, unverified: [],
    scheme: "points", answerInPaper: true,
    paper2: { name: "ESSAY", marks: 60, minutes: 75,
      intro: ["This paper is in two sections: A and B. Answer Question 1 in Section A and any other three questions in Section B.", "Answer all the questions in the spaces provided in this question paper. At the end of the examination, you should submit the entire question paper to the invigilator.", "Any candidate who tears off any part of the question paper will be severely penalized."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer Question 1", questionCount: 1, marksPerQuestion: 24, numberFrom: 1,
          hint: "ONE compulsory question of 24 marks built on a practical scenario (a school project, club or office task): a lead part of 10 marks (describe/outline steps) followed by short parts of 3, 3, 2, 2, 2 and 2 marks." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer three questions only from this section", questionCount: 4, marksPerQuestion: 12, answerAny: 3, numberFrom: 2,
          hint: "FOUR questions of 12 marks each (candidates answer any three), each with parts (a) to (d) on different topics: concepts such as AI or perceptual computing, word processing / spreadsheet / presentation steps, number-system conversion, programming or algorithms, and ICT safety. Marks per part such as 3+3+2+4 or 6+2+4." }),
      ] },
    paper1: paper1(45),
  },
  "Creative Arts": {
    label: "Creative Arts and Design", verified: false, unverified: ["Exact number of options in Section A (assumed 3 questions, Question 1 compulsory)"],
    scheme: "points",
    paper2: { name: "ESSAY", marks: 60, minutes: 80,
      intro: ["Answer four questions only.", "All the questions carry equal marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer two questions only from this section, question 1 and any other", questionCount: 3, marksPerQuestion: 15, answerAny: 2, numberFrom: 1,
          hint: "THREE practical-knowledge questions of 15 marks each (Question 1 compulsory, plus any one other): design elements and principles, materials, tools and processes, with short parts of 2 to 4 marks." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer only one question from this section", questionCount: 2, marksPerQuestion: 15, answerAny: 1, numberFrom: 4,
          hint: "TWO questions of 15 marks each (candidates answer one) on Ghanaian arts, music and culture, with parts such as 6 + 5 + 4 marks." }),
        sec({ id: "C", label: "Section C", heading: "SECTION C", rubric: "Answer only one question from this section", questionCount: 2, marksPerQuestion: 15, answerAny: 1, numberFrom: 6,
          hint: "TWO questions of 15 marks each (candidates answer one) on dance, drama and performance, with parts such as 3 + 3 + 3 + 6 marks." }),
      ] },
    paper1: paper1(50),
  },
  "Career Technology": {
    label: "Career Technology", verified: false, unverified: ["Part B layout (drawing / practical part) was not checked; only Part A is generated"],
    scheme: "points", answerInPaper: true,
    paper2: { name: "ESSAY", marks: 30, minutes: 75,
      intro: ["Answer all the questions in the spaces provided in this question paper.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Part A", heading: "PART A", rubric: "Answer Question 1 (Compulsory) and any other question", questionCount: 3, marksPerQuestion: 15, answerAny: 2, numberFrom: 1,
          hint: "THREE questions of 15 marks (Question 1 compulsory, plus any one other). Question 1 is a practical scenario (for example preparing a snack or making a simple item) with parts such as 'Describe how to prepare...' [5 marks], 'State two advantages...' [4 marks], 'State one function of each of the following...' [6 marks]. Other questions have short parts of 2 to 3 marks on skills, safety, nutrition and tools." }),
      ] },
    paper1: paper1(45),
  },
  "French": {
    label: "French", verified: false, unverified: ["Paper 1 duration taken from the answer-sheet page (1 hour)"],
    scheme: "points", language: "French",
    paper2: { name: "ESSAY", marks: 60, minutes: 45,
      intro: ["Il y a deux questions dans cette partie. Répondez à toutes les questions.", "There are two questions in this part. Answer both questions."],
      sections: [
        sec({ id: "A", label: "Question 1", heading: "", rubric: "", questionCount: 1, marksPerQuestion: 20, numberFrom: 1,
          hint: "ONE question of 20 marks, written in French with an English rubric line: ten sentences (a) to (j) in which people describe what they do and the candidate completes 'Je suis ...' with the correct profession or occupation. Show one worked example first." }),
        sec({ id: "B", label: "Question 2: Composition", type: "essay", heading: "COMPOSITION", rubric: "", questionCount: 1, marksPerQuestion: 40, numberFrom: 2,
          hint: "ONE composition of 40 marks: a short realistic message (for example a WhatsApp message or an invitation, written out in the question text) to which the candidate replies in French in 50 to 60 words, giving the task clearly in French." }),
      ] },
    paper1: paper1(60),
  },
  "Ghanaian Language": {
    label: "Ghanaian Language", verified: false, unverified: ["Part IV (Grammar) layout and Paper 1"],
    scheme: "points", language: "the selected Ghanaian language",
    paper2: { name: "ESSAY", marks: 60, minutes: 70,
      intro: ["This paper consists of four parts: I, II, III and IV. Answer one question only in Part I and all the questions in Parts II, III and IV.", "Answer all the questions in your answer booklet.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Part I: Composition", type: "essay", heading: "PART I", sub: "COMPOSITION", rubric: "", questionCount: 1, marksPerQuestion: 30, numberFrom: 1,
          hint: "ONE composition question of 30 marks written in the Ghanaian language with four optional titles (a) to (d); the candidate chooses one and writes about 150 words." }),
        sec({ id: "B", label: "Part II: Comprehension", heading: "PART II", sub: "COMPREHENSION", rubric: "", questionCount: 1, marksPerQuestion: 10, numberFrom: 2,
          hint: "ONE question of 10 marks: a passage of about 200 words in the Ghanaian language (put it in the question text, some words underlined) followed by ten short parts (a) to (j) of 1 mark each." }),
        sec({ id: "C", label: "Part III: Translation", heading: "PART III", sub: "TRANSLATION", rubric: "", questionCount: 1, marksPerQuestion: 10, numberFrom: 3,
          hint: "ONE question of 10 marks: ten short English sentences (a) to (j), 1 mark each, to be translated into the Ghanaian language." }),
        sec({ id: "D", label: "Part IV: Grammar", heading: "PART IV", sub: "GRAMMAR", rubric: "", questionCount: 1, marksPerQuestion: 10, numberFrom: 4,
          hint: "ONE question of 10 marks on grammar and language structure with short parts (a) to (j), 1 mark each." }),
      ] },
    paper1: paper1(45),
  },
};

/** Subjects with no supplied sample: still BECE-shaped, flagged as a generic default. */
const GENERIC = {
  label: "", verified: false, generic: true, unverified: ["No sample paper supplied for this subject: generic BECE shape used"],
  scheme: "points",
  paper2: { name: "ESSAY", marks: 60, minutes: 75,
    intro: ["This paper is in two sections: A and B. Answer Question 1 in Section A and any other two questions in Section B.", "Credit will be given for clarity of expression and orderly presentation of material."],
    sections: [
      sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer Question 1", questionCount: 1, marksPerQuestion: 20, numberFrom: 1,
        hint: "ONE compulsory question of 20 marks with parts (a) to (d)." }),
      sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer two questions only from this section", questionCount: 3, marksPerQuestion: 20, answerAny: 2, numberFrom: 2,
        hint: "THREE questions of 20 marks each (candidates answer any two), each with parts (a) to (d) on different topics." }),
    ] },
  paper1: paper1(45),
};

const ALIASES = { "Integrated Science": "Science", "Core Mathematics": "Mathematics", "RME": "Religious and Moral Education", "Creative Arts and Design": "Creative Arts", "Creative Arts & Design": "Creative Arts", "Career Tech": "Career Technology", "Pre-Technical": "Career Technology" };

/** BECE style applies to every JHS class (and so to every JHS mock exam). */
export const isBeceClass = (cls) => /^(JHS\s*[123]|Basic\s*[789])\b/i.test(String(cls || "").trim());

export function getBeceProfile(subject) {
  const s = String(subject || "").trim();
  const key = ALIASES[s] || s;
  const p = BECE_PROFILES[key];
  if (p) return { key, ...p };
  return { key: s, ...GENERIC, label: s || "Subject" };
}

/** The sections to load into the Exam Structure Builder: Paper 2 first, then Paper 1, as printed. */
export function beceSections(profile) {
  const extra = profile.showPartMarks === false ? { showPartMarks: false } : {};
  const p2 = (profile.paper2.sections || []).map((s, i) => ({ ...s, ...extra, paperStart: i === 0 }));
  const p1 = { ...profile.paper1.section, paperStart: true };
  return [...p2, p1];
}

export const minutesLabel = (m) => {
  const n = Math.round(Number(m) || 0);
  const h = Math.floor(n / 60), r = n % 60;
  if (!h) return `${r} minutes`;
  return `${h} hour${h > 1 ? "s" : ""}${r ? ` ${r} minutes` : ""}`;
};

/** Total time for the booklet (Paper 2 + Paper 1). */
export const beceTotalMinutes = (profile) => (profile.paper2.minutes || 0) + (profile.paper1.minutes || 0);

/** Marks a candidate can actually earn in one section (an "answer any N" section counts N questions). */
export function answerableMarks(section) {
  const qs = section.questions || [];
  if (qs.length) {
    const per = Number(qs[0].marks) || Number(section.marksPerQuestion) || 0;
    const n = section.answerAny ? Math.min(Number(section.answerAny), qs.length) : qs.length;
    return section.answerAny ? n * per : qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);
  }
  const n = section.answerAny ? Number(section.answerAny) : Number(section.questionCount) || 0;
  return n * (Number(section.marksPerQuestion) || 0);
}

/** Booklet front-page wording, written the way the real BECE booklet reads. */
export function beceBooklet(profile) {
  const p2 = profile.paper2, p1 = profile.paper1;
  const lines = [
    "Do not open this booklet until you are told to do so. While you are waiting, read and observe the following instructions carefully. Write your name and index number in the spaces provided.",
    `This booklet consists of two papers. Answer Paper 2, which comes first, in your answer booklet and Paper 1 on your Objective Test answer sheet. Paper 2 will last ${minutesLabel(p2.minutes)}${profile.answerInPaper ? "" : ", after which the answer booklet will be collected"}. Do not start Paper 1 until you are told to do so. Paper 1 will last ${minutesLabel(p1.minutes)}.`,
  ];
  if (profile.noCalculators) lines.push("The use of calculators is not allowed.");
  return lines;
}

export const BECE_OBJECTIVE_INSTRUCTIONS = [
  "Answer all the questions.",
  "Each question is followed by four options lettered A to D. Find the correct option for each question and shade in pencil on your answer sheet the answer space which bears the same letter as the option you have chosen. Give only one answer to each question.",
  "Think carefully before you shade the answer spaces; erase completely any answer you wish to change.",
  "Do all rough work in this question paper.",
];

/**
 * The BECE block added to every section prompt when examStyle === "bece".
 * Kept in this file so the client and the server build the same text.
 */
export function beceStyleBlock(cfg, section) {
  if (cfg.examStyle !== "bece") return "";
  const isObj = section.type === "objective";
  const lang = cfg.beceLanguage ? `\n- Language of the paper: write the questions in ${cfg.beceLanguage}${cfg.beceLanguage === "French" ? ", with the instruction line in English where the real paper does" : ""}.` : "";
  const num = Number(section.numberFrom) || 1;
  const rubric = section.rubric ? `\n- Rubric printed above this section: "${section.rubric}".` : "";
  const answerAny = section.answerAny ? `\n- Candidates answer only ${section.answerAny} of the ${section.questionCount} questions here, so write ALL ${section.questionCount} questions at the same standard and the same mark value. Do not label any question "optional".` : "";
  const marksShown = section.showPartMarks === false
    ? "- Do NOT print marks against individual parts in the question text; still fill in each part's \"marks\" (they are used by the marking scheme)."
    : "- Marks for each lettered part are printed at the right as [n marks] by the paper layout; set them correctly on every part.";
  const theme = section.subFromTopic ? `\n- Add "theme": a short upper-case title (2 to 5 words) naming the syllabus theme this section draws on (e.g. "THE ENVIRONMENT"), as a field of the "section" object.` : "";
  const head = `\n\nBECE-STYLE PAPER (this must read like a real BECE paper set by the West African Examinations Council for Ghana's Basic Education Certificate Examination)
- This is ${section.paper === 1 ? "Paper 1 (Objective Test)" : "Paper 2 (Essay)"}${section.heading ? `, ${section.heading}` : ""}.${rubric}
- Question numbers in this section start at ${num} (so the first question is ${num}) and run on in order.${answerAny}${lang}`;
  if (isObj) {
    return `${head}
- Style: ${section.hint || "Follow the usual BECE style for this subject."}
- Plain exam-hall English for JHS 3 pupils. Ghanaian names, places, GH¢ and local situations. No "all of the above" or "none of the above". Do not give away the answer through option length. The four options are plain text WITHOUT the letters A to D (the layout adds them). Roman-numeral questions put the statements I, II, III on separate lines inside the question text, and the four options then read exactly: "I only", "I and II only", "II and III only", "I, II and III".
- Spread correct answers roughly evenly over A, B, C and D.`;
  }
  return `${head}
- Style: ${section.hint || "Follow the usual BECE style for this subject."}
${marksShown}
- Use real BECE command words and match the number of points asked to the marks: "State three ..." is 3 marks, "Name two ..." is 2 marks, "Describe briefly ..." is 2 to 3 marks, "Explain briefly ..." is 2 to 4 marks, "Suggest four ..." is 4 marks at 1 or 2 marks each.
- Questions are set in Ghanaian situations (Mensah, Boadu, Adamu; GH¢; local towns, markets, schools and farms). Sub-parts use (i), (ii), (iii) and a part may sit on one line with its marks in the right margin.
- Do not write "Paper", "Section" or "Answer ..." lines inside the question text: the layout prints those.${theme}`;
}

/** Marking-scheme rules in the real BECE format. Used in place of the generic rules when examStyle === "bece". */
export function beceSchemeBlock(cfg, section) {
  if (cfg.examStyle !== "bece") return "";
  if (section.type === "objective") {
    return `
MARKING SCHEME RULES (BECE format)
- Objective: the final key is only the correct letter, set in "correctOption". Leave "markingGuide" as an empty string "" for every question.`;
  }
  const table = cfg.beceScheme === "table";
  return `
MARKING SCHEME RULES (BECE format: "markingGuide" is written as LINES, one per row of the marking table, each row in exactly this form)
  reference :: ${table ? "worked solution / expected answer" : "expected answer or acceptable points"} :: ${table ? "mark codes" : "marks"}
- "reference" is the part label such as 1(a)(i) or 2(b) (use the real question number of this section).
- ${table
    ? "Mathematics: show the full working line by line. In the third field use method and accuracy codes with the reason, e.g. \"M1 for converting 0.35 to a whole number; A1 for all correct\", \"B1 for ...\". Each question ends with a line \"TOTAL :: :: [15 marks]\" (use that question's mark total). End questions that need it with a line such as \"NOTE :: :: -1 for ou/wu or 2 d.p. once only\"."
    : "For a list-type question write one row per acceptable point, e.g. \"1(a)(ii) :: Carbon dioxide / CO2 :: 1\", and give alternatives separated by \" / \". Where only some of the listed points are needed, add a line such as \"NOTE :: Any 4 points x 3 = 12 marks :: 12\". For explain/describe items give the marking points, then the allocation, e.g. \"Statement of point = 1 mark; with explanation = 2 marks\". For composition or comprehension write a short band guide (content, organisation, expression, mechanical accuracy) with the mark range for each."}
- Every question ends with a line "TOTAL :: :: [N marks]" where N is that question's marks.
- The scheme must be specific enough for a different teacher to mark consistently. Do not use em dashes.`;
}

/**
 * Stamps BECE layout data onto a generated paper (sections keep the paper / rubric /
 * "answer any N" fields of the structure they were generated from) and sets the
 * title and booklet instructions. Pure, so saved papers re-render identically.
 */
export function decorateBeceExam(examData, requestedSections, profile, examType = "Mock Exam") {
  const byId = Object.fromEntries((requestedSections || []).map(s => [s.id, s]));
  const FIELDS = ["paper", "answerAny", "heading", "sub", "rubric", "numberFrom", "showPartMarks", "paperStart", "subFromTopic"];
  const sections = (examData.sections || []).map(gs => {
    const req = byId[gs.id] || {};
    const meta = {};
    FIELDS.forEach(f => { if (req[f] !== undefined) meta[f] = req[f]; });
    if (gs.theme) meta.theme = String(gs.theme).replace(/[^A-Za-z0-9 ,&'-]/g, "").slice(0, 60).toUpperCase();
    return { ...gs, ...meta };
  });
  return {
    ...examData, sections, style: "bece",
    title: `${examType === "Mock Exam" ? "MOCK " : ""}BASIC EDUCATION CERTIFICATE EXAMINATION`,
    instructions: beceBooklet(profile),
  };
}
