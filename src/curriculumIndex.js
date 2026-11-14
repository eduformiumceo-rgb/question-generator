/**
 * ═══════════════════════════════════════════════════════════════════
 * GHANA NaCCA CURRICULUM — MASTER INDEX
 * Subjects: Mathematics, English Language, Science
 * To add a new subject: import it and add one entry to ALL_SUBJECTS
 * ═══════════════════════════════════════════════════════════════════
 */

import { MATH_CURRICULUM }                        from './primary/math_curriculum.js';
import { ENGLISH_CURRICULUM }                    from './primary/english_curriculum.js';
import { SCIENCE_CURRICULUM }                    from './primary/science_curriculum.js';
import { HISTORY_CURRICULUM }                    from './primary/history_curriculum.js';
import { RME_CURRICULUM }                        from './primary/rme_curriculum.js';
import { OWOP_CURRICULUM }                       from './primary/owop_curriculum.js';
import { CREATIVE_ARTS_CURRICULUM }              from './primary/creative_arts_curriculum.js';
import { COMPUTING_CURRICULUM }                  from './primary/computing_curriculum.js';
import { FRENCH_CURRICULUM }                     from './primary/french_curriculum.js';
import { GHANAIAN_LANGUAGE_CURRICULUM }          from './primary/ghanaian_language_curriculum.js';
import { PE_CURRICULUM }                          from './primary/pe_curriculum.js';

/* ─── JHS IMPORTS ─── */
import { MATH_CURRICULUM        as JHS_MATH_CURRICULUM }              from './jhs/math_curriculum.js';
import { ENGLISH_CURRICULUM     as JHS_ENGLISH_CURRICULUM }           from './jhs/english_curriculum.js';
import { SCIENCE_CURRICULUM     as JHS_SCIENCE_CURRICULUM }           from './jhs/science_curriculum.js';
import { RME_CURRICULUM         as JHS_RME_CURRICULUM }               from './jhs/rme_curriculum.js';
import { CREATIVE_ARTS_CURRICULUM as JHS_CREATIVE_ARTS_CURRICULUM }   from './jhs/creative_arts_curriculum.js';
import { COMPUTING_CURRICULUM   as JHS_COMPUTING_CURRICULUM }         from './jhs/computing_curriculum.js';
import { FRENCH_CURRICULUM      as JHS_FRENCH_CURRICULUM }            from './jhs/french_curriculum.js';
import { GHANAIAN_LANGUAGE_CURRICULUM as JHS_GHANAIAN_LANGUAGE_CURRICULUM } from './jhs/ghanaian_language_curriculum.js';
import { PEH_CURRICULUM         as JHS_PE_CURRICULUM }                from './jhs/pe_curriculum.js';
import { SOCIAL_STUDIES_CURRICULUM as JHS_SOCIAL_STUDIES_CURRICULUM } from './jhs/social_studies_curriculum.js';
import { ARABIC_CURRICULUM      as JHS_ARABIC_CURRICULUM }            from './jhs/arabic_curriculum.js';
import { CT_CURRICULUM          as JHS_CT_CURRICULUM }                from './jhs/ctech_curriculum.js';

/* ─── SHS IMPORTS ─── */
import { SOCIAL_STUDIES_CURRICULUM             as SHS_SOCIAL_STUDIES_CURRICULUM }   from './shs/core_subjects/social_studies_curriculum.js';
import { ENGLISH_LANGUAGE_CURRICULUM           as SHS_ENGLISH_LANGUAGE_CURRICULUM } from './shs/core_subjects/english_language_curriculum.js';
import { MATHEMATICS_CURRICULUM                as SHS_MATHEMATICS_CURRICULUM }       from './shs/core_subjects/mathematics_curriculum.js';
import { RELIGIOUS_AND_MORAL_EDUCATION_CURRICULUM as SHS_RME_CURRICULUM }            from './shs/core_subjects/religious_and_moral_education_curriculum.js';
import { PHYSICAL_EDUCATION_HEALTH_CURRICULUM  as SHS_PE_CURRICULUM }               from './shs/core_subjects/physical_education_health_curriculum.js';
import { SHS_GENERAL_SCIENCE_CURRICULUM }                                            from './shs/core_subjects/general_science_curriculum.js';

/* ─── SHS AGRICULTURAL SCIENCE IMPORTS ─── */
import { AGRICULTURE_CURRICULUM }                                                     from './shs/agricultural_science/agriculture_curriculum.js';
import { BIOLOGY_CURRICULUM        as SHS_AS_BIOLOGY_CURRICULUM }                   from './shs/agricultural_science/biology_curriculum.js';
import { CHEMISTRY_CURRICULUM      as SHS_AS_CHEMISTRY_CURRICULUM }                 from './shs/agricultural_science/chemistry_curriculum.js';
import { PHYSICS_CURRICULUM        as SHS_AS_PHYSICS_CURRICULUM }                   from './shs/agricultural_science/physics_curriculum.js';
import { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_AS_PE_ELECTIVE_CURRICULUM } from './shs/agricultural_science/pe_health_curriculum.js';

/* ─── SHS BUSINESS IMPORTS ─── */
import { ACCOUNTING_CURRICULUM }                                                      from './shs/business/accounting_curriculum.js';
import { BUSINESS_MANAGEMENT_CURRICULUM }                                             from './shs/business/business_management_curriculum.js';
import { ECONOMICS_CURRICULUM }                                                       from './shs/business/economics_curriculum.js';
import { ADDITIONAL_MATHEMATICS_CURRICULUM }                                          from './shs/business/additional_mathematics_curriculum.js';
import { ICT_CURRICULUM }                                                             from './shs/business/ict_curriculum.js';

/* ─── SHS GENERAL SCIENCE IMPORTS ─── */
import { BIOLOGY_CURRICULUM                                as SHS_GS_BIOLOGY_CURRICULUM }          from './shs/general_science/biology_curriculum.js';
import { CHEMISTRY_CURRICULUM                             as SHS_GS_CHEMISTRY_CURRICULUM }         from './shs/general_science/chemistry_curriculum.js';
import { PHYSICS_CURRICULUM                               as SHS_GS_PHYSICS_CURRICULUM }           from './shs/general_science/physics_curriculum.js';
import { ADDITIONAL_MATHEMATICS_CURRICULUM                as SHS_GS_ADDITIONAL_MATH_CURRICULUM }   from './shs/general_science/additional_mathematics_curriculum.js';
import { ICT_CURRICULUM                                   as SHS_GS_ICT_CURRICULUM }               from './shs/general_science/ict_curriculum.js';
import { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM    as SHS_GS_PE_ELECTIVE_CURRICULUM }       from './shs/general_science/physical_education_health_elective_curriculum.js';

/* ─── SHS VISUAL ARTS IMPORTS ─── */
import { SHS_VA_ART_AND_DESIGN_CURRICULUM }          from './shs/visual_arts/art_and_design_foundation_curriculum.js';
import { SHS_VA_DESIGN_COMMS_TECH_CURRICULUM }       from './shs/visual_arts/design_communication_technology_curriculum.js';
import { SHS_VA_MUSIC_CURRICULUM }                   from './shs/visual_arts/music_curriculum.js';
import { SHS_VA_PERFORMING_ARTS_CURRICULUM }         from './shs/visual_arts/performing_arts_curriculum.js';
import { SHS_VA_PE_ELECTIVE_CURRICULUM }             from './shs/visual_arts/pe_health_elective_curriculum.js';

/* ─── SHS HOME ECONOMICS IMPORTS ─── */
import { SHS_HE_FOOD_NUTRITION_CURRICULUM }           from './shs/home_economics/food_and_nutrition_curriculum.js';
import { SHS_HE_MANAGEMENT_IN_LIVING_CURRICULUM }     from './shs/home_economics/management_in_living_curriculum.js';
import { SHS_HE_CLOTHING_AND_TEXTILES_CURRICULUM }    from './shs/home_economics/clothing_and_textiles_curriculum.js';
import { SHS_HE_ART_AND_DESIGN_CURRICULUM }           from './shs/home_economics/art_and_design_foundation_curriculum.js';
import { SHS_HE_BIOLOGY_CURRICULUM }                  from './shs/home_economics/biology_curriculum.js';
import { SHS_HE_PE_ELECTIVE_CURRICULUM }              from './shs/home_economics/pe_health_elective_curriculum.js';

/* ─── SHS TECHNICAL IMPORTS ─── */
import { SHS_TECH_ENGINEERING_CURRICULUM }        from './shs/technical/engineering_curriculum.js';
import { SHS_TECH_DESIGN_COMMS_TECH_CURRICULUM }  from './shs/technical/design_communication_technology_curriculum.js';
import { SHS_TECH_PE_ELECTIVE_CURRICULUM }        from './shs/technical/pe_health_elective_curriculum.js';

/* ─── SHS STEM / TVET IMPORTS ─── */
import { COMPUTING_CURRICULUM                          as SHS_STEM_COMPUTING_CURRICULUM }              from './shs/stem_tvet/computing_curriculum.js';
import { ROBOTICS_CURRICULUM                           as SHS_STEM_ROBOTICS_CURRICULUM }               from './shs/stem_tvet/robotics_curriculum.js';
import { BIOMEDICAL_SCIENCE_CURRICULUM                 as SHS_STEM_BIOMEDICAL_SCIENCE_CURRICULUM }     from './shs/stem_tvet/biomedical_science_curriculum.js';
import { AVIATION_AND_AEROSPACE_ENGINEERING_CURRICULUM as SHS_STEM_AVIATION_AEROSPACE_CURRICULUM }     from './shs/stem_tvet/aviation_and_aerospace_engineering_curriculum.js';
import { ICT_CURRICULUM                                as SHS_STEM_ICT_CURRICULUM }                    from './shs/stem_tvet/ict_curriculum.js';
import { PHYSICS_CURRICULUM                            as SHS_STEM_PHYSICS_CURRICULUM }                from './shs/stem_tvet/physics_curriculum.js';
import { ADDITIONAL_MATHEMATICS_CURRICULUM             as SHS_STEM_ADDITIONAL_MATH_CURRICULUM }        from './shs/stem_tvet/additional_mathematics_curriculum.js';
import { AGRICULTURE_CURRICULUM                        as SHS_STEM_AGRICULTURE_CURRICULUM }            from './shs/stem_tvet/agriculture_curriculum.js';
import { AGRICULTURAL_SCIENCE_CURRICULUM               as SHS_STEM_AGRICULTURAL_SCIENCE_CURRICULUM }   from './shs/stem_tvet/agricultural_science_curriculum.js';
import { APPLIED_TECHNOLOGY_CURRICULUM                 as SHS_STEM_APPLIED_TECHNOLOGY_CURRICULUM }     from './shs/stem_tvet/applied_technology_curriculum.js';
import { ARABIC_CURRICULUM                             as SHS_STEM_ARABIC_CURRICULUM }                 from './shs/stem_tvet/arabic_curriculum.js';
import { ART_AND_DESIGN_STUDIO_CURRICULUM              as SHS_STEM_ART_DESIGN_STUDIO_CURRICULUM }      from './shs/stem_tvet/art_and_design_studio_curriculum.js';
import { ART_AND_DESIGN_FOUNDATION_CURRICULUM          as SHS_STEM_ART_DESIGN_FOUNDATION_CURRICULUM }  from './shs/stem_tvet/art_and_design_foundation_curriculum.js';
import { ENGINEERING_CURRICULUM                        as SHS_STEM_ENGINEERING_CURRICULUM }            from './shs/stem_tvet/engineering_curriculum.js';
import { MANUFACTURING_ENGINEERING_CURRICULUM          as SHS_STEM_MANUFACTURING_ENGINEERING_CURRICULUM } from './shs/stem_tvet/manufacturing_engineering_curriculum.js';
import { MUSIC_CURRICULUM                              as SHS_STEM_MUSIC_CURRICULUM }                  from './shs/stem_tvet/music_curriculum.js';
import { SPANISH_CURRICULUM                            as SHS_STEM_SPANISH_CURRICULUM }                from './shs/stem_tvet/spanish_curriculum.js';
import { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_STEM_PE_ELECTIVE_CURRICULUM }           from './shs/stem_tvet/pe_health_elective_curriculum.js';

/* ─── SHS GENERAL ARTS IMPORTS ─── */
import { HISTORY_CURRICULUM                    as SHS_GA_HISTORY_CURRICULUM }            from './shs/general_arts/history_curriculum.js';
import { GOVERNMENT_CURRICULUM                 as SHS_GA_GOVERNMENT_CURRICULUM }         from './shs/general_arts/government_curriculum.js';
import { GEOGRAPHY_CURRICULUM                  as SHS_GA_GEOGRAPHY_CURRICULUM }          from './shs/general_arts/geography_curriculum.js';
import { LITERATURE_IN_ENGLISH_CURRICULUM      as SHS_GA_LITERATURE_CURRICULUM }         from './shs/general_arts/literature_in_english_curriculum.js';
import { FRENCH_CURRICULUM                     as SHS_GA_FRENCH_CURRICULUM }             from './shs/general_arts/french_curriculum.js';
import { SPANISH_CURRICULUM                    as SHS_GA_SPANISH_CURRICULUM }            from './shs/general_arts/spanish_curriculum.js';
import { ISLAMIC_RELIGIOUS_STUDIES_CURRICULUM  as SHS_GA_ISLAMIC_RS_CURRICULUM }         from './shs/general_arts/islamic_religious_studies_curriculum.js';
import { ECONOMICS_CURRICULUM                  as SHS_GA_ECONOMICS_CURRICULUM }          from './shs/general_arts/economics_curriculum.js';
import { CHRISTIAN_RELIGIOUS_STUDIES_CURRICULUM as SHS_GA_CHRISTIAN_RS_CURRICULUM }      from './shs/general_arts/christian_religious_studies_curriculum.js';
import { ADDITIONAL_MATHEMATICS_CURRICULUM     as SHS_GA_ADDITIONAL_MATH_CURRICULUM }    from './shs/general_arts/additional_mathematics_curriculum.js';
import { ICT_CURRICULUM                        as SHS_GA_ICT_CURRICULUM }                from './shs/general_arts/ict_curriculum.js';
import { MUSIC_CURRICULUM                      as SHS_GA_MUSIC_CURRICULUM }              from './shs/general_arts/music_curriculum.js';
import { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_GA_PE_ELECTIVE_CURRICULUM } from './shs/general_arts/physical_education_health_elective_curriculum.js';


/* ─── MASTER REGISTRY ─── */
export const ALL_SUBJECTS = {
  /* ── Primary + JHS ── */
  "Mathematics":                  { data: { ...MATH_CURRICULUM,              ...JHS_MATH_CURRICULUM,             ...SHS_MATHEMATICS_CURRICULUM } },
  "English Language":             { data: { ...ENGLISH_CURRICULUM,           ...JHS_ENGLISH_CURRICULUM,          ...SHS_ENGLISH_LANGUAGE_CURRICULUM } },
  "Science":                      { data: { ...SCIENCE_CURRICULUM,           ...JHS_SCIENCE_CURRICULUM } },
  "History":                      { data: HISTORY_CURRICULUM },
  "Religious and Moral Education": { data: { ...RME_CURRICULUM,              ...JHS_RME_CURRICULUM,              ...SHS_RME_CURRICULUM } },
  "Our World Our People":         { data: { ...OWOP_CURRICULUM } },
  "Creative Arts":                { data: { ...CREATIVE_ARTS_CURRICULUM,     ...JHS_CREATIVE_ARTS_CURRICULUM } },
  "Computing":                    { data: { ...COMPUTING_CURRICULUM,         ...JHS_COMPUTING_CURRICULUM } },
  "French":                       { data: { ...FRENCH_CURRICULUM,            ...JHS_FRENCH_CURRICULUM } },
  "Ghanaian Language":            { data: { ...GHANAIAN_LANGUAGE_CURRICULUM, ...JHS_GHANAIAN_LANGUAGE_CURRICULUM } },
  "Physical Education":           { data: { ...PE_CURRICULUM,                ...JHS_PE_CURRICULUM } },
  "Social Studies":               { data: { ...JHS_SOCIAL_STUDIES_CURRICULUM,...SHS_SOCIAL_STUDIES_CURRICULUM } },
  "Arabic":                       { data: JHS_ARABIC_CURRICULUM },
  "Career Technology":            { data: JHS_CT_CURRICULUM },
  /* ── SHS Core (PE&H is SHS-only key — distinct from Primary/JHS "Physical Education") ── */
  "Physical Education & Health":  { data: SHS_PE_CURRICULUM },
  "General Science":              { data: SHS_GENERAL_SCIENCE_CURRICULUM },

  /* ── SHS Agricultural Science ── */
  "Agriculture":                  { data: AGRICULTURE_CURRICULUM },
  "Biology (Agric)":              { data: SHS_AS_BIOLOGY_CURRICULUM },
  "Chemistry (Agric)":            { data: SHS_AS_CHEMISTRY_CURRICULUM },
  "Physics (Agric)":              { data: SHS_AS_PHYSICS_CURRICULUM },
  "PE & Health Elective (Agric)": { data: SHS_AS_PE_ELECTIVE_CURRICULUM },

  /* ── SHS Business ── */
  "Accounting":                   { data: ACCOUNTING_CURRICULUM },
  "Business Management":          { data: BUSINESS_MANAGEMENT_CURRICULUM },
  "Economics (BUS)":              { data: ECONOMICS_CURRICULUM },
  "Additional Mathematics (BUS)": { data: ADDITIONAL_MATHEMATICS_CURRICULUM },
  "ICT (BUS)":                    { data: ICT_CURRICULUM },

  /* ── SHS General Science ── */
  "Biology (GS)":                     { data: SHS_GS_BIOLOGY_CURRICULUM },
  "Chemistry (GS)":                   { data: SHS_GS_CHEMISTRY_CURRICULUM },
  "Physics (GS)":                     { data: SHS_GS_PHYSICS_CURRICULUM },
  "Additional Mathematics (GS)":      { data: SHS_GS_ADDITIONAL_MATH_CURRICULUM },
  "ICT (GS)":                         { data: SHS_GS_ICT_CURRICULUM },
  "PE & Health Elective (GS)":        { data: SHS_GS_PE_ELECTIVE_CURRICULUM },

  /* ── SHS Visual Arts ── */
  "Art and Design Foundation (VA)":            { data: SHS_VA_ART_AND_DESIGN_CURRICULUM },
  "Design and Communication Technology (VA)":  { data: SHS_VA_DESIGN_COMMS_TECH_CURRICULUM },
  "Music (VA)":                                { data: SHS_VA_MUSIC_CURRICULUM },
  "Performing Arts":                           { data: SHS_VA_PERFORMING_ARTS_CURRICULUM },
  "PE & Health Elective (VA)":                 { data: SHS_VA_PE_ELECTIVE_CURRICULUM },

  /* ── SHS Home Economics ── */
  "Food and Nutrition":                    { data: SHS_HE_FOOD_NUTRITION_CURRICULUM },
  "Management in Living":                  { data: SHS_HE_MANAGEMENT_IN_LIVING_CURRICULUM },
  "Clothing and Textiles":                 { data: SHS_HE_CLOTHING_AND_TEXTILES_CURRICULUM },
  "Art and Design Foundation (HE)":        { data: SHS_HE_ART_AND_DESIGN_CURRICULUM },
  "Biology (HE)":                          { data: SHS_HE_BIOLOGY_CURRICULUM },
  "PE & Health Elective (HE)":             { data: SHS_HE_PE_ELECTIVE_CURRICULUM },

  /* ── SHS Technical ── */
  "Engineering":                          { data: SHS_TECH_ENGINEERING_CURRICULUM },
  "Design and Communication Technology":  { data: SHS_TECH_DESIGN_COMMS_TECH_CURRICULUM },
  "PE & Health Elective (Tech)":          { data: SHS_TECH_PE_ELECTIVE_CURRICULUM },

  /* ── SHS STEM / TVET ── */
  "Computing (STEM)":                     { data: SHS_STEM_COMPUTING_CURRICULUM },
  "Robotics":                             { data: SHS_STEM_ROBOTICS_CURRICULUM },
  "Biomedical Science":                   { data: SHS_STEM_BIOMEDICAL_SCIENCE_CURRICULUM },
  "Aviation and Aerospace Engineering":   { data: SHS_STEM_AVIATION_AEROSPACE_CURRICULUM },
  "ICT (STEM)":                           { data: SHS_STEM_ICT_CURRICULUM },
  "Physics (STEM)":                       { data: SHS_STEM_PHYSICS_CURRICULUM },
  "Additional Mathematics (STEM)":        { data: SHS_STEM_ADDITIONAL_MATH_CURRICULUM },
  "Agriculture (STEM)":                   { data: SHS_STEM_AGRICULTURE_CURRICULUM },
  "Agricultural Science (STEM)":          { data: SHS_STEM_AGRICULTURAL_SCIENCE_CURRICULUM },
  "Applied Technology":                   { data: SHS_STEM_APPLIED_TECHNOLOGY_CURRICULUM },
  "Arabic (STEM)":                        { data: SHS_STEM_ARABIC_CURRICULUM },
  "Art and Design Studio":                { data: SHS_STEM_ART_DESIGN_STUDIO_CURRICULUM },
  "Art and Design Foundation (STEM)":     { data: SHS_STEM_ART_DESIGN_FOUNDATION_CURRICULUM },
  "Engineering (STEM)":                   { data: SHS_STEM_ENGINEERING_CURRICULUM },
  "Manufacturing Engineering":            { data: SHS_STEM_MANUFACTURING_ENGINEERING_CURRICULUM },
  "Music (STEM)":                         { data: SHS_STEM_MUSIC_CURRICULUM },
  "Spanish (STEM)":                       { data: SHS_STEM_SPANISH_CURRICULUM },
  "PE & Health Elective (STEM)":          { data: SHS_STEM_PE_ELECTIVE_CURRICULUM },

  /* ── SHS General Arts ── */
  "History (GA)":                         { data: SHS_GA_HISTORY_CURRICULUM },
  "Government":                           { data: SHS_GA_GOVERNMENT_CURRICULUM },
  "Geography":                            { data: SHS_GA_GEOGRAPHY_CURRICULUM },
  "Literature in English":                { data: SHS_GA_LITERATURE_CURRICULUM },
  "French (GA)":                          { data: SHS_GA_FRENCH_CURRICULUM },
  "Spanish":                              { data: SHS_GA_SPANISH_CURRICULUM },
  "Islamic Religious Studies":            { data: SHS_GA_ISLAMIC_RS_CURRICULUM },
  "Economics (GA)":                       { data: SHS_GA_ECONOMICS_CURRICULUM },
  "Christian Religious Studies":          { data: SHS_GA_CHRISTIAN_RS_CURRICULUM },
  "Additional Mathematics (GA)":          { data: SHS_GA_ADDITIONAL_MATH_CURRICULUM },
  "ICT (GA)":                             { data: SHS_GA_ICT_CURRICULUM },
  "Music (GA)":                           { data: SHS_GA_MUSIC_CURRICULUM },
  "PE & Health Elective (GA)":            { data: SHS_GA_PE_ELECTIVE_CURRICULUM },
};

export const SUPPORTED_SUBJECTS = Object.keys(ALL_SUBJECTS);

/** All classes available for a subject */
export function getSupportedClasses(subject) {
  return Object.keys(ALL_SUBJECTS[subject]?.data || {});
}

/** All strands for a subject + class */
export function getStrands(subject, cls) {
  return ALL_SUBJECTS[subject]?.data[cls] || [];
}

/** All sub-strands for a subject + class + strand name */
export function getSubStrands(subject, cls, strandName) {
  const strand = getStrands(subject, cls).find(s => s.strand === strandName);
  return strand?.subStrands || [];
}

/** All content standards for a subject + class + strand + sub-strand */
export function getContentStandards(subject, cls, strandName, subStrandName) {
  const sub = getSubStrands(subject, cls, strandName).find(s => s.name === subStrandName);
  return sub?.contentStandards || [];
}

/** All indicators flat for a sub-strand (with contentStandardCode attached) */
export function getIndicators(subject, cls, strandName, subStrandName) {
  return getContentStandards(subject, cls, strandName, subStrandName)
    .flatMap(cs => (cs.indicators || []).map(ind => ({
      ...ind,
      contentStandardCode:  cs.code,
      contentStandardTitle: cs.title,
    })));
}

/**
 * Get full detail for selected indicators including exemplars, resources, keyWords.
 * Returns array of enriched indicator objects for the selected codes.
 */
export function getIndicatorDetails(subject, cls, strandName, subStrandName, indicatorCodes) {
  const all = getIndicators(subject, cls, strandName, subStrandName);
  const codes = indicatorCodes || [];
  return codes
    .map(code => all.find(i => i.code === code))
    .filter(Boolean);
}

/**
 * Parse raw exemplar text into a clean array of step strings.
 * Handles: numbered steps ("1. ..."), bullet/dash lists, plain sentences.
 */
function parseExemplarSteps(text) {
  if (!text || text === "null") return [];

  // Try numbered steps first: "1. Step", "2. Step" etc.
  const numberedMatch = text.match(/\d+\.\s/);
  if (numberedMatch) {
    return text
      .split(/(?=\d+\.\s)/)
      .map(s => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
  }

  // Try bullet/dash lines
  const bulletMatch = text.match(/^[-•*]\s/m);
  if (bulletMatch) {
    return text
      .split(/\n/)
      .map(s => s.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
  }

  // Fall back: split on newlines first
  const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // Last resort: split on sentence boundaries (capital letter after period+space)
  const sentences = text.split(/\.\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
  return sentences.length > 1 ? sentences : [text.trim()];
}

/**
 * Build a prompt-ready exemplar block distributed across lesson days.
 *
 * Design rules:
 *  - Each indicator's exemplar steps are parsed into an ordered list.
 *  - Steps are distributed evenly across days (never duplicated, never skipped).
 *  - When there are MORE exemplars than days, one exemplar per day is used.
 *  - When there are FEWER exemplars than days, the steps are split across days.
 *  - Output is numbered clearly so the AI knows EXACTLY which steps go to which day.
 *  - Each step is labelled with its ORIGINAL text so the AI copies it word-for-word.
 */
export function buildExemplarBlock(subject, cls, strandName, subStrandName, indicatorCodes, selectedDays) {
  const details = getIndicatorDetails(subject, cls, strandName, subStrandName, indicatorCodes);
  if (!details.length) return "";

  const exemplars = details.filter(d => d.exemplar && d.exemplar !== "null");
  const days = (selectedDays && selectedDays.length > 0) ? selectedDays : ["Monday"];
  const numDays = days.length;

  // ── No exemplars in database ──
  if (exemplars.length === 0) {
    const lines = days.map((dayName, i) => {
      const ind = details[Math.min(i, details.length - 1)];
      return [
        `╔══ DAY ${i + 1}: ${dayName.toUpperCase()} ══╗`,
        `  Indicator: ${ind ? ind.code + " — " + ind.text : "as selected"}`,
        `  ⚠ No NaCCA exemplar stored for this indicator.`,
        `  Write Phase 2 activities based on the indicator text, using NaCCA pedagogy.`,
        `  Include: a teacher-led explanation, a group activity, and an individual task.`,
      ].join("\n");
    });
    return `\n${"═".repeat(60)}\nNaCCA EXEMPLAR STEPS — PER DAY ASSIGNMENT\n${"═".repeat(60)}\n\n${lines.join("\n\n")}`;
  }

  // ── Helper: distribute steps evenly across N days ──
  const distributeSteps = (steps, n) => {
    const dist = Array.from({ length: n }, () => []);
    steps.forEach((step, i) => dist[i % n].push(step));
    return dist;
  };

  // ── Build per-day blocks ──
  const dayBlocks = days.map((dayName, dayIdx) => {
    const header = `╔══ DAY ${dayIdx + 1}: ${dayName.toUpperCase()} ══╗`;

    if (exemplars.length >= numDays) {
      // ── One exemplar per day ──
      const ex = exemplars[Math.min(dayIdx, exemplars.length - 1)];
      const steps = parseExemplarSteps(ex.exemplar);
      const kwLine = (ex.keyWords && ex.keyWords !== "null")
        ? `\n  Key Words for today: ${ex.keyWords}` : "";

      const stepLines = steps.map((s, i) =>
        `  STEP ${i + 1}: ${s}`
      ).join("\n");

      return [
        header,
        `  Indicator: ${ex.code} — ${ex.text}`,
        `  NaCCA Exemplar steps (${steps.length} step${steps.length !== 1 ? "s" : ""}) — copy each WORD FOR WORD, only swap first verb:`,
        stepLines,
        kwLine,
      ].filter(Boolean).join("\n");
    }

    // ── Fewer exemplars than days — split steps across days ──
    // Collect all steps from all exemplars into one pool
    const allSteps = exemplars.flatMap(ex => parseExemplarSteps(ex.exemplar));
    const primaryEx = exemplars[0];
    const distribution = distributeSteps(allSteps, numDays);
    const mySteps = distribution[dayIdx] || [];
    const totalSteps = allSteps.length;
    const globalStart = distribution.slice(0, dayIdx).flat().length + 1;
    const globalEnd   = globalStart + mySteps.length - 1;

    if (mySteps.length === 0) {
      return [
        header,
        `  Indicator: ${primaryEx.code} — ${primaryEx.text}`,
        `  All ${totalSteps} exemplar steps were covered on previous days.`,
        `  Use this lesson for review and assessment only — NO new exemplar steps.`,
        `  Write 3-4 activities where learners demonstrate what they have learned.`,
      ].join("\n");
    }

    const stepLines = mySteps.map((s, i) =>
      `  STEP ${globalStart + i} of ${totalSteps}: ${s}`
    ).join("\n");

    const prevDay = dayIdx > 0 ? days[dayIdx - 1] : null;
    const contNote = prevDay
      ? `  (Steps 1–${globalStart - 1} were covered on ${prevDay}. Continue from step ${globalStart}.)`
      : "";

    return [
      header,
      `  Indicator: ${primaryEx.code} — ${primaryEx.text}`,
      `  NaCCA Exemplar — your steps for today (${mySteps.length} of ${totalSteps} total):`,
      contNote,
      `  Copy each step WORD FOR WORD — only swap the very first verb using your synonym table:`,
      stepLines,
      (primaryEx.keyWords && primaryEx.keyWords !== "null")
        ? `  Key Words: ${primaryEx.keyWords}` : "",
    ].filter(Boolean).join("\n");
  });

  return [
    "",
    "═".repeat(60),
    "NaCCA EXEMPLAR STEPS — PER DAY ASSIGNMENT",
    "INSTRUCTION: For each day's [NACCA] block, copy the steps",
    "listed under that day EXACTLY. Change ONLY the first verb.",
    "Every other word must be identical to what is written below.",
    "═".repeat(60),
    "",
    dayBlocks.join("\n\n"),
    "",
  ].join("\n");
}
/* ═══════════════════════════════════════════════════════════════════
 * SHS CURRICULUM HELPERS
 * Mirror of the Primary/JHS helpers but work with the SHS data
 * structure which has learningOutcomes, skills21stCentury, etc.
 * ═══════════════════════════════════════════════════════════════════ */

/** Returns true when a subject has SHS data in ALL_SUBJECTS */
export function shsSubjectInDB(subject) {
  if (!subject) return false;
  const data = ALL_SUBJECTS[subject]?.data || {};
  return ["SHS 1","SHS 2","SHS 3"].some(cls => !!data[cls]);
}

/** All strands for an SHS subject + class */
export function getSHSStrands(subject, cls) {
  return ALL_SUBJECTS[subject]?.data[cls] || [];
}

/** All sub-strands for an SHS subject + class + strand */
export function getSHSSubStrands(subject, cls, strandName) {
  const strand = getSHSStrands(subject, cls).find(s => s.strand === strandName);
  return strand?.subStrands || [];
}

/** All content standards for an SHS subject + class + strand + sub-strand */
export function getSHSContentStandards(subject, cls, strandName, subStrandName) {
  const sub = getSHSSubStrands(subject, cls, strandName).find(s => s.name === subStrandName);
  return sub?.contentStandards || [];
}

/** All indicators for an SHS subject + class + strand + sub-strand */
export function getSHSIndicators(subject, cls, strandName, subStrandName) {
  return getSHSContentStandards(subject, cls, strandName, subStrandName)
    .flatMap(cs => (cs.indicators || []).map(ind => ({
      ...ind,
      contentStandardCode:  cs.code,
      contentStandardTitle: cs.title,
    })));
}

/** Full sub-strand object (has learningOutcomes, skills21stCentury, teachingResources) */
export function getSHSSubStrandDetail(subject, cls, strandName, subStrandName) {
  return getSHSSubStrands(subject, cls, strandName).find(s => s.name === subStrandName) || null;
}