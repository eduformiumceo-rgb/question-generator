/**
 * wassceStyle.js
 * ─────────────────────────────────────────────────────────────────
 * Everything that makes a paper "WASSCE style", in one place (the SHS twin of beceStyle.js).
 *
 * The structure of each SHS subject below was read from the WASSCE (School Candidates)
 * question papers supplied for this project: the 2025 papers for Core Mathematics,
 * Elective Mathematics, English Language, Integrated Science, Social Studies, Biology,
 * Chemistry, Physics, ICT and Graphic Design, and the 2021 papers for the subjects listed
 * as such. When the teacher picks WASSCE style, the papers, sections, question counts,
 * marks, "answer any N" rules, duration, paper wording and marking-scheme format are all
 * chosen automatically from here.
 *
 * Papers: real WASSCE sits Paper 1 (Objective Test) and Paper 2 (Essay). Some subjects are
 * printed as one "2&1" booklet with Paper 2 first (Chemistry, Graphic Design, CRS ...);
 * most are separate booklets with Paper 1 first. `order` records which. Practical papers
 * (Paper 3) need a laboratory or a computer and are not generated.
 *
 * IMPORTANT: a copy of this file lives in functions/_shared/wassceStyle.js (no imports
 * across the src/ <-> functions/ boundary). tests/wassceStyle.test.js fails if the two
 * copies drift apart.
 *
 * `verified: false` on a profile means a detail was NOT visible in the supplied papers
 * (listed in `unverified`) and is a sensible default to be checked against a real paper.
 * ─────────────────────────────────────────────────────────────────
 */

import { minutesLabel, answerableMarks } from "./beceStyle.js";

const OBJ_ID = "OBJ";

/* ── marking conventions printed at the top of a WASSCE marking scheme ─────────── */
const NOTES_GENERIC = ["Accept any other correct answer or acceptable equivalent that is not listed.", "Award marks for correct points however they are worded; do not penalise spelling that does not change the meaning."];
const NOTES_POINTS = ["Mere mention of a point = 1 mark.", "Meaningful statement of a point without explanation = 2 marks.", "Statement of a point with explanation and good examples or illustrations = full marks.", "Definition of a concept without explanation or examples = 2 marks."];
const NOTES_MATH = ["M = method mark, A = accuracy mark, B = independent mark.", "Award an A mark only where the method mark it depends on has been earned.", "Accept any other correct method; a correct answer without the required working earns no marks.", "Penalise once only for wrong or missing units, and for accuracy lost through premature approximation."];
const NOTES_SCIENCE = ["Accept any other correct answer or acceptable equivalent that is not listed.", "Award a mark for a correct equation, formula or unit only where the question asks for it.", "In calculations award the method mark for a correct substitution even when the final answer is wrong; do not penalise a correct answer carried forward from an earlier error.", "Penalise once only for wrong or missing units."];

/* ── Paper 1 wording (the real booklet text; ** marks the words WAEC prints in bold) ─ */
export const WASSCE_OBJECTIVE_INTRO = [
  "Answer **all** the questions.",
  "Each question is followed by **four** options lettered A to D. Find the **correct** option for each question and shade in pencil on your answer sheet, the answer space which bears the same letter as the option you have chosen. Give only **one** answer to **each** question. An example is given below.",
];
export const WASSCE_OBJECTIVE_AFTER = [
  "Think carefully before you shade the answer spaces; erase completely any answer(s) you wish to change.",
  "Do **all** rough work on this question paper.",
];
const SAMPLE_DEFAULT = { q: "Which part of the gill of fish is involved in gaseous exchange?", options: ["slits", "bars", "covers", "filaments"], answer: 3 };

/** Paper 1: one objective section by default (English builds several). */
const p1Section = (count, o = {}) => ({
  id: o.id || OBJ_ID, label: o.label || "Paper 1: Objective Test", type: "objective",
  questionCount: count, marksPerQuestion: 1, enabled: true, paper: 1,
  heading: o.heading || "", sub: o.sub || "", part: o.part || "", partSub: o.partSub || "",
  rubric: o.rubric || "", numberFrom: o.numberFrom || 1,
  hint: o.hint || "Short, clear stems. Exactly four options lettered A to D. Mix direct questions, 'which of the following is NOT ...' questions (put the word NOT in bold as **not**), calculation questions and a few Roman-numeral statement questions (options such as 'I only', 'I and II only', 'II and III only', 'I, II and III'). Include a small group of questions that share one diagram or table ('The table below shows ... Use it to answer questions 4 and 5.'). Spread the questions across the selected topics.",
});

const paper1 = (count, minutes, o = {}) => ({
  number: 1, name: o.name || "OBJECTIVE TEST", marks: count, minutes,
  sections: o.sections || [p1Section(count, o)],
  intro: o.intro || WASSCE_OBJECTIVE_INTRO, after: o.after || WASSCE_OBJECTIVE_AFTER, sample: o.sample || SAMPLE_DEFAULT,
});

const sec = (o) => ({ type: "structured", enabled: true, paper: 2, ...o });

/** The "INSTRUCTIONS TO CANDIDATES" printed on a WASSCE essay booklet (Paper 2 cover). */
const booklet2 = (structureLine, extra = []) => [
  "In the spaces provided above, insert your **name**, full **index number**, normal **signature** and the **date** of examination.",
  structureLine,
  ...extra,
  "Write your **name**, **index number** and the **number** of each question you answer, at the top of each page.",
  "Write on **both** sides of the paper unless otherwise instructed on the question paper.",
  "Begin **each** answer to a question on a fresh page. Leave two lines between answers where there are sub-sections to the same question.",
  "On **no** account should you tear off any part of the booklet. It is an examination malpractice to do so. The answer booklet will be collected at the end of the examination.",
  "Write in the space provided below, the **question number** of the questions you have answered, in the order in which you have written them.",
];

const CALC = "The use of non-programmable, silent and cordless calculator is allowed.";
const CREDIT = "Credit will be given for clarity of expression and orderly presentation of material.";

const SCI_P1_HINT = "Short, clear stems. Exactly four options lettered A to D. Mix recall, 'which of the following is NOT ...' (write the word as **not**), application and short calculation questions, and a few Roman-numeral questions. Write chemical formulae and units with proper subscripts and superscripts (H₂O, CO₂, cm³, m s⁻²). Include two or three small groups of questions that share one diagram or table ('The diagram below ... Use it to answer questions 9 and 10.'); put the diagram as a [FIGURE: ...] line or the table in pipe form inside the first question of the group. Spread the questions across the selected topics.";

export const WASSCE_PROFILES = {
  "Biology": {
    label: "Biology", verified: true, unverified: ["Paper 3 (practical) is not generated"],
    scheme: "points", schemeNotes: NOTES_SCIENCE, order: "12", answerInPaper: true, examinerBox: true, twoColumnP1: true,
    paper1: paper1(50, 50, { hint: SCI_P1_HINT, sample: SAMPLE_DEFAULT }),
    paper2: { name: "ESSAY", marks: 70, minutes: 100,
      intro: ["Answer **three** questions in **all**: **two** questions from Section A and the **compulsory** question in Section B.", "Write your answers in **ink** in this booklet.", "Clear diagrams should be used where necessary. The names given for chosen species **must** be English or scientific and **not** vernacular.", CREDIT],
      cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **three** questions in **all**: **two** questions from Section **A** and **one** compulsory question from Section **B**."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer **two** questions **only** from this section.", questionCount: 4, marksPerQuestion: 20, answerAny: 2, numberFrom: 1,
          hint: "FOUR questions of 20 marks each (candidates answer any two), each opening with a short practical or experimental situation ('Two {{Spirogyra}} filaments A and B were each placed in ...'). Each has parts (a) to (e) and sub-parts (i), (ii) with marks per part such as 2+4+2+3+9. Use real WASSCE command words: 'Name ...', 'State **two** ...', 'Explain briefly ...', 'Distinguish between ...', 'Complete the table below.' (write the table in pipe form with empty cells), and ONE labelled-diagram task per question where the syllabus allows ('Make a diagram 8 cm to 10 cm long of ... and label only the parts that ...', 9 marks). Scientific names of organisms are put in italics as {{Spirogyra}}. The four questions cover different topics (cell biology and transport, nutrition, ecology, genetics or reproduction)." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **all** the questions in this section.", questionCount: 1, marksPerQuestion: 30, numberFrom: 5,
          hint: "ONE compulsory question of 30 marks with parts (a) to (f) built from different topics, each part short and direct with its own marks, such as 'Name **two** processes by which leaves of plants lose water' [2] followed by 'Explain briefly each of the processes named' [4]; 'Arrange the following structures of a stem from the inner part to the outer part' [4]; 'Name **three** forces that move water ...' [3]; 'Explain briefly how ... survives ...' [4]; 'Distinguish between (i) ... and (ii) ...' [2+2]. Marks of the parts add up to 30." }),
      ] },
  },

  "Chemistry": {
    label: "Chemistry", verified: true, unverified: ["Paper 3 (practical) is not generated"],
    scheme: "points", schemeNotes: NOTES_SCIENCE, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(50, 60, { hint: SCI_P1_HINT }),
    paper2: { name: "ESSAY", marks: 100, minutes: 120,
      intro: ["Answer **four** questions in all: Question 1 in Section A and **three** questions from Section B.", "All questions carry equal marks.", CREDIT],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer **all** the questions in this section.", questionCount: 1, marksPerQuestion: 25, numberFrom: 1,
          hint: "ONE compulsory question of 25 marks made of about ten SHORT independent parts (a) to (j) of 2 to 4 marks each, drawn from different topics: balance two equations; explain a bond-energy or valency fact; list the parts of an instrument; compare two kinds of radiation; a short relative-atomic-mass calculation; two properties of metals and how each affects its use; the charge on a complex ion; define a term such as enthalpy of combustion; give the functional group of alkanols and alkanoic acids. Write every formula with proper subscripts and superscripts (H₂SO₄, Na₂CO₃, mol dm⁻³). Atomic masses are given in square brackets where a calculation needs them, for example [O = 16; S = 32]. Marks of the parts add up to 25." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **three** questions **only** from this section.", questionCount: 4, marksPerQuestion: 25, answerAny: 3, numberFrom: 2,
          hint: "FOUR questions of 25 marks each (candidates answer any three). Each has two to four parts with marks such as 9+4+8+4, 14+9+2, 8+7+6+4 or 8+5+10+2. Each question pairs a descriptive part ('Describe briefly how a mixture of A, B and C could be separated', 'Describe how the percentages of carbon and hydrogen in an organic compound are determined') with calculations (mole, titration, percentage purity, enthalpy and Hess's law) and organic or inorganic reaction schemes ('Name substances U, V, W, X, Y and Z'). Give data tables in pipe form and atomic masses in square brackets. Each question covers a DIFFERENT area of the syllabus." }),
      ] },
  },

  "Physics": {
    label: "Physics", verified: true, unverified: ["Paper 3 (practical) is not generated"],
    scheme: "points", schemeNotes: NOTES_SCIENCE, order: "12", calculators: true, examinerBox: true,
    paper1: paper1(50, 90, { hint: SCI_P1_HINT }),
    paper2: { name: "ESSAY", marks: 60, minutes: 90,
      intro: ["Answer **eight** questions in **all**; **five** questions from Part I and **three** questions from Part II.", CALC],
      cover: booklet2("This booklet consists of **two** parts: **I** and **II**. Answer **eight** questions in all: **five** questions from part **I** and **three** questions from part **II**."),
      sections: [
        sec({ id: "A", label: "Part I", heading: "PART I", rubric: "Answer any **five** questions from this part.\nAll questions carry equal marks.", questionCount: 7, marksPerQuestion: 3, answerAny: 5, numberFrom: 1,
          hint: "SEVEN short questions of 3 marks each (candidates answer any five), each a single task with the marks printed once at the end: 'State **three** uses of a diode', 'List **three** forces that act on a ball ...', a dimensional-analysis item, a one-step calculation with the data given in the question, or a short question on a labelled figure ([FIGURE: ...]) with parts (a), (b), (c). Each covers a different topic. Use SI units with proper superscripts (m s⁻², N m⁻¹)." }),
        sec({ id: "B", label: "Part II", heading: "PART II", rubric: "Answer **three** questions from this part.\nAll questions carry equal marks.", questionCount: 5, marksPerQuestion: 15, answerAny: 3, numberFrom: 8,
          hint: "FIVE questions of 15 marks each (candidates answer any three). Each has parts (a) to (c) with sub-parts (i), (ii) and (iii) on DIFFERENT topics, with marks such as 5+4+6, 4+7+4 or 3+5+7: definitions ('Define the following terms as applied to machines'), a calculation with data (machines, heat, waves, optics, electricity, magnetism, capacitors, transformers, atomic physics), a diagram task ('Draw a pulley system that has a velocity ratio of 4', 'Sketch a heating curve') and a short explanation. Give constants such as [g = 10 m s⁻²] in square brackets. Marks of the parts add up to 15." }),
      ] },
  },

  "Mathematics": {
    label: "Core Mathematics", verified: true, unverified: ["Marking scheme layout (the supplied files are question papers)"],
    scheme: "table", schemeNotes: NOTES_MATH, order: "12", calculators: true, showPartMarks: false, examinerBox: true,
    paper1: paper1(50, 90, {
      intro: ["Answer **all** the questions.", "Mathematical tables may be used in any question. " + CALC, ...WASSCE_OBJECTIVE_INTRO.slice(1)],
      sample: { q: "The ages, in years, of four boys are 10, 12, 14 and 18. What is the average age of the boys?", options: ["12 years", "13½ years", "13 years", "12½ years"], answer: 1 },
      hint: "Each question is self-contained with four numeric or algebraic options lettered A to D, in order from small to large where the options are numbers. Cover sets and logic, indices and surds, algebra and variation, number bases and sequences, commercial arithmetic (GH¢, simple interest, percentages), mensuration, geometry and trigonometry, coordinate geometry, statistics and probability, vectors and matrices. Use Ghanaian contexts. Fractions are written plainly (3/4) or as mixed numbers (1 2/3). Do not request a diagram unless the question cannot be understood without it.",
    }),
    paper2: { name: "ESSAY", marks: 100, minutes: 150,
      intro: ["Write your name and index number in **ink** in the spaces provided above.", "Answer **ten** questions in all. **All** the questions in Section A and **five** questions from Section B.", "In each question, all necessary details of working, including rough work, must be shown with the answer.", "Give answers as accurately as data and tables allow.", "Graph papers are provided for your use in the examination.", CALC],
      cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **ten** questions in all: **all** the questions in Section **A** and **five** questions from Section **B**.", ["In each question, all necessary details of working, including rough work, must be shown with the answer.", "Give answers as accurately as data and tables allow.", CALC]),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer **all** the questions in this section. All questions carry equal marks.", questionCount: 5, marksPerQuestion: 8, numberFrom: 1,
          hint: "FIVE compulsory questions of 8 marks each, mostly word problems set in real Ghanaian situations, each with one or two parts (a), (b): average speed and time; simple interest on two accounts (GH¢); volume of a hemispherical tank or other solid and a yes/no decision 'with a mathematical statement'; angles of elevation or depression with 'Illustrate the information in a diagram'; coordinate geometry (midpoint, distance). Do NOT print marks against individual parts; the question carries its 8 marks." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **five** questions **only** from this section. All questions carry equal marks.", questionCount: 8, marksPerQuestion: 12, answerAny: 5, numberFrom: 6,
          hint: "EIGHT questions of 12 marks each (candidates answer any five), each with parts (a), (b), (c) and sub-parts (i), (ii): ratio and percentage change, area and perimeter of a composite plane figure given in a [FIGURE: ...] line, linear equations and time/work, longitudes and latitudes (take π = 22/7, R = 6400 km), bearings and trigonometry with a diagram, circle theorems, a cumulative frequency table with curve and quartiles from a list of 50 marks, and a logic or Venn-diagram question. Do NOT print marks against individual parts; the question carries its 12 marks." }),
      ] },
  },

  "Additional Mathematics": {
    label: "Elective Mathematics", verified: true, unverified: ["Marking scheme layout (the supplied files are question papers)"],
    scheme: "table", schemeNotes: NOTES_MATH, order: "12", calculators: true, showPartMarks: false, examinerBox: true, twoColumnP1: true,
    paper1: paper1(40, 90, {
      intro: ["Answer **all** the questions on your Objective Test answer sheet.", "Mathematical tables may be used in any question. " + CALC, ...WASSCE_OBJECTIVE_INTRO.slice(1)],
      sample: { q: "The ages, in years, of four boys are 10, 12, 14 and 18. What is the average age of the boys?", options: ["12 years", "13½ years", "13 years", "12½ years"], answer: 1 },
      hint: "Each question is self-contained with four options lettered A to D (numbers in order of size). Cover functions and binary operations, logic, surds and indices, polynomials and partial fractions, binomial expansion, sequences and series, matrices and linear transformations, coordinate geometry, differentiation and integration, trigonometry, permutations and combinations, probability, statistics, vectors and mechanics. Fractions are written plainly. Include the occasional question on a table of values.",
    }),
    paper2: { name: "ESSAY", marks: 100, minutes: 150,
      intro: ["Write your name and index number in **ink** in the spaces provided above.", "Answer **all** the questions in Section A (compulsory) and **four** questions from Section B.", "In each question, all necessary details of working, including rough work, must be shown with the answer.", "Give answers as accurately as data and tables allow.", CALC],
      cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **all** the questions in Section **A** (compulsory) and **four** questions from Section **B**.", ["In each question, all necessary details of working, including rough work, must be shown with the answer.", "Give answers as accurately as data and tables allow.", CALC]),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer **all** the questions in this section.\nAll questions carry equal marks.", questionCount: 8, marksPerQuestion: 6, numberFrom: 1,
          hint: "EIGHT compulsory questions of 6 marks each, each with one or two parts (a), (b), drawn from the Elective Mathematics syllabus: a binary operation on the set of real numbers (inverse, truth set), logic, indices and surds, quadratic and polynomial equations, functions, matrices, coordinate geometry and the circle, sequences, and a mechanics problem on a body held by two strings. Do NOT print marks against individual parts." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **four** questions **only** from this section with at least **one** question from each part.\nAll questions carry equal marks.", questionCount: 7, marksPerQuestion: 13, answerAny: 4, numberFrom: 9, showPartMarks: false,
          hint: "SEVEN questions of 13 marks each (candidates answer any four with at least one from each part), in THREE parts exactly as in the real paper: Part I PURE MATHEMATICS = questions 9, 10 and 11 (for example a binomial coefficients and exponential sequence question, surds with integration, functions with inverse and domain, simplification of indices); Part II STATISTICS AND PROBABILITY = questions 12 and 13 (an objective-test guessing probability question, a frequency table with mean, variance or standard deviation); Part III VECTORS AND MECHANICS = questions 14 and 15 (position vectors and ratio division, relative velocity, a body held by two strings, motion with constant acceleration, collisions, impulse). Begin the text of question 9 with the line '## PART I: PURE MATHEMATICS', question 12 with '## PART II: STATISTICS AND PROBABILITY' and question 14 with '## PART III: VECTORS AND MECHANICS' (a line starting with ## is a printed heading, then the question text follows on the next line). Do NOT print marks against individual parts." }),
      ] },
  },

  "English Language": {
    label: "English Language", verified: true, unverified: ["Literature (Part B of Paper 1) is reduced to one set of ten questions per genre; the real paper offers two alternative sets"],
    scheme: "points", schemeNotes: NOTES_GENERIC, order: "12", examinerBox: true,
    paper1: paper1(80, 60, {
      sample: { q: "The three-month notice of resignation which the manager gave ........ in two weeks' time.", options: ["lapses", "expires", "disrupts", "develops"], answer: 1 },
      intro: ["Answer **all** the questions.", "Each question is followed by **four** options lettered A to D. Find the **correct** option for each question. Shade in pencil on your answer sheet the answer space which bears the same letter as the option you have chosen. Give only **one** answer to **each** question. Be sure you understand the instructions that follow them.", "Do not spend too much time on a question. If you find a question difficult, leave it and go and try it again later. An example is given below."],
      sections: [
        p1Section(10, { id: "OBJ1", label: "Paper 1: Part A, Section I", part: "PART A", partSub: "LEXIS AND STRUCTURE", heading: "SECTION I", numberFrom: 1, rubric: "In each of the following sentences, there is a word underlined and one gap. From the list of words lettered A to D, choose the word that is most nearly opposite in meaning to the underlined word and that will, at the same time, correctly fill the gap in the sentence.", hint: "TEN items. Each is one sentence with ONE word underlined (use plain underscores around it, e.g. _arrogant_) and ONE gap shown as ........ ; the options are single words and the correct one is the OPPOSITE of the underlined word and also fits the gap grammatically. Example shape: 'You are too _arrogant_, you must learn to be ........' (honest / weak / timid / humble)." }),
        p1Section(10, { id: "OBJ2", label: "Paper 1: Part A, Section II", heading: "SECTION II", numberFrom: 11, rubric: "From the words lettered A to D, choose the one that best completes each of the following sentences.", hint: "TEN single-sentence gap-fill items with the gap shown as ........ ; options are single words (vocabulary in context, collocations, prepositions, tense and modal choice such as shall/should/would/will, and commonly confused words such as complement/compliment)." }),
        p1Section(10, { id: "OBJ3", label: "Paper 1: Part A, Section III", heading: "SECTION III", numberFrom: 21, rubric: "Choose from the alternatives lettered A to D the one which is nearest in meaning to the underlined word or expression in each sentence.", hint: "TEN items. Each is one sentence with a word or expression underlined (plain underscores, e.g. _integrated_); the options are single words or short expressions and the correct one is the closest synonym in that context." }),
        p1Section(10, { id: "OBJ4", label: "Paper 1: Part A, Section IV", heading: "SECTION IV", numberFrom: 31, rubric: "After each of the following sentences, a list of possible interpretations of all or part of the sentence is given. Choose the interpretation you consider most appropriate for each sentence.", hint: "TEN items on idioms and figurative expressions (odds and ends, kept his balance, covered much ground, tickled pink, wore his heart on his sleeve, get the hang of it, packed in her job ...). Each stem is one sentence followed by 'This means that ...' and four short interpretations." }),
        p1Section(10, { id: "OBJ5", label: "Paper 1: Part A, Section V", heading: "SECTION V", numberFrom: 41, rubric: "In the following passage the numbered gaps indicate missing words. Against each number in the list below the passage, four choices are offered in columns lettered A to D. For each numbered gap, choose from the options provided for that number, the word that is most suitable to fill the gap.", hint: "TEN items (41 to 50) built on ONE passage of about 150 words with gaps marked —41—, —42-- ... up to —50—. Put the WHOLE passage in the text of question 41, ending with a line 'Questions 41 to 50: choose the word that best fills each numbered gap.'; the text of questions 42 to 50 is just the gap label, for example '42. gap 42'. Each of the ten questions has four single-word options." }),
        p1Section(10, { id: "OBJ6", label: "Paper 1: Part B, Prose", part: "PART B", partSub: "LITERATURE", heading: "PROSE", numberFrom: 51, rubric: "Answer the ten questions numbered 51 to 60 on the extracts below.", hint: "TEN questions on prose. Write two ORIGINAL short prose extracts of about 80 words each (do not quote any published text): put the first extract at the start of the text of question 51 with 'Read the following extract and answer questions 51 to 55.' and the second at the start of question 56 with 'Read the following extract and answer questions 56 to 60.' Questions test meaning of an expression, character, theme, tone, point of view and literary devices; each has four options." }),
        p1Section(10, { id: "OBJ7", label: "Paper 1: Part B, Drama", heading: "DRAMA", numberFrom: 61, rubric: "Answer the ten questions numbered 61 to 70 on the extracts below.", hint: "TEN questions on drama. Write two ORIGINAL short dramatic extracts of about 70 words each with speaker names, in the style of a prescribed African play, at the start of questions 61 and 66 ('Read the following extract and answer questions 61 to 65.'). Questions test characterisation, conflict, dramatic devices, theme and setting; each has four options." }),
        p1Section(10, { id: "OBJ8", label: "Paper 1: Part B, Poetry", heading: "POETRY", numberFrom: 71, rubric: "Answer the ten questions numbered 71 to 80 on the poems below.", hint: "TEN questions on poetry. Write two ORIGINAL short poems of 8 lines each at the start of questions 71 and 76 ('Read the following poem and answer questions 71 to 75.'). Questions test theme, imagery, tone, figures of speech (simile, metaphor, personification, irony), rhyme and structure; each has four options." }),
      ],
    }),
    paper2: { name: "ESSAY", marks: 100, minutes: 120,
      intro: ["Answer **three** questions in all: **one** question from Section A and **all** the questions in Sections B and C."],
      cover: booklet2("This booklet consists of **three** sections: **A**, **B** and **C**. Answer **three** questions in all: **one** question from section **A** and **all** the questions in sections **B** and **C**."),
      sections: [
        sec({ id: "A", label: "Section A: Essay", type: "essay", heading: "SECTION A", sub: "ESSAY", rubric: "Answer **one** question only from this section.\nAll questions carry equal marks. Your answer should not be less than **450** words.\nYou are advised to spend about **50** minutes on this section.", questionCount: 5, marksPerQuestion: 50, answerAny: 1, numberFrom: 1, showPartMarks: false,
          hint: "FIVE composition prompts of 50 marks each (candidates answer one), each one or two sentences in a realistic Ghanaian situation: a letter to a friend or to an official (formal or informal, with a stated purpose and three points), an article for a magazine or newspaper, a speech, a narrative ending with a given sentence ('... I woke up and it was all a terrible dream.'), and a discussion or argumentative essay. Mix the five types." }),
        sec({ id: "B", label: "Section B: Comprehension", heading: "SECTION B", sub: "COMPREHENSION", rubric: "You are advised to spend about **30** minutes on this section.", questionCount: 1, marksPerQuestion: 20, numberFrom: 6, showPartMarks: false,
          hint: "ONE question of 20 marks: 'Read the following passage carefully and answer the questions on it.' The WHOLE passage (about 450 words, a narrative about a named Ghanaian, in four paragraphs) goes in the question text. Then parts (a) to (f) of short direct comprehension questions, one part on a figure of speech in a quoted expression, one on the grammatical name and function of a quoted phrase, and a final part 'For each of the following words, find another word or phrase that means the same and which can replace it as it is used in the passage' with sub-parts (i) to (vi). Marks add up to 20 (not printed against parts)." }),
        sec({ id: "C", label: "Section C: Summary", heading: "SECTION C", sub: "SUMMARY", rubric: "You are advised to spend about **40** minutes on this section.", questionCount: 1, marksPerQuestion: 30, numberFrom: 7, showPartMarks: false,
          hint: "ONE question of 30 marks: 'Read the following passage carefully and answer the questions on it.' The WHOLE passage (about 450 words, an argumentative or expository text of five paragraphs) goes in the question text. Then (a) 'In three sentences, one for each, summarise the factors that ...' and (b) 'In three sentences, one for each, summarise the factors that hinder ...'. Marks add up to 30 (not printed against parts)." }),
      ] },
  },

  "General Science": {
    label: "Integrated Science", verified: true, unverified: ["Paper 1 duration (assumed 1 hour)", "Paper 3 (practical) is not generated"],
    scheme: "points", schemeNotes: NOTES_SCIENCE, order: "12", calculators: true, examinerBox: true,
    paper1: paper1(50, 60, { hint: SCI_P1_HINT + " Because Integrated Science covers physics, chemistry, biology, agriculture and earth science, spread the questions across all of these." }),
    paper2: { name: "ESSAY", marks: 80, minutes: 90,
      intro: ["Answer **four** questions only from this section.", CREDIT, "All questions carry equal marks."],
      cover: booklet2("This booklet consists of **six** questions. Answer **four** questions in all.\nAll questions carry equal marks."),
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 20, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 20 marks each (candidates answer any four). Every question has FOUR parts (a) to (d) of 5 marks each, and each part has two sub-parts (i) and (ii) from DIFFERENT areas, mixing physics (electricity, waves, energy), chemistry (atomic structure, mole calculation, acids, organic reactions), biology (human systems, ecology, genetics) and agriculture (poultry, goats, rabbits, pigs, farm records). Typical items: 'What are exotic breeds?' [2] and 'State **three** advantages of ...' [3]; 'Define relative atomic mass' [2] and 'Calculate the molar mass of each of the following compounds' [4]; 'Draw a diagram to show the electron configuration of ...' [4]; 'Two lamps of resistances 3 Ω and 5 Ω are connected in parallel to a 6 V source. Calculate the current' [3]. Marks per sub-part are printed. Marks of the parts add up to 20." }),
      ] },
  },

  "Social Studies": {
    label: "Social Studies", verified: true, unverified: ["Marking scheme layout (the supplied files are question papers)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 50, { hint: "Short, clear stems with four options lettered A to D, in the style of WASSCE Social Studies: concept and application questions set in Ghanaian situations ('The most effective way of abolishing outmoded socio-cultural practices is through ...'), 'which of the following is NOT ...' (write the word as **not**), and a few statement questions. Spread the questions across the three themes: The Environment; Governance, Politics and Stability; Social and Economic Development." }),
    paper2: { name: "ESSAY", marks: 100, minutes: 180,
      intro: ["Answer **five** questions in all, choosing at least **one** and not more than **two** questions from each section."],
      cover: booklet2("This booklet consists of **three** sections; **A**, **B** and **C**. Answer **five** questions in all, choosing at least **one** and not more than **two** questions from each section.\nAll questions carry equal marks."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "THE ENVIRONMENT", rubric: "", questionCount: 4, marksPerQuestion: 20, countedMarks: 40, numberFrom: 1, hideSecMarks: true,
          hint: "FOUR questions of 20 marks each on the theme THE ENVIRONMENT (personal development and Maslow's hierarchy of needs, funerals and development, formal education and social change, shared Ghanaian values and national cohesion). Use two shapes: a single 'Discuss five ways ...' / 'What five useful lessons ...' question [20], or (a) 'Identify any four ...' [4] with (b) 'In what four ways ...' [16]." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "GOVERNANCE, POLITICS AND STABILITY", rubric: "", questionCount: 3, marksPerQuestion: 20, countedMarks: 30, numberFrom: 5, hideSecMarks: true,
          hint: "THREE questions of 20 marks each on the theme GOVERNANCE, POLITICS AND STABILITY (rights and responsibilities, the 1992 Constitution, political independence and self-reliance, bilateral and multilateral co-operation, the UN). Each has (a) 'State / Distinguish between ...' [4] and (b) 'Highlight / Discuss / Outline four ...' [16]." }),
        sec({ id: "C", label: "Section C", heading: "SECTION C", sub: "SOCIAL AND ECONOMIC DEVELOPMENT", rubric: "", questionCount: 3, marksPerQuestion: 20, countedMarks: 30, numberFrom: 8, hideSecMarks: true,
          hint: "THREE questions of 20 marks each on the theme SOCIAL AND ECONOMIC DEVELOPMENT (standard of living, social intervention policies, population growth and the environment, economic growth and social development). Use the same two shapes as the other sections: a single 'What five ...' question [20] or (a) [4] with (b) [16]." }),
      ] },
  },

  "Information Communication Technology": {
    label: "Information and Communications Technology (Elective)", verified: true, unverified: ["Paper 3 (practical, 2 hours on computers) is not generated"],
    scheme: "points", schemeNotes: NOTES_GENERIC, order: "12", answerInPaper: true, examinerBox: true,
    paper1: paper1(50, 60, { hint: "Short, clear stems with four options lettered A to D on ICT: computer systems, number systems and conversions, word processing, spreadsheets, databases, programming and algorithms, networks and the Internet, e-business, ICT security ('The act of gaining unauthorised access to a restricted computer facility is called ...'), systems development. Include a few Roman-numeral questions ('Consider the following information systems: I. ... II. ...')." }),
    paper2: { name: "ESSAY", marks: 30, minutes: 60,
      intro: ["Answer **three** questions only. All questions carry equal marks."],
      cover: booklet2("This booklet contains **five** questions. You are required to answer **three** questions only. All questions carry equal marks. Paper 2 will last 1 hour after which the booklet will be collected.", ["Write boldly and legibly in **ink** and state your answers precisely.", "Write your answers within the spaces provided."]),
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 5, marksPerQuestion: 10, answerAny: 3, numberFrom: 1,
          hint: "FIVE questions of 10 marks each (candidates answer any three), each with parts (a) to (c) on different topics and marks such as 6+4 or 4+3+3: number-system conversions (hexadecimal to decimal, binary to octal), describing the effect of e-business on an application area, word processing or spreadsheet formulae, flowcharts and pseudocode, database design, networks and ICT security. Marks of the parts add up to 10." }),
      ] },
  },

  "Graphic Design": {
    label: "Graphic Design", verified: true, unverified: ["Practical work is not generated"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(40, 50),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions only.", CREDIT],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 15, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 15 marks each (candidates answer any four): a 'Discuss five ...' question [15]; a business-plan style question with (a) explain [3], (b) describe five key contents [10], (c) list two [2]; a printing question (serigraphy, silk-screen lacquer method) with (a) [3], (b) [3], (c) step-by-step [9]; a lettering and typography question (serif, Roman letters, types of serifs with illustrations); a packaging question; and 'With the aid of illustration, describe each of the following: (a) ... (e) ...' [15]." }),
      ] },
  },
};

const ARTS_P1_HINT = "Short, clear stems with four options lettered A to D, in the WASSCE style for this subject: definitions, causes and effects, application to Ghana and West Africa, and 'which of the following is NOT ...' questions (write the word as **not**). Spread the questions across the selected topics.";
const NOTES_ACCOUNTS = ["Award marks for each correct figure and each correct entry; a correct figure carried forward from an earlier error is not penalised again.", "Accept any other correct format of the statement, account or ledger as long as the figures are correct and clearly labelled.", "Penalise once only for missing headings, dates or narrations.", "Where a question asks for a list of points, mere mention of a point = 1 mark; a point with explanation = full marks."];
const ACCOUNTS_HINT = " Present every ledger account, trial balance, income statement and statement of financial position as a pipe table, one row per line, with the columns the candidate must complete left empty (| |). Use GH¢ and realistic Ghanaian trading names. Give every figure the candidate needs.";

Object.assign(WASSCE_PROFILES, {
  "Government": {
    label: "Government", verified: true, unverified: ["Paper 1 duration (assumed 1 hour)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 60, { hint: ARTS_P1_HINT }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions in all, choosing any **two** questions from Section A and any **two** questions from Section B.", "All questions carry equal marks."],
      cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **four** questions in all: any **two** questions from section **A** and any **two** questions from section **B**."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "ELEMENTS OF GOVERNMENT", rubric: "Answer **two** questions only from this section.", questionCount: 5, marksPerQuestion: 15, answerAny: 2, numberFrom: 1,
          hint: "FIVE questions of 15 marks each (candidates answer any two) on the elements of government (democracy, limits on the powers of government, independence of the judiciary, public opinion, local government). Mostly one-part questions in the WASSCE form 'Highlight five ...', 'Explain five ...', 'Outline five ...', 'Identify five ...' (about 3 marks a point), and occasionally (a) 'State three ...' [6] with (b) 'Highlight three ...' [9]." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "POLITICAL AND CONSTITUTIONAL DEVELOPMENTS IN WEST AFRICA AND INTERNATIONAL RELATIONS", rubric: "Answer **two** questions only from this section.", questionCount: 5, marksPerQuestion: 15, answerAny: 2, numberFrom: 6,
          hint: "FIVE questions of 15 marks each (candidates answer any two) on political and constitutional developments in Ghana and West Africa and on international relations (post-war nationalism, the 1992 Constitution and the powers of the President, military rule, foreign policy of Ghana, ECOWAS). Same question shapes as Section A." }),
      ] },
  },

  "Accounting": {
    label: "Financial Accounting", verified: true, unverified: ["Paper 1 duration (assumed 1 hour)"],
    scheme: "table", schemeNotes: NOTES_ACCOUNTS, order: "12", calculators: true, examinerBox: true,
    paper1: paper1(50, 60, { hint: "Short, clear stems with four options lettered A to D on financial accounting: accounting concepts and principles, books of original entry, ledger and trial balance, bank reconciliation, petty cash, final accounts, not-for-profit accounts, departmental and branch accounts, partnerships and company accounts. Include calculation questions with the figures given in GH¢ and a few Roman-numeral questions." }),
    paper2: { name: "ESSAY", marks: 75, minutes: 150,
      intro: ["This paper consists of **two** sections, **A** and **B**. Answer **two** questions from Section A and **three** questions from Section B.", "You are reminded of the importance of clarity of expression and orderly presentation of relevant material.", "Calculators may be used but all workings must be shown."],
      cover: booklet2("This booklet consists of **two** sections; **A** and **B**. Answer **five** questions in all: **two** questions only from section **A** and **three** questions from section **B**.", ["Calculators may be used but all workings must be shown."]),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "THEORY OF FINANCIAL ACCOUNTING", rubric: "Answer **two** questions only from this section.", questionCount: 4, marksPerQuestion: 15, answerAny: 2, numberFrom: 1,
          hint: "FOUR theory questions of 15 marks each (candidates answer any two), each with parts (a), (b), (c) and marks such as 3+12 or 3+4+8: 'What are accounting concepts?' [3] then 'Explain the following accounting concepts: (i) business entity; (ii) accrual; (iii) going concern ...' [12]; petty cash and the imprest system; terms in not-for-profit accounts and the features of an income and expenditure account; a bank reconciliation statement with items such as uncredited cheques." + ACCOUNTS_HINT }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **three** questions only from this section.", questionCount: 5, marksPerQuestion: 15, answerAny: 3, numberFrom: 5,
          hint: "FIVE practical questions of 15 marks each (candidates answer any three), each giving a trader's information or balances and asking for statements: incomplete records (trading and profit and loss account and statement of financial position), departmental accounts for two departments, branch accounts, company accounts (issue of shares, final accounts), partnership accounts. Each question lists the figures in a clear pipe table or numbered list and asks for the statements in parts (a), (b)." + ACCOUNTS_HINT }),
      ] },
  },

  "Economics": {
    label: "Economics", verified: true, unverified: ["Paper 2 layout taken from WAEC's published scheme and the 2025 paper text, not from a scan"],
    sources: ["WAEC Economics syllabus (Paper 2: 80 marks, 2 hours; Section A two data-response questions, answer one; Section B six questions, answer three)", "supplied 2021 Paper 1 (50 objective questions, 1 hour)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 60, { hint: ARTS_P1_HINT + " Include simple calculation questions (elasticity, national income, price index) with the figures given, and questions that read a supply and demand schedule given as a table." }),
    paper2: { name: "ESSAY", marks: 80, minutes: 120,
      intro: ["Answer **four** questions in all: **one** question only from Section A and any **three** questions from Section B.", "You are reminded of the importance of clarity of expression and orderly presentation of relevant materials.", "All questions carry equal marks."],
      cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **four** questions in all: **one** question only from section **A** and any **three** questions from section **B**."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "DATA RESPONSE", rubric: "Answer **one** question only from this section.", questionCount: 2, marksPerQuestion: 20, answerAny: 1, numberFrom: 1,
          hint: "TWO data-response questions of 20 marks each (candidates answer one). Each opens with a table or short data set the candidate must read (a utility schedule of a consumer, a government revenue and expenditure table with percentages, a table of demand and supply, national income figures) written as a pipe table, then parts (a) to (e) of 2 to 6 marks each that ask the candidate to read, calculate and explain from the data ('What percentage of total revenue was collected as indirect tax?', 'State two examples of non-tax revenue', 'What was the budget surplus or deficit? Explain your answer', 'At what level of consumption is the consumer in equilibrium? Explain'). Marks of the parts add up to 20." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **three** questions only from this section.", questionCount: 6, marksPerQuestion: 20, answerAny: 3, numberFrom: 3,
          hint: "SIX essay questions of 20 marks each (candidates answer any three), each with parts (a), (b), (c) and marks such as 2+9+9, 4+8+8 or 4+12: define a term ('Define indigenization', 'Define money'), then explain, outline or state three or four points with marks per point (private limited company against sole proprietorship, objectives of OPEC, minimum wage effects, features and advantages of a table in economic analysis), and one short calculation or diagram question (elasticity, a demand and supply schedule). The six questions cover different areas: Ghanaian and West African economy, public finance, money and banking, production and costs, international trade, market structures." }),
      ] },
  },

  "Business Management": {
    label: "Business Management", verified: true, unverified: ["Paper 2 duration read as 2 hours from the supplied 2021 paper cover"],
    sources: ["supplied 2021 paper: 'This booklet contains eight questions. Answer Question 1 (compulsory) and three other questions' [70 marks], Paper 1 [50 marks] 1 hour", "WAEC Business Management syllabus (case study of 200-250 words for 25 marks, seven essay questions of 15 marks)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 60, { hint: ARTS_P1_HINT }),
    paper2: { name: "ESSAY", marks: 70, minutes: 120,
      intro: ["Answer **four** questions in all: Question **1** (compulsory) and **three** other questions.", CREDIT],
      cover: booklet2("This booklet contains **eight** questions. You are required to answer Question **1** (compulsory) and **three** other questions."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "", rubric: "", questionCount: 1, marksPerQuestion: 25, numberFrom: 1, sectionless: true,
          hint: "ONE compulsory case-study question of 25 marks: a case of 200 to 250 words about a named Ghanaian business (its history, products, owners, staff, a problem with sales, finance, motivation or management) printed in full in the question text, followed by parts (a) to (d) with marks printed per part such as 4+6+6+9: identify the type of business or the management problem, explain how it arises, describe the role of a named officer, and recommend how the business can overcome its problems." }),
        sec({ id: "B", label: "Section B", heading: "", rubric: "", questionCount: 7, marksPerQuestion: 15, answerAny: 3, numberFrom: 2, sectionless: true,
          hint: "SEVEN questions of 15 marks each (candidates answer any three), each (a) 'What is ... / Explain the term ...' [3] and (b) 'Explain / State / Outline five ...' [12] (or parts such as 4+11), on different topics: motivation, contracts and their conditions, production, responsibilities of a business towards groups, bank accounts, forms of business ownership, marketing, human resources." }),
      ] },
  },

  "Christian Religious Studies": {
    label: "Christian Religious Studies", verified: true, unverified: ["Paper 3 / practical not applicable"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(40, 60, { hint: "Short, clear stems with four options lettered A to D on the Bible passages and themes in the syllabus (Old Testament narratives, the life of Jesus and the early Church, Christian living). Questions are direct recall and application ('Before Joseph came to Pharaoh after his release from prison, Joseph ...')." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions in all, choosing one question from **each** section and the fourth from either section **A** or **B**.", "All questions carry equal marks."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "OLD TESTAMENT", rubric: "Answer at least **one** question from this section.", questionCount: 4, marksPerQuestion: 15, countedMarks: 30, hideSecMarks: true, numberFrom: 1,
          hint: "FOUR questions of 15 marks each on Old Testament narratives (Cyrus and the return from exile, Joseph and Pharaoh, Jezebel and Naboth, God's promises to Joshua). Each has (a) a narrate / outline / highlight task [9 to 12] and (b) a short 'State / Explain three ...' [3 to 6] that links the story to Christian life." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "NEW TESTAMENT", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 15, countedMarks: 15, hideSecMarks: true, numberFrom: 5,
          hint: "THREE questions of 15 marks each on the New Testament and the early Church (Herod Agrippa and James, discrimination in the early Church, Saul in Damascus). Same shape as Section A." }),
        sec({ id: "C", label: "Section C", heading: "SECTION C", sub: "CHRISTIAN LIVING", rubric: "Answer **one** question only from this section.", questionCount: 2, marksPerQuestion: 15, countedMarks: 15, hideSecMarks: true, numberFrom: 8,
          hint: "TWO questions of 15 marks each on Christian living (the responsible citizen according to Peter, conditions for answered prayer, and similar themes). Same shape as Section A." }),
      ] },
  },

  "Geography": {
    label: "Geography", verified: true, unverified: ["Paper 3 (map work and physical geography, 1h50) is not generated", "Paper 1 duration read as 1 hour from WAEC's scheme"],
    sources: ["supplied 2021 paper (2&1 booklet, 3 hours): Paper 2 2 hours, answer four questions", "WAEC Geography syllabus: Paper 2 has nine essay questions in three sections A, B and C, three each; candidates in Ghana answer four with at least one from each section, 80 marks"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(50, 60, { hint: "Short, clear stems with four options lettered A to D on physical and human geography, map reading and the geography of Ghana and Africa. Include a few questions that use a small table of data or a described map." }),
    paper2: { name: "HUMAN AND REGIONAL GEOGRAPHY", marks: 80, minutes: 120,
      intro: ["Answer **four** questions in all, choosing at least **one** question from **each** of Sections A, B and C.", "All questions carry equal marks."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "HUMAN GEOGRAPHY", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 20, countedMarks: 40, hideSecMarks: true, numberFrom: 1,
          hint: "THREE questions of 20 marks each on economic and human geography (population and population density with a data table, tourism, settlement, industry). Each has parts (a), (b), (c) with marks such as 2+10+8 or 4+8+8, and one question gives a table to calculate from." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "REGIONAL GEOGRAPHY OF GHANA", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 20, countedMarks: 20, hideSecMarks: true, numberFrom: 4,
          hint: "THREE questions of 20 marks each specific to Ghana: a sketch map of Ghana on which the candidate locates named places (Akosombo dam, Volta Lake, Kpong), a question on the size, location and position of Ghana, vegetation (savanna and forest) and resources, and a question on industries (towns, contributions, problems). Marks per part printed, such as 1+2+2+1 for the map and 6 and 8 for the written parts." }),
        sec({ id: "C", label: "Section C", heading: "SECTION C", sub: "GEOGRAPHY OF AFRICA", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 20, countedMarks: 20, hideSecMarks: true, numberFrom: 7,
          hint: "THREE questions of 20 marks each on the regional geography of Africa (climate and vegetation regions, population and migration, agriculture, mining and the economies of regions such as North Africa, the Nile basin or Southern Africa). Marks per part printed. Describe any sketch map in words." }),
      ] },
  },

  "Literature in English": {
    label: "Literature-in-English", verified: false, unverified: ["The genre set in Paper 2 changes every year (prose, drama or poetry): prose is used here", "Number of Paper 2 questions per section (assumed 4)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(50, 60, { sections: [
      p1Section(30, { id: "OBJ1", label: "Paper 1: Section A", heading: "SECTION A", sub: "GENERAL KNOWLEDGE OF LITERATURE", numberFrom: 1, rubric: "Answer **all** the questions in this section.", hint: "THIRTY questions in three groups. Questions 1 to 20: general knowledge of literature (terms and devices such as aside, soliloquy, irony, satire, flashback, genres, features of prose, drama and poetry, figures of speech). Questions 21 to 25: an unseen prose passage: write ONE original passage of about 90 words in the first of these questions with the line 'Read the following passage and answer questions 21 to 25.' and ask about meaning, tone, characters and devices. Questions 26 to 30: an unseen poem: write ONE original poem of 8 to 12 lines in question 26 with 'Read the following poem and answer questions 26 to 30.' Each question has four options." }),
      p1Section(20, { id: "OBJ2", label: "Paper 1: Section B", heading: "SECTION B", sub: "THE PRESCRIBED SHAKESPEAREAN TEXT", numberFrom: 31, rubric: "Answer **all** the questions in this section.", hint: "TWENTY context questions on the prescribed Shakespearean text named in the topics. Each question gives a short ORIGINAL paraphrase of a moment in the play (never quote the play's lines) and asks who is speaking or being addressed, what has just happened, the speaker's motive, a device or the theme. Four options each." }),
    ] }),
    paper2: { name: "PROSE", marks: 50, minutes: 90,
      intro: ["Answer **two** questions in all; **one** question from each section. Develop not fewer than **five** points in your answers."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "AFRICAN PROSE", rubric: "Answer **one** question only from this section.", questionCount: 4, marksPerQuestion: 25, answerAny: 1, numberFrom: 1,
          hint: "FOUR essay questions of 25 marks each (candidates answer one) on the African prose texts named in the topics, two per text, as a single task: 'Examine three instances of ... in the novel.', 'Discuss the meeting of ... and ...', 'Consider ... as a woman of faith and courage.' Name the author and text above each pair, for example 'BUCHI EMECHETA: Second Class Citizen'." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "NON-AFRICAN PROSE", rubric: "Answer **one** question only from this section.", questionCount: 4, marksPerQuestion: 25, answerAny: 1, numberFrom: 5,
          hint: "FOUR essay questions of 25 marks each (candidates answer one) on the non-African prose texts named in the topics, two per text, in the same form as Section A ('Comment on the character of ...', 'Compare ... to ... in the novel.', 'Examine the role of ... in the development of the plot.')." }),
      ] },
  },

  "Management in Living": {
    label: "Management in Living", verified: true, unverified: [],
    sources: ["supplied 2021 paper (2&1 booklet, 3 hours): Paper 2 [100 marks] 2 hours, answer four questions only, six questions; Paper 1 [60 marks] 1 hour"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(60, 60, { hint: "Short, clear stems with four options lettered A to D on management in living: management concepts, goals and values, family and marriage, health and sanitation, housing, consumer education, money and investment, time and energy management. Questions are direct recall and application in Ghanaian home and community situations, and a few 'which of the following is NOT ...' questions (write the word as **not**)." }),
    paper2: { name: "ESSAY", marks: 100, minutes: 120,
      intro: ["Answer **four** questions only.", "All questions carry equal marks.", CREDIT],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 25, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 25 marks each (candidates answer any four), each with four or five parts (a) to (d) or (e) and sub-parts (i), (ii), with marks printed such as 2+5+10+8, 4+3+4+6+8 or 1+2+10+12. Typical command words: 'Explain the concept ...' [2], 'State five characteristics of ...' [5], 'Explain five factors that affect ...' [10], 'Explain four types of goals' [8], 'Differentiate between ... and ...' [4], 'List the three forms of ...' [3]. The six questions cover different areas: management and goals, family life and marriage, health and sanitation, housing, money and investment (insurance, premium, policy), and consumer matters. Marks of the parts add up to 25." }),
      ] },
  },

  "Textiles": {
    label: "Textiles", verified: true, unverified: [],
    sources: ["supplied 2021 paper (2&1 booklet, 2 hours 50 minutes): Paper 2 [60 marks] 2 hours, answer four questions only, six questions; Paper 1 50 minutes [40 marks]"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(40, 50, { hint: "Short, clear stems with four options lettered A to D on textiles: fibres and their identification, yarns, weaving and weaving calculations, knitting, dyeing and printing, finishing, fabric care labels, Ghanaian traditional fabrics (adinkra, kente), textile design, careers and safety." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions only.", "All questions carry equal marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 15, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 15 marks each (candidates answer any four), each with two or three parts and marks printed such as 3+12, 4+9+2, 3+12, 2+10+3, 10+2+3 or 9+3+3: 'Describe texture in textile design' [3] with 'Give six reasons for using textures' [12]; fibre identification and the burning test for linen, silk and nylon; a weaving calculation with the loom width, length, reed size and warp pattern given (total number of ends, width of a colour, heddles per shaft); 'Define textiles' with five reasons for studying it and three careers; block printing problems and methods of fixing; describing Ghanaian traditional fabrics such as adinkra and kente and their significance. One question may ask the candidate to identify care labels or draw a labelled diagram (give it as a [FIGURE: ...] line)." }),
      ] },
  },

  "Basketry": {
    label: "Basketry", verified: true, unverified: [],
    sources: ["supplied 2021 paper (2&1 booklet, 2 hours 50 minutes): Paper 2 [60 marks] 2 hours, answer four questions only; Paper 1 50 minutes (40 questions)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(40, 50, { hint: "Short, clear stems with four options lettered A to D on basketry: raw materials (cane, bamboo, raffia), treatment, tools and their safe use, weaving and plaiting techniques, finishing, design, marketing of basketry articles and safety." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions only.", "All questions carry equal marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 15, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 15 marks each (candidates answer any four), each with two or three parts and marks printed such as 8+4+3, 3+6+6 or 8+4+3: 'In four steps, describe open-air treatment of bamboo' [8], 'State three precautionary measures when using the knife' [3], 'Explain braiding in basketry' [3], 'Describe three ways of finishing the edge of a basket' [6], 'Illustrate the plaiting process using three weavers' [8], 'With the aid of illustration, describe the bodkin tool' [4], and factors that promote the sale of a basketry article. Diagrams are asked for in words ('with the aid of illustration')." }),
      ] },
  },

  "Leatherwork": {
    label: "Leatherwork", verified: true, unverified: [],
    sources: ["supplied 2021 paper (2&1 booklet, 2 hours 50 minutes): Paper 2 [60 marks] 2 hours, answer four questions only; Paper 1 50 minutes (40 questions)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(40, 50, { hint: "Short, clear stems with four options lettered A to D on leatherwork: hides and skins, tanning and finishing (scorching, nappa), tools and equipment, decoration and carving, product making, safety and marketing." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions only.", "All questions carry equal marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 15, answerAny: 4, numberFrom: 1,
          hint: "SIX questions of 15 marks each (candidates answer any four), each with two or three parts and marks printed such as 6+3+6, 'List six animals whose hides can be carved' [6], 'State six significance of tanning hides' [6], and one question that asks the candidate to describe, with the aid of illustration, each of several terms or finishes (such as scorching or nappa leather) [15 marks in all]." }),
      ] },
  },

  "General Knowledge in Art": {
    label: "General Knowledge in Art", verified: true, unverified: [],
    sources: ["supplied 2021 paper (2&1 booklet, 2 hours 20 minutes): Paper 2 [60 marks] 1½ hours, answer three questions only (five questions); Paper 1 50 minutes (40 questions)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "21", booklet: "combined", examinerBox: true,
    paper1: paper1(40, 50, { hint: "Short, clear stems with four options lettered A to D on general knowledge in art: elements and principles of design, art appreciation, creative environment, art of West Africa and Ghana, pre-historic, Egyptian and Western art, tools and materials, careers and tourist sites." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 90,
      intro: ["Answer **three** questions only.", "All questions carry equal marks.", "Credit will be given for clarity of expression and orderly presentation of material."],
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 5, marksPerQuestion: 20, answerAny: 3, numberFrom: 1,
          hint: "FIVE questions of 20 marks each (candidates answer any three), each with two or three parts and marks such as 2+18, 6+12, 2+6+12 or 4+8+8: a question on a pictured work ([FIGURE: ...] line) asking the candidate to name the elements and, using the steps in appreciation, write an appreciation; 'List six tourist sites in Ghana' [6] with an explanation [12]; 'State two characteristics of a creative environment' [2]; and a question on a labelled figure asking for the function of each labelled line [8]. Marks of the parts add up to 20." }),
      ] },
  },

  "Principles of Cost Accounting": {
    label: "Principles of Cost Accounting", verified: true, unverified: ["Paper 1 marks (WAEC weights it 25; the paper itself prints no mark total)"],
    sources: ["supplied 2021 paper (2&1 booklet, 3 hours): Paper 2 2 hours, two questions from Section A and three from Section B, 15 marks each (nine questions), calculators allowed; Paper 1 1 hour"],
    scheme: "table", schemeNotes: NOTES_ACCOUNTS, order: "21", booklet: "combined", calculators: true, examinerBox: true,
    paper1: paper1(50, 60, { hint: "Short, clear stems with four options lettered A to D on cost accounting: elements of cost, cost classification, material and labour costing, overheads, job and process costing, marginal costing, budgets, standard costing. Include calculation questions with the figures given in GH\u00a2." }),
    paper2: { name: "ESSAY", marks: 75, minutes: 120,
      intro: ["This paper consists of **two** sections, **A** and **B**. Answer **two** questions from Section A and **three** questions from Section B.", "You are reminded of the importance of clarity of expression and orderly presentation of relevant material.", "Calculators may be used but all workings must be shown."],
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "THEORY", rubric: "Answer **two** questions only from this section.", questionCount: 4, marksPerQuestion: 15, answerAny: 2, numberFrom: 1,
          hint: "FOUR theory questions of 15 marks each (candidates answer any two) with marks such as 3+12 or 3+6+6: 'What is cost?' [3] with explanation of cost concepts [12]; methods of remuneration (time rate, piece rate, bonus schemes); cost units for different firms; 'What is a budget?' [3] with 'Outline six benefits of a budget to an organisation' [12]." + ACCOUNTS_HINT }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "PRACTICE", rubric: "Answer **three** questions only from this section.", questionCount: 5, marksPerQuestion: 15, answerAny: 3, numberFrom: 5,
          hint: "FIVE practical questions of 15 marks each (candidates answer any three), each giving figures in a pipe table or numbered list: interlocking accounts for a manufacturing firm (transactions for a named month), a job-cost statement for a tailor or similar firm with overhead absorption, process costing, a marginal costing statement with contribution and break-even, and a trading and profit statement for a sole trader." + ACCOUNTS_HINT }),
      ] },
  },

  "Food and Nutrition": {
    label: "Foods and Nutrition", verified: false, unverified: ["Paper 2 was not in the supplied papers: taken from WAEC's published scheme (six essay questions, answer four, 40 marks, 1 hour 15 minutes)", "Paper 3 (practical, 3 hours) is not generated"],
    sources: ["supplied 2021 Paper 1 [60 marks] 1 hour", "WAEC Foods and Nutrition syllabus (Paper 2: six essay questions, answer four, 1 hour 15 minutes, 40 marks)"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(60, 60, { hint: "Short, clear stems with four options lettered A to D on foods and nutrition: food nutrients and their sources and deficiency diseases, meal planning and special nutritional needs, kitchen tools and equipment, food preparation methods, food preservation and storage, hygiene and safety, food business. Questions are direct recall and application in Ghanaian food situations." }),
    paper2: { name: "ESSAY", marks: 40, minutes: 75,
      intro: ["Answer **four** questions only.", "All questions carry equal marks."],
      cover: booklet2("This booklet contains **six** questions. You are required to answer **four** questions only. All questions carry equal marks."),
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 10, answerAny: 4, numberFrom: 1,
          hint: "SIX short essay questions of 10 marks each (candidates answer any four), each with parts (a), (b), (c) and marks such as 2+4+4 or 3+7: define a term, state or explain points (functions and sources of a nutrient, factors to consider when planning a meal, rules of kitchen safety and hygiene, methods of food preservation) and one short practical-planning item. Marks of the parts add up to 10." }),
      ] },
  },

  "Agriculture": {
    label: "General Agriculture", verified: false, unverified: ["Taken from WAEC's published scheme, no scan was supplied", "Paper 3 (practical) is not generated"],
    sources: ["WAEC General Agriculture syllabus: Paper 1 fifty objective questions, 1 hour, 50 marks; Paper 2 ten essay questions in five sections A to E (two each), answer one from each section, 16 marks each, 2 hours"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 60, { hint: "Short, clear stems with four options lettered A to D on general agriculture: soil and its management, crop production, animal production and health, farm tools and machinery, agricultural economics and marketing, forestry and fisheries, agro-processing. Write chemical names with proper subscripts." }),
    paper2: { name: "ESSAY", marks: 80, minutes: 120,
      intro: ["Answer **five** questions in all: **one** question only from **each** of the five sections."],
      cover: booklet2("This booklet consists of **five** sections: **A**, **B**, **C**, **D** and **E**. Answer **five** questions in all, **one** question only from **each** section."),
      sections: ["A", "B", "C", "D", "E"].map((L, k) => sec({ id: L, label: `Section ${L}`, heading: `SECTION ${L}`, rubric: "Answer **one** question only from this section.", questionCount: 2, marksPerQuestion: 16, answerAny: 1, numberFrom: 1 + 2 * k,
        hint: ["SECTION A covers soil science and farm tools; ", "SECTION B covers crop production and protection; ", "SECTION C covers animal production and health; ", "SECTION D covers agricultural economics, farm records and marketing; ", "SECTION E covers forestry, fisheries and agro-processing; "][k] + "TWO questions of 16 marks each (candidates answer one), each with parts (a), (b), (c) with marks such as 4+6+6 or 3+5+8: define or state, explain or describe points with marks per point, and one short practical or diagram item. Marks of the parts add up to 16." })) },
  },

  "Agricultural Science": {
    label: "Agricultural Science", verified: false, unverified: ["Taken from WAEC's published scheme, no scan was supplied", "Paper 3 (practical) is not generated"],
    sources: ["WAEC Agricultural Science syllabus: Paper 1 fifty objective questions, 50 minutes, 50 marks; Paper 2 six essay questions, answer five, 2 hours 10 minutes, 90 marks"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 50, { hint: "Short, clear stems with four options lettered A to D on agricultural science: agricultural ecology, soil, crop husbandry, animal husbandry (for example the device that regulates heat in an incubator), agricultural economics and extension, farm machinery." }),
    paper2: { name: "ESSAY", marks: 90, minutes: 130,
      intro: ["Answer **five** questions only.", "All questions carry equal marks."],
      cover: booklet2("This booklet contains **six** questions. You are required to answer **five** questions only. All questions carry equal marks."),
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 6, marksPerQuestion: 18, answerAny: 5, numberFrom: 1,
          hint: "SIX questions of 18 marks each (candidates answer any five), each drawn from at least two themes of the syllabus, with parts (a) to (c) and marks such as 4+6+8 or 6+12: definitions, explain or describe points with marks per point, calculations such as seed rates, feed rations, stocking rates or farm profit, and one diagram item as a [FIGURE: ...] line. Marks of the parts add up to 18." }),
      ] },
  },

  "History": {
    label: "History", verified: false, unverified: ["Number of questions per section (three assumed) and Paper 1 mark weighting (WAEC weights Paper 1 at 40)"],
    sources: ["WAEC History syllabus: Paper 1 fifty objective questions, 1 hour; Paper 2 2 hours, three sections A, B and C, answer four questions with at least one from each section, 60 marks"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 60, { hint: "Short, clear stems with four options lettered A to D on West Africa and the wider world from earliest times to 2000: early states and empires, the trans-Saharan and Atlantic trade, European contact, colonial rule, nationalism and independence, ECOWAS and the African Union, the world wars and the United Nations. Use dates and names accurately." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **four** questions in all, choosing at least **one** question from **each** section.", "All questions carry equal marks."],
      cover: booklet2("This booklet consists of **three** sections: **A**, **B** and **C**. Answer **four** questions in all, choosing at least **one** question from **each** section."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "SECTION A", sub: "GHANA: EARLY PERIOD", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 15, countedMarks: 30, hideSecMarks: true, numberFrom: 1,
          hint: "THREE questions of 15 marks each on the national history of Ghana up to about 1800 (origins and migrations of peoples, the Akan states, the rise of Asante, early European contact and trade). One-part 'Highlight / Give / Outline five ...' questions [15] or (a) [5] with (b) [10]." }),
        sec({ id: "B", label: "Section B", heading: "SECTION B", sub: "GHANA: 19TH CENTURY AND COLONIAL RULE", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 15, countedMarks: 15, hideSecMarks: true, numberFrom: 4,
          hint: "THREE questions of 15 marks each on Ghana in the nineteenth century and under colonial rule (the Anglo-Asante wars, the Fante Confederation, the establishment of the Gold Coast colony, colonial administration, education, cocoa and the economy). Same shapes as Section A." }),
        sec({ id: "C", label: "Section C", heading: "SECTION C", sub: "GHANA: NATIONALISM AND INDEPENDENCE", rubric: "Answer at least **one** question from this section.", questionCount: 3, marksPerQuestion: 15, countedMarks: 15, hideSecMarks: true, numberFrom: 7,
          hint: "THREE questions of 15 marks each on nationalism, independence and the republic (the UGCC and the CPP, the 1948 disturbances, constitutional reforms, independence in 1957, the Nkrumah era, coups and the return to constitutional rule). Same shapes as Section A." }),
      ] },
  },

  "French": {
    label: "French", language: "French", verified: false, unverified: ["Taken from WAEC's published scheme, no scan was supplied", "Paper 3 (oral) is not generated"],
    sources: ["WAEC French syllabus: Paper 1 forty objective questions, 1 hour, 40 marks; Paper 2 two sections of three questions each (essay; letter writing), answer one from each, 1 hour 15 minutes, 40 marks"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(40, 60, { hint: "Questions entirely in French with four options lettered A to D: grammar (articles, prepositions, tenses, pronouns), vocabulary, comprehension of short passages written in French, and background studies of the French-speaking world. Passages are original." }),
    paper2: { name: "ESSAY", marks: 40, minutes: 75,
      intro: ["Answer **two** questions in all: **one** question from Section A and **one** question from Section B."],
      cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **two** questions in all: **one** question from section **A** and **one** question from section **B**."),
      sections: [
        sec({ id: "A", label: "Section A: Essay", type: "essay", heading: "SECTION A", sub: "COMPOSITION", rubric: "Answer **one** question only from this section.", questionCount: 3, marksPerQuestion: 20, answerAny: 1, numberFrom: 1, showPartMarks: false,
          hint: "THREE composition topics of 20 marks each (candidates answer one), written in French, each a short situation with the expected length (about 150 words): a description, a narrative (une histoire), a dialogue or a discussion on a theme such as la vie scolaire, la famille, la santé, les loisirs, l'environnement." }),
        sec({ id: "B", label: "Section B: Letter writing", type: "essay", heading: "SECTION B", sub: "LETTRE", rubric: "Answer **one** question only from this section.", questionCount: 3, marksPerQuestion: 20, answerAny: 1, numberFrom: 4, showPartMarks: false,
          hint: "THREE letter-writing tasks of 20 marks each (candidates answer one), written in French: a letter to a friend (lettre amicale) or a formal letter (lettre formelle), each with a stated purpose, the person addressed and three points to cover (about 150 words)." }),
      ] },
  },

  "Islamic Religious Studies": {
    label: "Islamic Religious Studies", verified: false, unverified: ["Paper 2 duration and marks follow the WAEC Islamic Studies scheme (compulsory question plus any three, 100 marks, 2 hours); no scan was supplied"],
    sources: ["WAEC Islamic Religious Studies syllabus: Paper 1 fifty objective questions, 50 minutes, 50 marks; Paper 2 six essay questions, one compulsory"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(50, 50, { hint: "Short, clear stems with four options lettered A to D on Islamic religious studies: Tarikh (history of Islam), the Qur'an, Hadith, Tawhid and Fiqh. Use correct transliterations (Salat, Zakat, Sawm, Hajj)." }),
    paper2: { name: "ESSAY", marks: 100, minutes: 120,
      intro: ["Answer **four** questions in all: Question **1** (compulsory) and any **three** other questions.", "All questions carry equal marks."],
      cover: booklet2("This booklet contains **six** questions. You are required to answer Question **1** (compulsory) and any **three** other questions. All questions carry equal marks."),
      sections: [
        sec({ id: "A", label: "Section A", heading: "", rubric: "", questionCount: 1, marksPerQuestion: 25, numberFrom: 1,
          hint: "ONE compulsory question of 25 marks with parts (a) to (c) on the Qur'an, Hadith or Fiqh, marks printed per part." }),
        sec({ id: "B", label: "Section B", heading: "", rubric: "", questionCount: 5, marksPerQuestion: 25, answerAny: 3, numberFrom: 2,
          hint: "FIVE questions of 25 marks each (candidates answer any three) with parts (a) to (c), on Tarikh, the Qur'an, Hadith, Tawhid and Fiqh, marks printed per part." }),
      ] },
  },

  "Music": {
    label: "Music", verified: false, unverified: ["Taken from WAEC's published scheme, no scan was supplied", "Paper 3 (practical performance) is not generated; musical notation cannot be typeset, so notation items are described in words"],
    sources: ["WAEC Music syllabus: Paper 1 forty objective questions, 1 hour, 40 marks; Paper 2 five essay questions, answer three, 2 hours, 60 marks"],
    scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
    paper1: paper1(40, 60, { hint: "Short, clear stems with four options lettered A to D on music: rudiments (staff, clefs, note values, scales, intervals, time signatures), history of Western music, African and Ghanaian music, instruments, voices and choral music. Describe any note or interval in words (for example 'the note C in the treble clef') because notation cannot be printed." }),
    paper2: { name: "ESSAY", marks: 60, minutes: 120,
      intro: ["Answer **three** questions only.", "All questions carry equal marks."],
      cover: booklet2("This booklet contains **five** questions. You are required to answer **three** questions only. All questions carry equal marks."),
      sections: [
        sec({ id: "A", label: "Paper 2", heading: "", rubric: "", questionCount: 5, marksPerQuestion: 20, answerAny: 3, numberFrom: 1,
          hint: "FIVE questions of 20 marks each (candidates answer any three), each with parts (a) to (c): music theory (key signatures, scales and transposition described in words), history of music (composers and periods), African and Ghanaian music (instruments, forms, functions), and composition or harmony tasks described in words. Marks of the parts add up to 20." }),
      ] },
  },
});

/** Subjects with no supplied sample: still WASSCE-shaped, flagged as a generic default. */
const GENERIC = {
  label: "", verified: false, generic: true, unverified: ["No sample paper supplied for this subject: generic WASSCE shape used"],
  scheme: "points", schemeNotes: NOTES_POINTS, order: "12", examinerBox: true,
  paper1: paper1(50, 60),
  paper2: { name: "ESSAY", marks: 100, minutes: 150,
    intro: ["Answer **four** questions in all: Question 1 in Section A and **three** questions from Section B.", "All questions carry equal marks.", CREDIT],
    cover: booklet2("This booklet consists of **two** sections: **A** and **B**. Answer **four** questions in all: Question 1 in Section **A** and **three** questions from Section **B**."),
    sections: [
      sec({ id: "A", label: "Section A", heading: "SECTION A", rubric: "Answer **all** the questions in this section.", questionCount: 1, marksPerQuestion: 25, numberFrom: 1,
        hint: "ONE compulsory question of 25 marks with parts (a) to (e) on different topics, marks per part printed." }),
      sec({ id: "B", label: "Section B", heading: "SECTION B", rubric: "Answer **three** questions **only** from this section.", questionCount: 5, marksPerQuestion: 25, answerAny: 3, numberFrom: 2,
        hint: "FIVE questions of 25 marks each (candidates answer any three), each with parts (a) to (d) on different topics, marks per part printed." }),
    ] },
};

const ALIASES = {
  "Integrated Science": "General Science", "Science": "General Science",
  "Core Mathematics": "Mathematics", "General Mathematics": "Mathematics",
  "Elective Mathematics": "Additional Mathematics", "Further Mathematics": "Additional Mathematics", "Elective Maths": "Additional Mathematics",
  "ICT": "Information Communication Technology", "Information and Communications Technology": "Information Communication Technology", "Computing": "Information Communication Technology",
  "English": "English Language",
  "Clothing and Textiles": "Textiles", "General Agriculture": "Agriculture", "Art and Design Foundation": "General Knowledge in Art", "Foods and Nutrition": "Food and Nutrition", "Cost Accounting": "Principles of Cost Accounting", "Financial Accounting": "Accounting", "Islamic Studies": "Islamic Religious Studies", "Literature-in-English": "Literature in English", "Management In Living": "Management in Living",
};

/** WASSCE style applies to every SHS class (and so to every SHS mock exam). */
export const isWassceClass = (cls) => /^SHS\s*[123]$/i.test(String(cls || "").trim());

export function getWassceProfile(subject) {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const raw = String(subject || "").trim();
  const s = own(WASSCE_PROFILES, raw) || own(ALIASES, raw) ? raw : raw.replace(/\s*\([^)]*\)\s*$/, "");   // "Biology (GS)" -> "Biology"
  const key = own(ALIASES, s) ? ALIASES[s] : s;
  const p = own(WASSCE_PROFILES, key) ? WASSCE_PROFILES[key] : null;
  if (p) return { key, ...p };
  return { key: s, ...GENERIC, label: s || "Subject" };
}

/** All sections of a profile in printed order (Paper 1 first, or Paper 2 first for a "2&1" booklet). */
export function wassceSections(profile) {
  const extra = profile.showPartMarks === false ? { showPartMarks: false } : {};
  const p2 = (profile.paper2.sections || []).map((s, i) => ({ ...extra, ...s, paperStart: i === 0 }));
  const p1 = (profile.paper1.sections || []).map((s, i) => ({ ...s, paperStart: i === 0 }));
  return profile.order === "21" ? [...p2, ...p1] : [...p1, ...p2];
}

/** Total time for the sitting (Paper 1 + Paper 2). */
export const wassceTotalMinutes = (profile) => (profile.paper2.minutes || 0) + (profile.paper1.minutes || 0);

/** Booklet front-page wording, written the way the real WASSCE booklet reads. */
export function wassceBooklet(profile) {
  const p2 = profile.paper2, p1 = profile.paper1;
  const lines = ["Do not open this booklet until you are told to do so. While you are waiting, read and observe the following instructions carefully. Write your name and index number in the spaces provided above."];
  if (profile.order === "21") {
    lines.push(`This booklet consists of two papers. Answer Paper 2, which comes first, in your answer booklet and Paper 1 on your Objective Test answer sheet. Paper 2 will last ${minutesLabel(p2.minutes)}, after which the answer booklet will be collected. Do not start Paper 1 until you are told to do so. Paper 1 will last ${minutesLabel(p1.minutes)}.`);
  } else {
    lines.push(`This paper consists of two papers. Answer Paper 1 (Objective Test) first, on your Objective Test answer sheet. Paper 1 will last ${minutesLabel(p1.minutes)}. Paper 2 (Essay) follows in its own booklet and will last ${minutesLabel(p2.minutes)}. Do not start Paper 2 until you are told to do so.`);
  }
  if (profile.calculators) lines.push(CALC);
  return lines;
}

/** WASSCE booklets carry a code box: the subject with the paper number (or 2&1) and the time. */
export const wassceCoverCode = (profile) => {
  const combined = profile.order === "21";
  return {
    code: combined ? "2&1" : "1",
    subject: String((profile && profile.label) || "").toUpperCase(),
    kind: combined ? "Essay and Objective" : "Objective Test",
    duration: minutesLabel(combined ? wassceTotalMinutes(profile) : profile.paper1.minutes),
  };
};

/** Code box for the Paper 2 booklet of a subject printed as separate booklets. */
export const wasscePaper2Code = (profile) => ({
  code: "2", subject: String((profile && profile.label) || "").toUpperCase(), kind: "Essay", duration: minutesLabel(profile.paper2.minutes),
});

/** Marking conventions printed on the marking scheme. */
export const wassceSchemeNotes = (profile) => (profile && profile.schemeNotes) || NOTES_GENERIC;

/** Inline markup used in WASSCE text: **bold**, {{italic}}. Returns the plain text (for Word runs, prompts and tests). */
export const stripMarkup = (t) => String(t ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\{\{(.+?)\}\}/g, "$1");

/**
 * The WASSCE block added to every section prompt when examStyle === "wassce".
 * Kept in this file so the client and the server build the same text.
 */
export function wassceStyleBlock(cfg, section) {
  if (cfg.examStyle !== "wassce") return "";
  const isObj = section.type === "objective";
  const num = Number(section.numberFrom) || 1;
  const rubric = section.rubric ? `\n- Rubric printed above this section: "${stripMarkup(section.rubric).replace(/\n/g, " ")}".` : "";
  const pLang = getWassceProfile(cfg.subject).language;
  const langLine = pLang ? `\n- Language of the paper: write ALL question text, options, passages and the marking scheme answers in ${pLang} (the printed rubrics are already supplied). Use correct accents and punctuation.` : "";
  const answerAny = section.answerAny ? `\n- Candidates answer only ${section.answerAny} of the ${section.questionCount} questions here, so write ALL ${section.questionCount} questions at the same standard and the same mark value. Do not label any question "optional".` : "";
  const marksShown = section.showPartMarks === false
    ? "- Do NOT print marks against individual parts in the question text; still fill in each part's \"marks\" (they are used by the marking scheme)."
    : "- Marks for each lettered part are printed at the right as [n marks] by the paper layout; set them correctly on every part.";
  const head = `\n\nWASSCE-STYLE PAPER (this must read like a real WASSCE paper set by the West African Examinations Council for the West African Senior School Certificate Examination, school candidates)
- This is ${section.paper === 1 ? "Paper 1 (Objective Test)" : "Paper 2 (Essay)"}${section.heading ? `, ${section.heading}` : ""}${section.part ? ` (${section.part}${section.partSub ? `: ${section.partSub}` : ""})` : ""}.${rubric}
- Question numbers in this section start at ${num} (so the first question is ${num}) and run on in order.${answerAny}${langLine}`;
  const markup = `
- Text markup the layout understands: **word** prints in bold (use it for the number or command word WAEC emphasises: "State **three** ...", "**each**", "**not**", "**only**") and {{word}} prints in italics (scientific names, a term being defined). Use them sparingly, as the real papers do.
- Write scientific notation with proper characters: subscripts and superscripts as Unicode (H₂O, SO₄²⁻, cm³, m s⁻²), × for multiplication, ° for degrees.
- A table the candidate must read or complete is written in pipe form, one row per line, header row first, and an EMPTY cell (| |) where the candidate writes: "| Element | One importance | One deficiency symptom |" then "| Nitrogen | Protein synthesis | |".
- A figure goes on its own line as [FIGURE 1(a): what it shows and every label]. Do not draw it in words anywhere else.`;
  if (isObj) {
    return `${head}
- Style: ${section.hint || "Follow the usual WASSCE style for this subject."}
- Senior High School level for candidates in Ghana. Ghanaian names, places, GH¢ and local situations where natural. No "all of the above" or "none of the above". Do not give away the answer through option length. The four options are plain text WITHOUT the letters A to D (the layout adds them). Roman-numeral questions put the statements I, II, III on separate lines inside the question text, and the four options then read exactly: "I only", "I and II only", "II and III only", "I, II and III".
- A group of questions that share a stimulus (a table, a diagram, a passage) puts the stimulus in the FIRST question of the group, ending "Use it to answer questions N and M."; later questions of the group carry only their own stem.
- Spread correct answers roughly evenly over A, B, C and D.${markup}`;
  }
  return `${head}
- Style: ${section.hint || "Follow the usual WASSCE style for this subject."}
${marksShown}
- Use real WASSCE command words and match the points asked to the marks: "State **three** ..." is 3 marks, "Name **two** ..." is 2 marks, "Define ..." is 2 marks, "Explain briefly ..." is 2 to 4 marks, "Distinguish between ..." is 2 marks, "Discuss **five** ..." is 15 to 20 marks at about 3 to 4 marks a point, "Calculate ..." carries marks for method and answer.
- Sub-parts use (i), (ii), (iii). Give the data a candidate needs (constants, atomic masses in square brackets) inside the question.
- Do not write "Paper", "Section" or "Answer ..." lines inside the question text: the layout prints those.${markup}`;
}

/** Marking-scheme rules in the WASSCE format (same row format as the BECE scheme, WASSCE wording). */
export function wassceSchemeBlock(cfg, section) {
  if (cfg.examStyle !== "wassce") return "";
  if (section.type === "objective") {
    return `
MARKING SCHEME RULES (WASSCE format)
- Objective: the final key is only the correct letter, set in "correctOption". Leave "markingGuide" as an empty string "" for every question.`;
  }
  const table = getWassceProfile(cfg.subject).scheme === "table";
  return `
MARKING SCHEME RULES (WASSCE format: "markingGuide" is written as LINES, one per row of the marking table, each row in exactly this form)
  reference :: ${table ? "worked solution / expected answer" : "expected answer or acceptable points"} :: ${table ? "mark codes" : "marks"}
- "reference" is the part label such as 1(a)(i) or 2(b) (use the real question number of this section).
- ${table
    ? "Mathematics: show the full working line by line. In the third field use method and accuracy codes with the reason, e.g. \"M1 for converting 0.35 to a whole number; A1 for all correct\", \"B1 for ...\". Each question ends with a line \"TOTAL :: :: [N marks]\" (use that question's mark total). End questions that need it with a line such as \"NOTE :: :: -1 for ou/wu or 2 d.p. once only\"."
    : "For a list-type question write one row per acceptable point, e.g. \"1(a)(ii) :: Carbon dioxide / CO₂ :: 1\", and give alternatives separated by \" / \". Where only some of the listed points are needed, add a line such as \"NOTE :: Any 4 points x 3 = 12 marks :: 12\". For explain/describe/discuss items give the marking points, then the allocation, e.g. \"Statement of point = 1 mark; with explanation = 2 marks\". For a composition, comprehension or summary write a short band guide (content, organisation, expression, mechanical accuracy) with the mark range for each. For a table to be completed give the expected entry for every empty cell."}
- Every question ends with a line "TOTAL :: :: [N marks]" where N is that question's marks.
- The scheme must be specific enough for a different teacher to mark consistently. Do not use em dashes.`;
}

/** Heading printed under the school name: the school is the letterhead, so this just says what kind of paper it is. */
export function wassceExamTitle(examType = "Mock Exam") {
  const t = String(examType || "Examination").trim().replace(/\bexam\b/i, "Examination");
  return t.toUpperCase();
}

/**
 * Stamps WASSCE layout data onto a generated paper (sections keep the paper / rubric /
 * "answer any N" fields of the structure they were generated from) and sets the title
 * and booklet instructions. Pure, so saved papers re-render identically.
 */
export function decorateWassceExam(examData, requestedSections, profile, examType = "Mock Exam") {
  const byId = Object.fromEntries((requestedSections || []).map(s => [s.id, s]));
  const FIELDS = ["paper", "answerAny", "heading", "sub", "rubric", "numberFrom", "showPartMarks", "paperStart", "inPaper", "part", "partSub", "countedMarks", "hideSecMarks"];
  const sections = (examData.sections || []).map(gs => {
    const req = byId[gs.id] || {};
    const meta = {};
    FIELDS.forEach(f => { if (req[f] !== undefined) meta[f] = req[f]; });
    if (gs.theme) meta.theme = String(gs.theme).replace(/[^A-Za-z0-9 ,&'-]/g, "").slice(0, 60).toUpperCase();
    return { ...gs, ...meta };
  });
  return { ...examData, sections, style: "wassce", title: wassceExamTitle(examType), instructions: wassceBooklet(profile) };
}

/* ── checking and repairing what the model returns ─────────────────────────────── */

/** "A. one", "B) two", "(C) three", "D: four": the model sometimes writes the letters itself. Only removed when ALL four options carry them in order. */
const letterPrefix = (letter) => new RegExp("^\\s*(?:\\(" + letter + "\\)|" + letter + "[\\.\\):])\\s+", "i");
const stripLetters = (opts) => {
  const L = ["A", "B", "C", "D"];
  if (!Array.isArray(opts) || opts.length !== 4) return opts;
  return opts.every((o, i) => letterPrefix(L[i]).test(String(o ?? ""))) ? opts.map((o, i) => String(o).replace(letterPrefix(L[i]), "")) : opts;
};

/**
 * Fixes small, safe things in a generated WASSCE section in place: question numbers run on from
 * the section's start, option text carries no "A." prefix (the layout adds the letters), and
 * unmatched ** / {{ }} markup cannot leak into the printed paper. Returns the same object.
 */
export function repairWassceSection(section, parsed) {
  const qs = parsed && parsed.section && Array.isArray(parsed.section.questions) ? parsed.section.questions : [];
  const balanced = (t) => {
    let out = String(t ?? "");
    if ((out.match(/\*\*/g) || []).length % 2) out = out.replace(/\*\*/g, "");
    const open = (out.match(/\{\{/g) || []).length, close = (out.match(/\}\}/g) || []).length;
    if (open !== close) out = out.replace(/\{\{|\}\}/g, "");
    return out;
  };
  const start = Number(section.numberFrom) || 1;
  qs.forEach((q, i) => {
    q.number = start + i;
    if (typeof q.text === "string") q.text = balanced(q.text);
    if (typeof q.markingGuide === "string") q.markingGuide = stripMarkup(q.markingGuide);   // the scheme is plain text
    if (Array.isArray(q.options)) q.options = stripLetters(q.options).map(o => balanced(String(o ?? "").trim()));
    if (typeof q.correctOption === "string") q.correctOption = q.correctOption.trim().toUpperCase().replace(/[^A-D]/g, "").slice(0, 1);
    (q.parts || []).forEach(p => {
      if (typeof p.text === "string") p.text = balanced(p.text);
      (p.subparts || []).forEach(sp => { if (typeof sp.text === "string") sp.text = balanced(sp.text); });
    });
  });
  return parsed;
}

/** Hard structural checks for one generated section. Returns an error message, or "" when the section is sound. */
export function checkWassceSection(section, questions) {
  const id = section.id;
  for (const q of questions || []) {
    if (section.type === "objective") {
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => !String(o || "").trim())) return `Section ${id}, Question ${q.number}: an objective question needs exactly four non-empty options.`;
      if (!/^[A-D]$/.test(String(q.correctOption || ""))) return `Section ${id}, Question ${q.number}: correctOption must be A, B, C or D.`;
      if (new Set(q.options.map(o => String(o).trim().toLowerCase())).size !== 4) return `Section ${id}, Question ${q.number}: the four options must all be different.`;
    } else {
      if (!String(q.text || "").trim() && !(Array.isArray(q.parts) && q.parts.length)) return `Section ${id}, Question ${q.number}: the question has no text.`;
      for (const p of q.parts || []) {
        if (Array.isArray(p.subparts) && p.subparts.length) {
          const sum = p.subparts.reduce((a, sp) => a + (Number(sp.marks) || 0), 0);
          if (sum !== Number(p.marks)) return `Section ${id}, Question ${q.number}(${p.label}): sub-part marks (${sum}) don't add up to the part's marks (${p.marks}).`;
        }
      }
    }
  }
  return "";
}

/**
 * Question numbers run on through a paper (1 to N), so when a teacher changes a section's question count the sections after it
 * must start where the one before now ends. Returns new section objects; input order is the printed order.
 */
export function renumberWassceSections(sections) {
  const next = { 1: 1, 2: 1 };
  return (sections || []).map(s => {
    const p = s.paper === 1 ? 1 : 2;
    const out = { ...s, numberFrom: next[p] };
    next[p] += Number(s.questionCount) || 0;
    return out;
  });
}
