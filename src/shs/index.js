/**
 * ═══════════════════════════════════════════════════════════════════
 * SHS CURRICULUM — MASTER EXPORTS
 * Organized by Programme/Course (Ghana NaCCA)
 *
 * To add a subject:
 *   1. Create the curriculum file under the relevant course folder
 *   2. Uncomment the export line below
 * ═══════════════════════════════════════════════════════════════════
 */

/* ─── CORE SUBJECTS (All SHS students) ─── */
export { ENGLISH_LANGUAGE_CURRICULUM }                       from './core_subjects/english_language_curriculum.js';
export { MATHEMATICS_CURRICULUM }                            from './core_subjects/mathematics_curriculum.js';
export { SOCIAL_STUDIES_CURRICULUM }                         from './core_subjects/social_studies_curriculum.js';
export { RELIGIOUS_AND_MORAL_EDUCATION_CURRICULUM }          from './core_subjects/religious_and_moral_education_curriculum.js';
export { PHYSICAL_EDUCATION_HEALTH_CURRICULUM }              from './core_subjects/physical_education_health_curriculum.js';
export { SHS_GENERAL_SCIENCE_CURRICULUM }                    from './core_subjects/general_science_curriculum.js';

/* ─── GENERAL SCIENCE ─── */
// export { default as SHS_GS_PHYSICS_CURRICULUM }            from './general_science/physics_curriculum.js';
// export { default as SHS_GS_CHEMISTRY_CURRICULUM }          from './general_science/chemistry_curriculum.js';
// export { default as SHS_GS_BIOLOGY_CURRICULUM }            from './general_science/biology_curriculum.js';
// export { default as SHS_GS_ADDITIONAL_MATH_CURRICULUM }    from './general_science/additional_math_curriculum.js';
// export { default as SHS_GS_PE_HEALTH_CURRICULUM }          from './general_science/pe_health_curriculum.js';
// export { default as SHS_GS_ICT_CURRICULUM }                from './general_science/ict_curriculum.js';

/* ─── BUSINESS ─── */
export { ACCOUNTING_CURRICULUM }                                                      from './business/accounting_curriculum.js';
export { BUSINESS_MANAGEMENT_CURRICULUM }                                             from './business/business_management_curriculum.js';
export { ECONOMICS_CURRICULUM }                                                       from './business/economics_curriculum.js';
export { ADDITIONAL_MATHEMATICS_CURRICULUM }                                          from './business/additional_mathematics_curriculum.js';
export { ICT_CURRICULUM }                                                             from './business/ict_curriculum.js';

/* ─── GENERAL ARTS ─── */
export { HISTORY_CURRICULUM                    as SHS_GA_HISTORY_CURRICULUM }            from './general_arts/history_curriculum.js';
export { GOVERNMENT_CURRICULUM                 as SHS_GA_GOVERNMENT_CURRICULUM }         from './general_arts/government_curriculum.js';
export { GEOGRAPHY_CURRICULUM                  as SHS_GA_GEOGRAPHY_CURRICULUM }          from './general_arts/geography_curriculum.js';
export { LITERATURE_IN_ENGLISH_CURRICULUM      as SHS_GA_LITERATURE_CURRICULUM }         from './general_arts/literature_in_english_curriculum.js';
export { FRENCH_CURRICULUM                     as SHS_GA_FRENCH_CURRICULUM }             from './general_arts/french_curriculum.js';
export { SPANISH_CURRICULUM                    as SHS_GA_SPANISH_CURRICULUM }            from './general_arts/spanish_curriculum.js';
export { ISLAMIC_RELIGIOUS_STUDIES_CURRICULUM  as SHS_GA_ISLAMIC_RS_CURRICULUM }         from './general_arts/islamic_religious_studies_curriculum.js';
export { ECONOMICS_CURRICULUM                  as SHS_GA_ECONOMICS_CURRICULUM }          from './general_arts/economics_curriculum.js';
export { CHRISTIAN_RELIGIOUS_STUDIES_CURRICULUM as SHS_GA_CHRISTIAN_RS_CURRICULUM }      from './general_arts/christian_religious_studies_curriculum.js';
export { ADDITIONAL_MATHEMATICS_CURRICULUM     as SHS_GA_ADDITIONAL_MATH_CURRICULUM }    from './general_arts/additional_mathematics_curriculum.js';
export { ICT_CURRICULUM                        as SHS_GA_ICT_CURRICULUM }                from './general_arts/ict_curriculum.js';
export { MUSIC_CURRICULUM                      as SHS_GA_MUSIC_CURRICULUM }              from './general_arts/music_curriculum.js';
export { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_GA_PE_HEALTH_CURRICULUM }  from './general_arts/physical_education_health_elective_curriculum.js';

/* ─── VISUAL ARTS ─── */
export { ART_AND_DESIGN_FOUNDATION_CURRICULUM          as SHS_VA_ART_AND_DESIGN_CURRICULUM }       from './visual_arts/art_and_design_foundation_curriculum.js';
export { DESIGN_COMMUNICATION_TECHNOLOGY_CURRICULUM    as SHS_VA_DESIGN_COMMS_TECH_CURRICULUM }    from './visual_arts/design_communication_technology_curriculum.js';
export { MUSIC_CURRICULUM                              as SHS_VA_MUSIC_CURRICULUM }                from './visual_arts/music_curriculum.js';
export { PERFORMING_ARTS_CURRICULUM                    as SHS_VA_PERFORMING_ARTS_CURRICULUM }      from './visual_arts/performing_arts_curriculum.js';
export { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_VA_PE_ELECTIVE_CURRICULUM }          from './visual_arts/pe_health_elective_curriculum.js';
// export { ARTS_DESIGN_STUDIO_CURRICULUM              as SHS_VA_ARTS_DESIGN_STUDIO_CURRICULUM }  from './visual_arts/arts_design_studio_curriculum.js';
// export { BASKETRY_CURRICULUM                        as SHS_VA_BASKETRY_CURRICULUM }             from './visual_arts/basketry_curriculum.js';
// export { PICTURE_MAKING_CURRICULUM                  as SHS_VA_PICTURE_MAKING_CURRICULUM }       from './visual_arts/picture_making_curriculum.js';

/* ─── HOME ECONOMICS ─── */
export { FOOD_AND_NUTRITION_CURRICULUM               as SHS_HE_FOOD_NUTRITION_CURRICULUM }      from './home_economics/food_and_nutrition_curriculum.js';
export { MANAGEMENT_IN_LIVING_CURRICULUM             as SHS_HE_MANAGEMENT_IN_LIVING_CURRICULUM } from './home_economics/management_in_living_curriculum.js';
export { CLOTHING_AND_TEXTILES_CURRICULUM            as SHS_HE_CLOTHING_AND_TEXTILES_CURRICULUM } from './home_economics/clothing_and_textiles_curriculum.js';
export { ART_AND_DESIGN_FOUNDATION_CURRICULUM        as SHS_HE_ART_AND_DESIGN_CURRICULUM }       from './home_economics/art_and_design_foundation_curriculum.js';
export { BIOLOGY_CURRICULUM                          as SHS_HE_BIOLOGY_CURRICULUM }              from './home_economics/biology_curriculum.js';
export { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_HE_PE_ELECTIVE_CURRICULUM }        from './home_economics/pe_health_elective_curriculum.js';

/* ─── AGRICULTURAL SCIENCE ─── */
export { AGRICULTURE_CURRICULUM }                              from './agricultural_science/agriculture_curriculum.js';
export { BIOLOGY_CURRICULUM        as SHS_AS_BIOLOGY_CURRICULUM }    from './agricultural_science/biology_curriculum.js';
export { CHEMISTRY_CURRICULUM      as SHS_AS_CHEMISTRY_CURRICULUM }  from './agricultural_science/chemistry_curriculum.js';
export { PHYSICS_CURRICULUM        as SHS_AS_PHYSICS_CURRICULUM }    from './agricultural_science/physics_curriculum.js';
export { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_AS_PE_HEALTH_ELECTIVE_CURRICULUM } from './agricultural_science/pe_health_curriculum.js';

/* ─── TECHNICAL ─── */
export { SHS_TECH_ENGINEERING_CURRICULUM }       from './technical/engineering_curriculum.js';
export { SHS_TECH_DESIGN_COMMS_TECH_CURRICULUM } from './technical/design_communication_technology_curriculum.js';
export { SHS_TECH_PE_ELECTIVE_CURRICULUM }       from './technical/pe_health_elective_curriculum.js';
// export { default as SHS_TECH_APPLIED_ELECTRICITY_CURRICULUM } from './technical/applied_electricity_curriculum.js';
// export { default as SHS_TECH_DESIGN_COMMS_TECH_CURRICULUM } from './technical/design_communication_technology_curriculum.js';
// export { default as SHS_TECH_ENGINEERING_CURRICULUM }      from './technical/engineering_curriculum.js';
// export { default as SHS_TECH_AUTO_MECHANICS_CURRICULUM }   from './technical/auto_mechanics_curriculum.js';
// export { default as SHS_TECH_BUILDING_CONSTRUCTION_CURRICULUM } from './technical/building_construction_curriculum.js';
// export { default as SHS_TECH_ELECTRONICS_CURRICULUM }      from './technical/electronics_curriculum.js';
// export { default as SHS_TECH_METALWORK_CURRICULUM }        from './technical/metalwork_curriculum.js';
// export { default as SHS_TECH_PE_HEALTH_CURRICULUM }        from './technical/pe_health_curriculum.js';
// export { default as SHS_TECH_TECHNICAL_DRAWING_CURRICULUM } from './technical/technical_drawing_curriculum.js';
// export { default as SHS_TECH_WOODWORK_CURRICULUM }         from './technical/woodwork_curriculum.js';

/* ─── STEM / TVET ─── */
export { COMPUTING_CURRICULUM                        as SHS_STEM_COMPUTING_CURRICULUM }             from './stem_tvet/computing_curriculum.js';
export { ROBOTICS_CURRICULUM                         as SHS_STEM_ROBOTICS_CURRICULUM }              from './stem_tvet/robotics_curriculum.js';
export { BIOMEDICAL_SCIENCE_CURRICULUM               as SHS_STEM_BIOMEDICAL_SCIENCE_CURRICULUM }    from './stem_tvet/biomedical_science_curriculum.js';
export { AVIATION_AND_AEROSPACE_ENGINEERING_CURRICULUM as SHS_STEM_AVIATION_AEROSPACE_CURRICULUM }  from './stem_tvet/aviation_and_aerospace_engineering_curriculum.js';
export { ICT_CURRICULUM                              as SHS_STEM_ICT_CURRICULUM }                   from './stem_tvet/ict_curriculum.js';
export { PHYSICS_CURRICULUM                          as SHS_STEM_PHYSICS_CURRICULUM }               from './stem_tvet/physics_curriculum.js';
export { ADDITIONAL_MATHEMATICS_CURRICULUM           as SHS_STEM_ADDITIONAL_MATH_CURRICULUM }       from './stem_tvet/additional_mathematics_curriculum.js';
export { AGRICULTURE_CURRICULUM                      as SHS_STEM_AGRICULTURE_CURRICULUM }           from './stem_tvet/agriculture_curriculum.js';
export { AGRICULTURAL_SCIENCE_CURRICULUM             as SHS_STEM_AGRICULTURAL_SCIENCE_CURRICULUM }  from './stem_tvet/agricultural_science_curriculum.js';
export { APPLIED_TECHNOLOGY_CURRICULUM               as SHS_STEM_APPLIED_TECHNOLOGY_CURRICULUM }    from './stem_tvet/applied_technology_curriculum.js';
export { ARABIC_CURRICULUM                           as SHS_STEM_ARABIC_CURRICULUM }                from './stem_tvet/arabic_curriculum.js';
export { ART_AND_DESIGN_STUDIO_CURRICULUM            as SHS_STEM_ART_DESIGN_STUDIO_CURRICULUM }     from './stem_tvet/art_and_design_studio_curriculum.js';
export { ART_AND_DESIGN_FOUNDATION_CURRICULUM        as SHS_STEM_ART_DESIGN_FOUNDATION_CURRICULUM } from './stem_tvet/art_and_design_foundation_curriculum.js';
export { ENGINEERING_CURRICULUM                      as SHS_STEM_ENGINEERING_CURRICULUM }           from './stem_tvet/engineering_curriculum.js';
export { MANUFACTURING_ENGINEERING_CURRICULUM        as SHS_STEM_MANUFACTURING_ENGINEERING_CURRICULUM } from './stem_tvet/manufacturing_engineering_curriculum.js';
export { MUSIC_CURRICULUM                            as SHS_STEM_MUSIC_CURRICULUM }                 from './stem_tvet/music_curriculum.js';
export { SPANISH_CURRICULUM                          as SHS_STEM_SPANISH_CURRICULUM }               from './stem_tvet/spanish_curriculum.js';
export { PHYSICAL_EDUCATION_HEALTH_ELECTIVE_CURRICULUM as SHS_STEM_PE_ELECTIVE_CURRICULUM }            from './stem_tvet/pe_health_elective_curriculum.js';
