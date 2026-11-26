/**
 * AppNav - the three places in Assessment Studio, laid out like the Lesson Planner:
 *   Desktop / tablet  a centred pill switch under the header (sliding teal pill)
 *   Phone             a bottom tab bar with icon pills (hidden on desktop)
 *
 * Tabs:  Assessment (build a paper)  |  Shading Sheet (answer sheet)  |  My Assessments (saved papers)
 * Visibility is pure CSS (see theme.css, .qa-top-nav / .qa-bottom-nav) so there is no layout flash.
 */
import React from "react";

const ic = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const NAV_TABS = [
  { id: "generate", label: "Assessment", short: "Assessment",
    icon: <svg {...ic}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 14l2 2 4-4" /></svg> },
  { id: "shading", label: "Shading Sheet", short: "Shading",
    icon: <svg {...ic}><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.6" /><circle cx="15.5" cy="8.5" r="1.6" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.6" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.6" /></svg> },
  { id: "saved", label: "My Assessments", short: "Saved",
    icon: <svg {...ic}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg> },
];

const W = 168, H = 36, P = 3, GAP = 2; // pill geometry (matches the Lesson Planner's pill switch, slightly wider for the longer labels)

function onKeys(e, tab, setTab) {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  const i = NAV_TABS.findIndex(t => t.id === tab);
  const n = NAV_TABS[(i + (e.key === "ArrowRight" ? 1 : NAV_TABS.length - 1)) % NAV_TABS.length];
  setTab(n.id);
  requestAnimationFrame(() => document.getElementById(`qa-tab-${n.id}`)?.focus());
}

export function TopNav({ tab, setTab, savedCount = 0, F }) {
  const idx = Math.max(0, NAV_TABS.findIndex(t => t.id === tab));
  return (
    <nav className="qa-top-nav" aria-label="Assessment Studio sections">
      <div className="qa-top-nav-in">
        <div className="qa-pill-track" role="tablist" onKeyDown={e => onKeys(e, tab, setTab)}>
          <span aria-hidden="true" className="qa-pill-thumb" style={{ width: W, height: H, top: P, left: P, transform: `translateX(${idx * (W + GAP)}px)` }} />
          {NAV_TABS.map(t => {
            const on = tab === t.id;
            return (
              <button key={t.id} id={`qa-tab-${t.id}`} role="tab" type="button" aria-selected={on} tabIndex={on ? 0 : -1}
                className={`qa-top-tab${on ? " active" : ""}`} onClick={() => setTab(t.id)}
                style={{ width: W, height: H, fontFamily: F, fontWeight: on ? 600 : 500 }}>
                {t.label}
                {t.id === "saved" && savedCount > 0 && <span className="qa-top-badge">{savedCount > 99 ? "99+" : savedCount}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function BottomNav({ tab, setTab, savedCount = 0, hidden = false, F }) {
  return (
    <nav className={`qa-bottom-nav${hidden ? " is-hidden" : ""}`} aria-label="Assessment Studio sections" style={{ fontFamily: F }}>
      {NAV_TABS.map(t => {
        const on = tab === t.id;
        return (
          <button key={t.id} type="button" className={`qa-bnav-btn${on ? " active" : ""}`} aria-current={on ? "page" : undefined} onClick={() => setTab(t.id)}>
            <span className="qa-bnav-icon-wrap">
              {t.icon}
              {t.id === "saved" && savedCount > 0 && <span className="qa-bnav-badge">{savedCount > 99 ? "99+" : savedCount}</span>}
            </span>
            <span className="qa-bnav-label">{t.short}</span>
          </button>
        );
      })}
    </nav>
  );
}
