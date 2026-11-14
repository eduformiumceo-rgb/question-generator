// Shared fixture: 5 objective questions + 2 structured (Q1 has parts a and b).
export const SAMPLE_EXAM = {
  title: "CLASS TEST",
  instructions: ["Answer all questions."],
  sections: [
    {
      id: "A", label: "Section A: Objective", type: "objective", instructions: "Choose the correct option.",
      questions: Array.from({ length: 5 }, (_, i) => ({
        number: i + 1, text: `Question ${i + 1}?`, options: ["a", "b", "c", "d"],
        correctOption: "A", parts: [], marks: 1, diagram: null, cognitiveLevel: "Recall", markingGuide: "A is correct.",
      })),
    },
    {
      id: "B", label: "Section B: Structured", type: "structured", instructions: "Answer both questions.",
      questions: [
        { number: 1, text: "Solve for x.", options: null, correctOption: null, parts: [{ label: "a", text: "2x = 4", marks: 5, subparts: [] }, { label: "b", text: "3x = 9", marks: 5, subparts: [] }], marks: 10, diagram: null, cognitiveLevel: "Application", markingGuide: "x=2; x=3." },
        { number: 2, text: "Solve for y.", options: null, correctOption: null, parts: [], marks: 10, diagram: null, cognitiveLevel: "Application", markingGuide: "y=5." },
      ],
    },
  ],
  answerKey: [{ number: 1, answer: "A" }],
};
