import { describe, it, expect } from "vitest";
import { createExamVariant, hasFixedOptionOrder } from "../src/examTemplate.js";

const obj = (n, text, options, key) => ({ number: n, text, marks: 1, options, correctOption: key });
const exam = (questions) => ({ style: "bece", title: "x", sections: [{ id: "OBJ", type: "objective", questions }], answerKey: questions.map(q => ({ number: q.number, answer: q.correctOption })) });

describe("BECE Version A/B", () => {
  it("keeps question order when questions refer to each other by number (English reported speech)", () => {
    const qs = [obj(1, "Choose the best word.", ["a", "b", "c", "d"], "A"), obj(2, "The sentence in Question 3 below is in reported speech.", ["p", "q", "r", "s"], "B"), obj(3, "Amarh said, 'I am ill.'", ["w", "x", "y", "z"], "C"), obj(4, "Pick one.", ["m", "n", "o", "k"], "D")];
    for (let seed = 1; seed <= 15; seed++) {
      const v = createExamVariant(exam(qs), seed);
      expect(v.sections[0].questions.map(q => q.number)).toEqual([1, 2, 3, 4]);
      expect(v.sections[0].questions.map(q => q.text)).toEqual(qs.map(q => q.text));
    }
  });
  it("never shuffles Roman-numeral or numeric options, but still shuffles ordinary options with a correct key", () => {
    const qs = [
      obj(1, "Which statements are true? I ... II ... III ...", ["I only", "I and II only", "II and III only", "I, II and III"], "B"),
      obj(2, "Simplify 3 + 4.", ["5", "6", "7", "8"], "C"),
      obj(3, "Which is a mammal?", ["shark", "whale", "trout", "eel"], "B"),
    ];
    let shuffledWords = false;
    for (let seed = 1; seed <= 25; seed++) {
      const v = createExamVariant(exam(qs), seed);
      const byText = Object.fromEntries(v.sections[0].questions.map(q => [q.text.slice(0, 5), q]));
      const roman = byText["Which"].options[0] === "I only" ? byText["Which"] : v.sections[0].questions.find(q => /^Which statements/.test(q.text));
      expect(roman.options).toEqual(["I only", "I and II only", "II and III only", "I, II and III"]);
      expect(roman.correctOption).toBe("B");
      const num = v.sections[0].questions.find(q => /^Simplify/.test(q.text));
      expect(num.options).toEqual(["5", "6", "7", "8"]);
      const mam = v.sections[0].questions.find(q => /mammal/.test(q.text));
      expect(mam.options["ABCD".indexOf(mam.correctOption)]).toBe("whale");
      if (mam.options.join() !== "shark,whale,trout,eel") shuffledWords = true;
      for (const q of v.sections[0].questions) expect(v.answerKey.find(a => a.number === q.number).answer).toBe(q.correctOption);
    }
    expect(shuffledWords).toBe(true);
  });
  it("other BECE objective sections are still shuffled and renumbered 1..N", () => {
    const qs = Array.from({ length: 12 }, (_, i) => obj(i + 1, `Fact ${i + 1}?`, ["one", "two", "three", "four"], "A"));
    const v = createExamVariant(exam(qs), 3);
    expect(v.sections[0].questions.map(q => q.number)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(v.sections[0].questions.map(q => q.text)).not.toEqual(qs.map(q => q.text));
  });
  it("hasFixedOptionOrder recognises the usual ordered answer lists", () => {
    expect(hasFixedOptionOrder(["0.5", "1", "2", "5"])).toBe(true);
    expect(hasFixedOptionOrder(["GH¢10", "GH¢20", "GH¢30", "GH¢40"])).toBe(true);
    expect(hasFixedOptionOrder(["Both A and B", "A only", "B only", "Neither"])).toBe(true);
    expect(hasFixedOptionOrder(["Accra", "Kumasi", "Tamale", "Ho"])).toBe(false);
  });
});
