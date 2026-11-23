/**
 * AppHeader - sticky top bar, same look as the Lesson Planner's header:
 *   Left   Eduformium wordmark + tagline
 *   Right  Sign In (signed out)  |  credits + Topup + avatar menu (signed in)
 *
 * Mobile: the long "N credits · Top up" pill that used to wrap and look
 * broken is now a compact coin + number + "+" chip that can never wrap,
 * sitting beside the avatar. Desktop shows the full "N Credits" pill and
 * a separate Topup button, exactly like the Lesson Planner.
 */
import React, { useEffect, useState } from "react";
import { F, S } from "../sharedStyles.jsx";
import coinIcon from "../assets/dollar.png";
import { getThemeMode, setThemeMode } from "../theme.js";
import { HUB_HOME } from "../hubSignIn.js";

// Legal and help pages live on the main site (one source of truth). They used to sit in a page footer; now they are in the menu.
const SITE = "https://eduformium.com";
const LEGAL_LINKS = [
  { label: "Privacy", href: `${SITE}/privacy` },
  { label: "Terms", href: `${SITE}/terms` },
  { label: "Refunds", href: `${SITE}/refund` },
  { label: "Compliance", href: `${SITE}/compliance` },
  { label: "Pricing", href: `${SITE}/pricing` },
  { label: "Help", href: "mailto:hello@eduformium.com" },
];

const Sun = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>);
const Moon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>);
const Auto = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>);
const THEME_OPTS = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "auto", label: "Auto", Icon: Auto },
  { id: "dark", label: "Dark", Icon: Moon },
];

const getInitials = (u) => {
  const src = (u?.name || u?.email || "G").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "G") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
};
const isUsableAvatarURL = (u) => typeof u === "string" && /^https?:\/\//i.test(u);

const Coin = ({ size = 16 }) => (
  <img src={coinIcon} width={size} height={size} alt="" aria-hidden="true"
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }} />
);

const HEADER_CSS = `
  .qh-inner { width:100%; display:flex; align-items:center; justify-content:space-between;
    height:56px; padding:0 32px; box-sizing:border-box; gap:10px; }
  .qh-brand { min-width:0; flex-shrink:1; }
  .qh-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .qh-credits-desktop { display:flex; align-items:center; gap:10px; margin-right:4px; }
  .qh-credits-mobile  { display:none; }
  .qh-overlay { position:fixed; inset:0; background:transparent; z-index:150; }
  .qh-menu { position:fixed; top:62px; right:12px; width:272px; max-width:calc(100vw - 24px);
    background:var(--card-bg); z-index:160; border-radius:16px; border:1px solid var(--border);
    box-shadow:0 10px 30px rgba(16,24,40,.08), 0 2px 8px rgba(16,24,40,.04);
    display:flex; flex-direction:column; overflow:hidden;
    animation:qh-menu-in .22s cubic-bezier(.22,1,.36,1) both; transform-origin:top right; }
  [data-theme="dark"] .qh-menu { box-shadow:0 10px 30px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.2); }
  @keyframes qh-menu-in { from{opacity:0; transform:scale(.93) translateY(-8px);} to{opacity:1; transform:scale(1) translateY(0);} }
  .qh-hbg { display:flex; align-items:center; gap:5px; height:34px; border-radius:99px; padding:0 8px 0 3px;
    background:var(--input-bg); border:1.5px solid var(--border-strong); cursor:pointer; flex-shrink:0;
    transition:border-color .15s; -webkit-tap-highlight-color:transparent; }
  .qh-hbg:active { opacity:.85; }
  .qh-hbg.is-open { border-color:#0D9488; }
  .qh-avatar { width:26px; height:26px; border-radius:50%; background:linear-gradient(135deg,#1B3E8A,#0D9488);
    display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; position:relative; }
  .qh-chevron { display:flex; align-items:center; color:var(--text-muted);
    transition:transform .22s cubic-bezier(.22,1,.36,1); }
  .qh-hbg.is-open .qh-chevron { transform:rotate(180deg); }
  .qh-who { padding:16px 18px 10px; }
  .qh-who-name { font-size:14.5px; font-weight:700; line-height:1.3; color:var(--text); font-family:${F}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .qh-who-mail { font-size:12.5px; line-height:1.3; color:var(--text-muted); font-family:${F}; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .qh-list { padding:4px 8px 8px; }
  .qh-row { display:flex; align-items:center; justify-content:flex-start; gap:12px; width:100%; height:44px; padding:0 10px; border:none; border-radius:10px; background:transparent; color:var(--text); font-size:14px; font-weight:500; line-height:1; font-family:${F}; cursor:pointer; text-align:left; box-sizing:border-box; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
  a.qh-row { text-decoration:none; }
  .qh-row svg { color:var(--text-muted); flex-shrink:0; }
  .qh-row:hover, .qh-row:active { background:var(--surface-2); }
  .qh-row-sep { height:1px; background:var(--border); margin:6px 10px; }
  .qh-row-out { color:var(--signout-color); font-weight:600; }
  .qh-legal { display:grid; grid-template-columns:repeat(3,1fr); gap:2px 8px; padding:12px 18px 14px; border-top:1px solid var(--border); }
  .qh-legal a { padding:6px 0; font-size:12.5px; font-weight:500; line-height:1.2; font-family:${F}; color:var(--text-secondary); text-decoration:none; }
  .qh-legal a:hover { color:var(--accent); }
  .qh-legal-copy { grid-column:1 / -1; margin-top:6px; font-size:11.5px; line-height:1.2; color:var(--text-muted); font-family:${F}; }
  .qh-tbtn { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;
    background:var(--input-bg); border:1.5px solid var(--border-strong); color:var(--text-secondary); cursor:pointer;
    -webkit-tap-highlight-color:transparent; touch-action:manipulation; transition:border-color .15s,color .15s; }
  .qh-tbtn:hover { border-color:var(--accent); color:var(--accent); }
  .qh-tbtn svg { width:16px; height:16px; }
  @media (max-width:640px) {
    .qh-inner { padding:0 12px; }
    .qh-brand-sub { font-size:8px !important; }
    .qh-credits-desktop { display:none; }
    .qh-credits-mobile { display:flex; }
  }
  @media (min-width:641px) and (max-width:900px) { .qh-inner { padding:0 20px; } }
`;

export default function AppHeader({ user, creditBalance, toDisplayCredits, onSignIn, onTopUp, onSignOut, canInstall, onInstall, savedCount, onOpenSaved }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const [themeMode, setMode] = useState(getThemeMode);
  const pickTheme = (m) => { setMode(m); setThemeMode(m); };
  useEffect(() => { // keep in step if the theme is changed from somewhere else
    const on = (e) => setMode(e.detail);
    window.addEventListener("edu-theme-change", on);
    return () => window.removeEventListener("edu-theme-change", on);
  }, []);
  const nextTheme = themeMode === "light" ? "auto" : themeMode === "auto" ? "dark" : "light";
  const CurIcon = (THEME_OPTS.find((o) => o.id === themeMode) || THEME_OPTS[0]).Icon;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const hasBalance = creditBalance !== null && creditBalance !== undefined;
  const credits = hasBalance ? toDisplayCredits(creditBalance) : null;

  return (
    <>
      <style>{HEADER_CSS}</style>
      <header style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="qh-inner">

          {/* Brand */}
          <div className="qh-brand">
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Playfair Display',serif", letterSpacing: 0, lineHeight: 1, display: "flex", alignItems: "baseline" }}>
              <span style={{ color: "var(--logo-edu)" }}>Edu</span><span style={{ color: "var(--logo-formium)" }}>formium</span>
            </div>
            <div className="qh-brand-sub" style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: F, lineHeight: 1, letterSpacing: ".02em", marginTop: 3, whiteSpace: "nowrap" }}>
              Assessment Studio
            </div>
          </div>

          {/* Right side */}
          <div className="qh-right">
            <button type="button" className="qh-tbtn" onClick={() => pickTheme(nextTheme)}
              aria-label={`Appearance: ${themeMode}. Tap to switch to ${nextTheme}`} title={`Appearance: ${themeMode} (tap for ${nextTheme})`}>
              <CurIcon />
            </button>
            {!user && (
              <button onClick={onSignIn} style={{ ...S.btn, height: 34, padding: "0 18px", fontSize: 13, borderRadius: 99 }}>Sign In</button>
            )}

            {user && hasBalance && (
              <>
                {/* Desktop / tablet: full credits pill + Topup */}
                <div className="qh-credits-desktop">
                  <div style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: 99, border: "1px solid var(--border)", background: "var(--input-bg)" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: F, whiteSpace: "nowrap", letterSpacing: "-.01em" }}>
                      {credits} Credits
                    </span>
                  </div>
                  <button onClick={onTopUp} style={{
                    height: 32, padding: "0 14px", borderRadius: 99, border: "none",
                    background: "var(--logo-formium,#0D9488)", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    color: "#fff", fontFamily: F, whiteSpace: "nowrap", letterSpacing: "-.01em",
                  }}>Topup</button>
                </div>

                {/* Mobile: one compact tappable chip - never wraps */}
                <button className="qh-credits-mobile" onClick={onTopUp} aria-label={`${credits} credits. Tap to top up`} style={{
                  alignItems: "center", gap: 5, height: 32, padding: "0 6px 0 9px", borderRadius: 99,
                  border: "1px solid var(--tag-border)", background: "var(--accent-soft)", cursor: "pointer",
                  fontFamily: F, flexShrink: 0, WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", lineHeight: 1, whiteSpace: "nowrap" }}>{credits} Credits</span>
                </button>
              </>
            )}

              <button className={`qh-hbg${menuOpen ? " is-open" : ""}`} onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}>
                <span className="qh-avatar">
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: F, userSelect: "none" }}>
                    {user ? getInitials(user) : "G"}
                  </span>
                  {isUsableAvatarURL(user?.avatar_url) && (
                    <img src={user.avatar_url} alt="" referrerPolicy="no-referrer"
                      style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  )}
                </span>
              </button>
          </div>
        </div>
      </header>

      {/* Account dropdown: back to the Hub, who you are, your credits, install, sign out. (Theme lives in the header; My Exams is the card on the page.) */}
      {menuOpen && (
        <>
          <div className="qh-overlay" onClick={closeMenu} />
          <div className="qh-menu" role="menu">
            {user && (
              <div className="qh-who">
                <div className="qh-who-name">{user.name || user.email}</div>
                {user.name && user.email && <div className="qh-who-mail">{user.email}</div>}
              </div>
            )}
            <div className="qh-list">
              <a className="qh-row" role="menuitem" href={HUB_HOME} onClick={closeMenu}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
                Back to Eduformium Hub
              </a>
              {canInstall && (
                <button className="qh-row" role="menuitem" onClick={() => { closeMenu(); onInstall(); }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>
                  Install app
                </button>
              )}
              {user && (
                <>
                  <div className="qh-row-sep" role="separator" />
                  <button className="qh-row qh-row-out" role="menuitem" onClick={() => { closeMenu(); onSignOut(); }}>Sign out</button>
                </>
              )}
            </div>
            <nav className="qh-legal" aria-label="Legal and help">
              {LEGAL_LINKS.map((l) => (
                <a key={l.label} href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" onClick={closeMenu}>{l.label}</a>
              ))}
              <div className="qh-legal-copy">&copy; {new Date().getFullYear()} Eduformium AI</div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
