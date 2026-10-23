/**
 * AppHeader — sticky top bar, same look as the Lesson Planner's header:
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
  .qh-menu { position:fixed; top:60px; right:12px; width:240px; max-width:calc(100vw - 24px);
    background:var(--card-bg); z-index:160; border-radius:14px; border:1px solid var(--border);
    display:flex; flex-direction:column; overflow:hidden;
    animation:qh-menu-in .22s cubic-bezier(.22,1,.36,1) both; transform-origin:top right; }
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
  .qh-item { display:flex; align-items:center; gap:10px; width:100%; padding:10px 10px; border-radius:10px;
    border:none; background:transparent; color:var(--text); font-size:14px; font-weight:400; cursor:pointer;
    font-family:${F}; -webkit-tap-highlight-color:transparent; touch-action:manipulation; text-align:left; }
  .qh-item:hover { background:var(--accent-soft); }
  @media (max-width:640px) {
    .qh-inner { padding:0 12px; }
    .qh-brand-sub { font-size:8px !important; }
    .qh-credits-desktop { display:none; }
    .qh-credits-mobile { display:flex; }
  }
  @media (min-width:641px) and (max-width:900px) { .qh-inner { padding:0 20px; } }
`;

export default function AppHeader({ user, creditBalance, toDisplayCredits, onSignIn, onTopUp, onSignOut, canInstall, onInstall }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

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
              AI-powered exam questions
            </div>
          </div>

          {/* Right side */}
          <div className="qh-right">
            {!user && (
              <button onClick={onSignIn} style={{ ...S.btn, height: 34, padding: "0 18px", fontSize: 13, borderRadius: 99 }}>Sign In</button>
            )}

            {user && hasBalance && (
              <>
                {/* Desktop / tablet: full credits pill + Topup */}
                <div className="qh-credits-desktop">
                  <div style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: 99, border: "1px solid var(--border)", background: "var(--input-bg)" }}>
                    <Coin size={16} />
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

                {/* Mobile: one compact tappable chip — never wraps */}
                <button className="qh-credits-mobile" onClick={onTopUp} aria-label={`${credits} credits. Tap to top up`} style={{
                  alignItems: "center", gap: 5, height: 32, padding: "0 6px 0 9px", borderRadius: 99,
                  border: "1px solid var(--tag-border)", background: "var(--accent-soft)", cursor: "pointer",
                  fontFamily: F, flexShrink: 0, WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                }}>
                  <Coin size={16} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", lineHeight: 1, whiteSpace: "nowrap" }}>{credits}</span>
                  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: "#0D9488", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, lineHeight: 1, marginLeft: 1 }}>+</span>
                </button>
              </>
            )}

            {(user || canInstall) && (
              <button className={`qh-hbg${menuOpen ? " is-open" : ""}`} onClick={() => setMenuOpen((o) => !o)} aria-label="Account menu" aria-expanded={menuOpen}>
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
                <span className="qh-chevron">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Account dropdown */}
      {menuOpen && (
        <>
          <div className="qh-overlay" onClick={closeMenu} />
          <div className="qh-menu" role="menu">
            {user && (
            <div style={{ padding: "12px 16px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div className="qh-avatar" style={{ width: 38, height: 38 }}>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: F }}>{getInitials(user)}</span>
                {isUsableAvatarURL(user.avatar_url) && (
                  <img src={user.avatar_url} alt="" referrerPolicy="no-referrer"
                    style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", fontFamily: F, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{user.name || user.email}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: F, marginTop: 1 }}>Signed in</div>
              </div>
            </div>
            )}

            <div style={{ padding: "6px 12px" }}>
              {!user && (
                <button className="qh-item" role="menuitem" onClick={() => { closeMenu(); onSignIn(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  Sign In / Create Account
                </button>
              )}
              {user && hasBalance && (
                <button className="qh-item" role="menuitem" onClick={() => { closeMenu(); onTopUp(); }}>
                  <Coin size={16} />
                  <span style={{ flex: 1 }}>{credits} credits</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>Buy</span>
                </button>
              )}
              {canInstall && (
                <button className="qh-item" role="menuitem" onClick={() => { closeMenu(); onInstall(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13" /><path d="M8 12l4 4 4-4" /><path d="M3 19h18" /></svg>
                  Install App
                </button>
              )}
              {user && (
              <button className="qh-item" role="menuitem" style={{ color: "var(--signout-color)" }} onClick={() => { closeMenu(); onSignOut(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign out
              </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
