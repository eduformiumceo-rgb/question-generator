/**
 * WizardProgress - "where am I?" stepper shown above the form.
 *
 * Derived entirely from what the teacher has already filled in, so it needs no state of its own:
 *   Class -> Topics -> Setup -> Review
 * The connecting line fills with a transform (compositor-only, no layout), and every dot pops in once when it changes.
 */
import React from "react";
import Icon from "./Icon.jsx";

export const STEP_LABELS = ["Class", "Topics", "Setup", "Review"];

/** Which step is current (0-3): first one not yet completed. */
export function currentStep({ hasClass, hasTopics, hasExam }) {
  if (!hasClass) return 0;
  if (!hasTopics) return 1;
  if (!hasExam) return 2;
  return 3;
}

export default function WizardProgress({ hasClass, hasTopics, hasExam }) {
  const idx = currentStep({ hasClass, hasTopics, hasExam });
  return (
    <nav aria-label="Progress">
      <ol className="qa-steps" style={{ "--qa-p": idx / (STEP_LABELS.length - 1) }}>
        {STEP_LABELS.map((label, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={label} className={`qa-step${done ? " is-done" : ""}${active ? " is-active" : ""}`} aria-current={active ? "step" : undefined}>
              <span className="qa-dot">{done ? <Icon name="check" size={14} stroke={2.6} /> : i + 1}</span>
              <span className="qa-step-label">{label}<span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{done ? " (completed)" : active ? " (current step)" : ""}</span></span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
