// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/auth.js", () => ({ getToken: () => null }));
import TopicSelector from "../src/components/TopicSelector.jsx";
import { MAX_SYLLABUS_CHARS } from "../src/moderation.js";
import { makeDocx, makePdf, SCHEME_ROWS } from "./helpers/schemeFixtures.js";

afterEach(cleanup);
const S = { card: {}, lbl: {}, sel: {}, inp: {}, sm: {}, err: {}, danger: {} };
let latest = {};

function Harness() {
  const [className, setClassName] = useState("");
  const [subject, setSubject] = useState("");
  const [shsCourse, setShsCourse] = useState("");
  const [shsKey, setShsKey] = useState("");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [pastedSyllabus, setPastedSyllabus] = useState("");
  latest = { selectedTopics, pastedSyllabus, subject };
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
const upload = (f) => fireEvent.change(screen.getByLabelText("Upload scheme of learning file"), { target: { files: [f] } });
const docxFile = async (rows = SCHEME_ROWS) => new File([await makeDocx(rows)], "Term 1 Scheme.docx");

describe("Upload your Scheme of Learning", () => {
  it("is offered as soon as a class is chosen, not before", async () => {
    const u = userEvent.setup(); render(<Harness />);
    expect(screen.queryByLabelText("Upload scheme of learning file")).toBeNull();
    await u.selectOptions(selectFor("Class"), "Basic 7");
    expect(screen.getByLabelText("Upload scheme of learning file")).toBeTruthy();
  });

  it("subject chosen first: upload fills the scheme box and ticks the matching topics", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    upload(await docxFile());
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3));
    expect(latest.selectedTopics).toEqual(expect.arrayContaining([
      "Sub-Strand 1: Number and Numeration Systems", "Sub-Strand 2: Number Operations", "Sub-Strand 2: Algebraic Expressions",
    ]));
    expect(latest.pastedSyllabus).toContain("2 | Number | Number Operations | B7.1.2.1");
    expect(screen.getByText("Term 1 Scheme.docx")).toBeTruthy();
    expect(screen.getByText(/Found 3 topics/)).toBeTruthy();
  });

  it("upload FIRST, subject afterwards: topics are ticked once the subject is picked", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    upload(await docxFile());
    await screen.findByText(/choose your subject/i);
    expect(latest.selectedTopics).toEqual([]);
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3));
  });

  it("works for a PDF too", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    upload(new File([makePdf(SCHEME_ROWS)], "scheme.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3), { timeout: 8000 });
    expect(latest.pastedSyllabus).toContain("Number Operations");
  });

  it("changing subject re-matches (a Maths scheme ticks nothing under English)", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    upload(await docxFile());
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3));
    await u.selectOptions(selectFor("Subject"), "English Language");
    await waitFor(() => expect(latest.selectedTopics).toEqual([]));
    expect(latest.pastedSyllabus).toContain("Number Operations"); // the scheme text is still there
  });

  it("Remove clears the file, its text and the ticks it made", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    upload(await docxFile());
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3));
    await u.click(screen.getByRole("button", { name: "Remove" }));
    expect(latest.selectedTopics).toEqual([]);
    expect(latest.pastedSyllabus).toBe("");
    expect(screen.queryByText("Term 1 Scheme.docx")).toBeNull();
  });

  it("Replace swaps the scheme: the old scheme's ticks are removed, the new one's applied", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    upload(await docxFile());
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3));
    upload(await docxFile([["Week", "Sub-Strand"], ["1", "Measurement"]]));
    await waitFor(() => expect(latest.selectedTopics).toEqual(["Sub-Strand 2: Measurement"]));
    expect(latest.pastedSyllabus).not.toContain("Number Operations");
  });

  it("a failed Replace keeps the existing scheme and its ticks", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    upload(await docxFile());
    await waitFor(() => expect(latest.selectedTopics.length).toBe(3));
    upload(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "photo.jpg", { type: "image/jpeg" }));
    await screen.findByText(/isn't supported/);
    expect(latest.selectedTopics.length).toBe(3);
    expect(screen.getByText("Term 1 Scheme.docx")).toBeTruthy();
  });

  it("SHS: Programme -> Subject flow ticks matching SHS topics from an uploaded scheme", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "SHS 1");
    await u.selectOptions(selectFor("Programme"), "General Science");
    const subjSel = selectFor("Subject");
    const bioOpt = [...subjSel.querySelectorAll("option")].find(o => /^Biology/.test(o.textContent));
    await u.selectOptions(subjSel, bioOpt.value);
    upload(await docxFile([["Week", "Topic"], ["1", "Biology as the science of life"]]));
    await waitFor(() => expect(latest.selectedTopics).toContain("1. BIOLOGY AS THE SCIENCE OF LIFE"));
  });

  it("Remove keeps text the teacher has edited", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    upload(await docxFile());
    const box = await screen.findByPlaceholderText(/List the topics/);
    await waitFor(() => expect(box.value).toContain("Number Operations"));
    await u.type(box, " my note");
    await u.click(screen.getByRole("button", { name: "Remove" }));
    expect(latest.pastedSyllabus).toContain("my note");
  });

  it("shows a clear message for a bad file and leaves the form usable", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    upload(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "photo.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText(/isn't supported/)).toBeTruthy();
    expect(screen.getByLabelText("Upload scheme of learning file")).toBeTruthy();
  });

  it("warns when a long scheme had to be cut to the limit", async () => {
    const u = userEvent.setup(); render(<Harness />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    const rows = [["Week", "Topic"], ...Array.from({ length: 400 }, (_, i) => [String(i), `Unique lesson topic number ${i} with a fairly long descriptive sentence about it`])];
    upload(await docxFile(rows));
    expect(await screen.findByText(/Your scheme is long/)).toBeTruthy();
    expect(latest.pastedSyllabus.length).toBeLessThanOrEqual(MAX_SYLLABUS_CHARS);
  });
});
