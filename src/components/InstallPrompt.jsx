/**
 * InstallPrompt — "Install App" modal.
 * Same design and behaviour as the Lesson Planner's install modal
 * (gradient header with the app logo, shimmering Install button,
 * "Maybe later" / "Don't show again", iOS "Add to Home Screen" note,
 * bottom sheet on phones) — only the app name, tagline and logo differ.
 */
import React, { useState } from "react";
import { F } from "../sharedStyles.jsx";
import { isIOSDevice } from "../pwaInstall.js";

const GRADIENT = "linear-gradient(120deg,#1B3E8A 0%,#0D9488 100%)";

const Spin = () => (
  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.25)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "pwa-spin .75s linear infinite", display: "inline-block", flexShrink: 0 }} />
);

export default function InstallPrompt({ onClose, deferredPromptRef }) {
  const isIOS = isIOSDevice();
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);

  const handleInstall = async () => {
    if (isIOS) return;
    const prompt = deferredPromptRef?.current;
    if (!prompt) { onClose("permanent"); return; }
    setInstalling(true);
    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      deferredPromptRef.current = null;
      if (outcome === "accepted") {
        setDone(true);
        setTimeout(() => onClose("permanent"), 1800);
      } else {
        onClose("dismissed");
      }
    } catch { onClose("dismissed"); }
    finally { setInstalling(false); }
  };

  return (
    <>
      <style>{`
        @keyframes pwa-in {
          /* No scale() — causes expensive compositing on low-end Android */
          from { opacity:0; transform:translateZ(0) translateY(16px); }
          to   { opacity:1; transform:translateZ(0) translateY(0); }
        }
        @keyframes pwa-overlay-in { from{opacity:0} to{opacity:1} }
        @keyframes pwa-shimmer { 0%{transform:translateX(-100%)} 60%,100%{transform:translateX(220%)} }
        @keyframes pwa-spin { to { transform: rotate(360deg); } }
        .pwa-overlay {
          position:fixed; inset:0; z-index:600;
          background:rgba(4,8,24,.6);
          display:flex; align-items:center; justify-content:center; padding:20px;
          animation:pwa-overlay-in .15s ease both;
          will-change:opacity;
          transform:translateZ(0);
          -webkit-transform:translateZ(0);
        }
        @media(max-width:640px){
          .pwa-overlay { align-items:flex-end; padding:0; }
          .pwa-card    { border-radius:22px 22px 0 0 !important; max-width:100% !important; padding-bottom:env(safe-area-inset-bottom); }
        }
        .pwa-card {
          background:var(--card-bg);
          border-radius:20px;
          width:100%; max-width:360px;
          overflow:hidden;
          animation:pwa-in .18s cubic-bezier(.22,1,.36,1) both;
          isolation:isolate;
          -webkit-mask-image:-webkit-radial-gradient(white,black);
          mask-image:radial-gradient(white,black);
          backface-visibility:hidden;
          -webkit-backface-visibility:hidden;
          contain:layout style;
        }
      `}</style>

      <div className="pwa-overlay" role="dialog" aria-modal="true" aria-label="Install Questions Generator">
        <div className="pwa-card">

          {/* -- Top strip -- */}
          <div style={{ background: GRADIENT, padding: "22px 20px 20px", position: "relative" }}>
            <button onClick={() => onClose("dismissed")} aria-label="Close" style={{
              position: "absolute", top: 12, right: 12,
              width: 26, height: 26, borderRadius: "50%",
              background: "rgba(255,255,255,.18)", border: "none",
              color: "#fff", fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: F, lineHeight: 1,
            }}>×</button>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src="/questions-logo.png"
                alt="Eduformium Questions"
                style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, objectFit: "contain" }}
              />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: F, lineHeight: 1.1 }}>
                  {done ? "App Installed" : "Questions Generator"}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.72)", fontFamily: F, fontWeight: 500, marginTop: 3 }}>
                  {done ? "" : "AI-powered Exam Questions"}
                </div>
              </div>
            </div>
          </div>

          {/* -- Body -- */}
          <div style={{ padding: "20px 20px 22px" }}>
            {done ? (
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--accent-soft)", border: "1.5px solid var(--tag-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 14px",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", fontFamily: F, lineHeight: 1.6 }}>
                  Eduformium Questions has been added to your home screen.
                </p>
              </div>
            ) : (
              <>
                <p style={{ margin: "0 0 18px", fontSize: 14, color: "var(--text-secondary)", fontFamily: F, lineHeight: 1.6 }}>
                  Get the full Eduformium experience, faster and always at your fingertips.
                </p>

                {isIOS && (
                  <div style={{
                    background: "var(--accent-soft)", border: "1px solid var(--tag-border)",
                    borderRadius: 10, padding: "11px 14px", marginBottom: 18,
                    fontSize: 13, color: "var(--text-secondary)", fontFamily: F, lineHeight: 1.6,
                  }}>
                    In Safari tap <strong style={{ color: "var(--text)" }}>Share</strong>, then <strong style={{ color: "var(--text)" }}>Add to Home Screen</strong>.
                  </div>
                )}

                {!isIOS && (
                  <button onClick={handleInstall} disabled={installing} style={{
                    width: "100%", height: 48, borderRadius: 12, border: "none",
                    background: GRADIENT,
                    color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: F,
                    cursor: installing ? "not-allowed" : "pointer",
                    opacity: installing ? 0.7 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    marginBottom: 10, transition: "opacity .15s",
                    position: "relative", overflow: "hidden",
                  }}>
                    {!installing && (
                      <span style={{
                        position: "absolute", top: 0, left: 0, bottom: 0, width: "55%",
                        background: "linear-gradient(105deg, transparent 20%, rgba(255,255,255,.28) 50%, transparent 80%)",
                        animation: "pwa-shimmer 2.2s ease-in-out infinite",
                        pointerEvents: "none",
                      }} />
                    )}
                    {installing
                      ? <><Spin /><span>Installing…</span></>
                      : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13" /><path d="M8 12l4 4 4-4" /><path d="M3 19h18" /></svg><span>Install App</span></>
                    }
                  </button>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onClose("dismissed")} style={{
                    flex: 1, height: 40, borderRadius: 10,
                    border: "1.5px solid var(--border-strong)",
                    background: "transparent", color: "var(--text-secondary)",
                    fontSize: 13, fontFamily: F, fontWeight: 500, cursor: "pointer",
                  }}>Maybe later</button>
                  <button onClick={() => onClose("permanent")} style={{
                    flex: 1, height: 40, borderRadius: 10,
                    border: "1.5px solid var(--border-strong)",
                    background: "transparent", color: "var(--text-muted)",
                    fontSize: 13, fontFamily: F, fontWeight: 500, cursor: "pointer",
                  }}>Don't show again</button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
