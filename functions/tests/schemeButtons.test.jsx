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
const selectFor = (t) => screen.queryByText((_, el) => el?.tagName === "LABEL" && el.textContent.trim().startsWith(t))?.parentElement.querySelector("select");

describe("Scheme of Learning buttons", () => {
  it("Upload comes first, Load comes second, both flat with no shadow or emoji", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "English Language");

    const upload = screen.getByRole("button", { name: "Upload My Scheme of Learning" });
    const load = screen.getByRole("button", { name: "Load My Scheme of Learning" });
    expect(upload.compareDocumentPosition(load) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const b of [upload, load]) {
      expect(b.style.boxShadow).toBe("none");
      expect(b.textContent).not.toMatch(/[\u2190-\u27bf\u{1F000}-\u{1FFFF}]/u);
      expect(b.querySelector("svg, img")).toBeNull();
    }
    // The Load button says where it loads from.
    expect(screen.getByText(/created and saved in the Lesson Planner/)).toBeTruthy();
    // The paste box is renamed.
    expect(screen.getByText("Or list topics (optional)")).toBeTruthy();
  });
});
