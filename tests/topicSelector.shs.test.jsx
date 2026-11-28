// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/auth.js", () => ({ getToken: () => null }));
import TopicSelector from "../src/components/TopicSelector.jsx";
import { getStrands, getSubStrands, loadAllSubjects } from "../src/curriculumIndex.js";
import { SHS_COURSES } from "../src/shsCourses.js";

afterEach(cleanup);

const S = { card: {}, lbl: {}, sel: {}, inp: {}, sm: {}, err: {} };
let latest = {};

function Harness({ initialClass = "" }) {
  const [className, setClassName] = useState(initialClass);
  const [subject, setSubject] = useState("");
  const [shsCourse, setShsCourse] = useState("");
  const [shsKey, setShsKey] = useState("");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [pastedSyllabus, setPastedSyllabus] = useState("");
  latest = { className, subject, shsCourse, shsKey, selectedTopics };
  return (
    <TopicSelector
      subject={subject} setSubject={setSubject} className={className} setClassName={setClassName}
      shsCourse={shsCourse} setShsCourse={setShsCourse} shsKey={shsKey} setShsKey={setShsKey}
      term="Semester 1" selectedTopics={selectedTopics} setSelectedTopics={setSelectedTopics}
      pastedSyllabus={pastedSyllabus} setPastedSyllabus={setPastedSyllabus}
      onLoginRequired={() => {}} S={S} F="sans-serif"
    />
  );
}

/** The <select> that follows a label with this text (the component's labels aren't linked by htmlFor). */
const selectFor = (labelText) => {
  // Field titles are <label>s or step-title <span>s depending on the field; find the one whose text starts with
  // labelText, then the nearest ancestor that holds a <select>.
  const cands = [...document.querySelectorAll("label, span")]
    .filter(el => new RegExp("^" + labelText + "(\\b|\\s|\\*|$)", "i").test(el.textContent.trim()) && !el.querySelector("select"))
    .sort((a, b) => a.textContent.length - b.textContent.length);
  for (const el of cands) {
    let n = el.parentElement;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const s = n.querySelector("select"); if (s) return s; }
  }
  return null;
};
const optionTexts = (sel) => [...sel.querySelectorAll("option")].map(o => o.textContent);
const user = () => userEvent.setup();

// The strands live inside a collapsed "Choose from the curriculum" accordion (topics step); open it if it is closed.
const openStrands = async (u) => {
  if (screen.queryAllByRole("button").some(b => /^1\.\s/.test(b.textContent.trim()))) return;
  await u.click(screen.getByRole("button", { name: /Choose from the curriculum/i }));
};

// The curriculum is lazy-loaded; these tests check its CONTENT, so load every subject first.
beforeAll(async () => { await loadAllSubjects(); }, 120000);

describe("SHS flow: Class -> Programme -> Subject -> Strands -> Topics", () => {
  it("shows the Programme list as soon as an SHS class is chosen, and no subject yet", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 2");
    expect(selectFor("Programme")).not.toBeNull();
    expect(selectFor("Subject")).toBeNull();
    const progs = optionTexts(selectFor("Programme")).filter(t => !t.startsWith("-"));
    expect(progs).toEqual(Object.keys(SHS_COURSES));
    expect(progs).toContain("General Science");
  });

  it("does not show the Programme step for Basic classes", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    expect(selectFor("Programme")).toBeNull();
    expect(selectFor("Subject")).not.toBeNull();
  });

  it("lists the programme's subjects with clean names (no internal suffixes)", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 1");
    await u.selectOptions(selectFor("Programme"), "General Science");
    const subs = optionTexts(selectFor("Subject"));
    expect(subs).toContain("Biology");
    expect(subs).toContain("Physics");
    expect(subs.some(t => /\((GS|GA|BUS|STEM|VA|HE|Agric|Tech)\)/.test(t))).toBe(false);
    expect(subs).toContain("Other subject (type it in)");
  });

  it("choosing a subject sets the clean name for the paper and the internal key for the curriculum", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 2");
    await u.selectOptions(selectFor("Programme"), "General Science");
    await u.selectOptions(selectFor("Subject"), "Biology (GS)");
    expect(latest.subject).toBe("Biology");
    expect(latest.shsKey).toBe("Biology (GS)");
    expect(latest.shsCourse).toBe("General Science");
    // the real SHS 2 strands appear
    await openStrands(u);
    for (const st of getStrands("Biology (GS)", "SHS 2")) expect(screen.getByRole("button", { name: st.strand })).toBeTruthy();
  });

  it("strand -> sub-strand topics -> selecting a topic", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 1");
    await u.selectOptions(selectFor("Programme"), "Core Subjects");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    const strand = getStrands("Mathematics", "SHS 1")[0].strand;
    const subs = getSubStrands("Mathematics", "SHS 1", strand).map(s => s.name);
    expect(subs.length).toBeGreaterThan(0);
    await openStrands(u);
    await u.click(screen.getByRole("button", { name: strand }));
    await u.click(screen.getByRole("button", { name: subs[0] }));
    expect(latest.selectedTopics).toEqual([subs[0]]);
  });

  it("moving between SHS years keeps the programme and subject but clears topics", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 1");
    await u.selectOptions(selectFor("Programme"), "Business");
    await u.selectOptions(selectFor("Subject"), "Accounting");
    const strand = getStrands("Accounting", "SHS 1")[0].strand;
    await openStrands(u);
    await u.click(screen.getByRole("button", { name: strand }));
    await u.click(screen.getByRole("button", { name: getSubStrands("Accounting", "SHS 1", strand)[0].name }));
    expect(latest.selectedTopics).toHaveLength(1);

    await u.selectOptions(selectFor("Class"), "SHS 3");
    expect(latest.shsCourse).toBe("Business");
    expect(latest.subject).toBe("Accounting");
    expect(latest.selectedTopics).toEqual([]);
    await openStrands(u);
    for (const st of getStrands("Accounting", "SHS 3")) expect(screen.getByRole("button", { name: st.strand })).toBeTruthy();
  });

  it("switching to a Basic class clears the programme and subject", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 2");
    await u.selectOptions(selectFor("Programme"), "General Arts");
    await u.selectOptions(selectFor("Subject"), "Government");
    expect(latest.subject).toBe("Government");
    await u.selectOptions(selectFor("Class"), "Basic 8");
    expect(latest).toMatchObject({ subject: "", shsCourse: "", shsKey: "" });
  });

  it("changing the programme clears the subject so a stale pick can't leak across", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 2");
    await u.selectOptions(selectFor("Programme"), "General Science");
    await u.selectOptions(selectFor("Subject"), "Chemistry (GS)");
    await u.selectOptions(selectFor("Programme"), "Business");
    expect(latest.subject).toBe("");
    expect(latest.shsKey).toBe("");
  });

  it("a subject with no curriculum data yet stays selectable and asks for a pasted syllabus", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 2");
    await u.selectOptions(selectFor("Programme"), "Technical");
    expect(optionTexts(selectFor("Subject"))).toContain("Woodwork (paste syllabus)");
    await u.selectOptions(selectFor("Subject"), "Woodwork");
    expect(latest.subject).toBe("Woodwork");
    expect(screen.getByText(/aren't loaded yet/i)).toBeTruthy();
    expect(screen.queryByText(/Strands taught this semester/)).toBeNull();
  });

  it("'Other subject' lets the teacher type any subject name", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 3");
    await u.selectOptions(selectFor("Programme"), "General Arts");
    await u.selectOptions(selectFor("Subject"), "__other__");
    const input = screen.getByPlaceholderText(/Elective Geography/);
    await u.type(input, "Elective Geography");
    expect(latest.subject).toBe("Elective Geography");
    expect(latest.shsKey).toBe("__other__");
  });

  it("uses 'semester' wording for the strand picker at SHS and 'term' at Basic", async () => {
    const u = user(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 1");
    await u.selectOptions(selectFor("Programme"), "Core Subjects");
    await u.selectOptions(selectFor("Subject"), "English Language");
    expect(screen.getByText(/Strands taught this semester/)).toBeTruthy();
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    expect(screen.getByText(/Strands taught this term/)).toBeTruthy();
  });

  it("every programme lists exactly its subjects, in the planner order", async () => {
    const u = user();
    for (const course of Object.keys(SHS_COURSES)) {
      cleanup(); render(<Harness />);
      await u.selectOptions(selectFor("Class"), "SHS 3");
      await u.selectOptions(selectFor("Programme"), course);
      const keys = [...selectFor("Subject").querySelectorAll("option")].map(o => o.value).filter(v => v && v !== "__other__");
      expect(keys).toEqual(SHS_COURSES[course].map(s => s.key));
    }
  });
});
