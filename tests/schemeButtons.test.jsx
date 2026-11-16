// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/auth.js", () => ({ getToken: () => null }));
import TopicSelector from "../src/components/TopicSelector.jsx";

afterEach(cleanup);
const S = { card: {}, lbl: {}, sel: {}, inp: {}, sm: {}, err: {}, danger: {} };

function Harness() {
  const [className, setClassName] = useState("");
  const [subject, setSubject] = useState("");
  const [shsCourse, setShsCourse] = useState("");
  const [shsKey, setShsKey] = useState("");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [pastedSyllabus, setPastedSyllabus] = useState("");
  return (
    <TopicSelector
      subject={subject} setSubject={setSubject} className={className} setClassName={setClassName}
      shsCourse={shsCourse} setShsCourse={setShsCourse} shsKey={shsKey} setShsKey={setShsKey}
      term="Term 1" selectedTopics={selectedTopics} setSelectedTopics={setSelectedTopics}
      pastedSyllabus={pastedSyllabus} setPastedSyllabus={setPastedSyllabus}
      onLoginRequired={() => {}} S={S} F="sans-serif"
    />
  );
}
const selectFor = (t) => {
  // Field titles are <label>s or step-title <span>s depending on the field; find the one whose text starts with
  // t, then the nearest ancestor that holds a <select>.
  const cands = [...document.querySelectorAll("label, span")]
    .filter(el => new RegExp("^" + t + "(\\b|\\s|\\*|$)", "i").test(el.textContent.trim()) && !el.querySelector("select"))
    .sort((a, b) => a.textContent.length - b.textContent.length);
  for (const el of cands) {
    let n = el.parentElement;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const s = n.querySelector("select"); if (s) return s; }
  }
  return null;
};

describe("Scheme of Learning upload button", () => {
  it("shows one flat Upload button with no shadow, emoji or icon, and no Load button", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "English Language");

    const upload = screen.getByRole("button", { name: "Upload My Scheme of Learning" });
    expect(upload.style.boxShadow).toBe("none");
    expect(upload.textContent).not.toMatch(/[\u2190-\u27bf\u{1F000}-\u{1FFFF}]/u);
    expect(upload.querySelector("svg, img")).toBeNull();

    expect(screen.queryByRole("button", { name: /Load My Scheme of Learning/ })).toBeNull();
    expect(screen.getByText("Or list topics (optional)")).toBeTruthy();
  });
});
