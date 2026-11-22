/**
 * Footer - slim, professional footer for the app. Links go to the legal pages on the main
 * Eduformium site, so there is one source of truth for the policies.
 */
import React from "react";

const SITE = "https://eduformium.com";
const LINKS = [
  { label: "Privacy", href: `${SITE}/privacy` },
  { label: "Terms", href: `${SITE}/terms` },
  { label: "Refunds", href: `${SITE}/refund` },
  { label: "Compliance", href: `${SITE}/compliance` },
  { label: "Pricing", href: `${SITE}/pricing` },
  { label: "Help", href: "mailto:hello@eduformium.com" },
];

const CSS = `
.qf{max-width:760px;margin:0 auto;padding:8px 16px calc(28px + env(safe-area-inset-bottom,0px))}
.qf-in{border-top:1px solid var(--border);padding-top:22px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.qf-brand{font-family:'Playfair Display',serif;font-size:18px;font-weight:800;line-height:1}
.qf-links{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 4px;margin:0;padding:0;list-style:none}
.qf-links a{display:inline-block;padding:6px 10px;font-size:13px;font-weight:500;color:var(--text-secondary);text-decoration:none;border-radius:8px}
.qf-links a:hover{color:var(--accent)}
.qf-links a:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.qf-copy{font-size:12px;color:var(--text-muted);line-height:1.6}
.qf-copy a{color:inherit;text-decoration:underline}
`;

export default function Footer({ F }) {
  return (
    <footer className="qf" style={{ fontFamily: F }} role="contentinfo">
      <style>{CSS}</style>
      <div className="qf-in">
        <a href={SITE} className="qf-brand" target="_blank" rel="noopener noreferrer" aria-label="Eduformium" style={{ textDecoration: "none" }}>
          <span style={{ color: "var(--logo-edu)" }}>Edu</span><span style={{ color: "var(--logo-formium)" }}>formium</span>
        </a>
        <ul className="qf-links">
          {LINKS.map((l) => (
            <li key={l.label}><a href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer">{l.label}</a></li>
          ))}
        </ul>
        <div className="qf-copy">
          &copy; {new Date().getFullYear()} Eduformium AI. All rights reserved.<br />
          Built for African education.
        </div>
      </div>
    </footer>
  );
}
