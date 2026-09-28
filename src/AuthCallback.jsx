/**
 * src/AuthCallback.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Google OAuth callback page.
 *
 * HOW IT WORKS:
 *  1. User clicks "Continue with Google" → Supabase opens Google login
 *  2. Google redirects back to: https://yourdomain.com/auth/callback
 *  3. THIS page reads the Supabase session from the URL hash,
 *     sends the access token to our Cloudflare Worker /api/auth/google,
 *     gets back our own app JWT, saves it, and redirects to the app.
 *
 * SETUP REQUIRED (one-time):
 *  1. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file
 *  2. Add this route to your router (see below)
 *  3. In Supabase dashboard → Authentication → URL Configuration:
 *       - Add https://yourdomain.com/auth/callback to "Redirect URLs"
 *  4. In Google Cloud Console → OAuth 2.0 Client:
 *       - Add https://yourdomain.com/auth/callback to "Authorized redirect URIs"
 *       - Add https://<your-project>.supabase.co/auth/v1/callback too
 *
 * ROUTER SETUP (add to main.jsx or wherever you define routes):
 *  If using React Router:
 *    import AuthCallback from "./AuthCallback";
 *    <Route path="/auth/callback" element={<AuthCallback />} />
 *
 *  If NOT using a router (single-page app like yours):
 *    In main.jsx, before rendering App, check the path:
 *
 *    import AuthCallback from "./AuthCallback";
 *    const path = window.location.pathname;
 *    if (path === "/auth/callback") {
 *      ReactDOM.createRoot(document.getElementById("root")).render(<AuthCallback />);
 *    } else {
 *      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
 *    }
 */

import React, { useEffect, useState } from "react";
import { handleGoogleCallback } from "./auth.js";

const F = "'DM Sans',system-ui,-apple-system,sans-serif";

// ── Standalone theme detection ──────────────────────────────────────────
// This page renders outside <App/> (see main.jsx), so it never receives
// App's THEME_CSS or data-theme attribute. We read the same localStorage
// key ("glpg_theme") App.jsx uses, so a user's saved preference (or system
// preference, if they chose "system") is respected here too — keeping this
// page visually consistent with the rest of the app instead of always
// rendering light mode regardless of the user's actual theme.
const THEME_KEY = "glpg_theme";
function getCallbackTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY) || "system";
    if (saved === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return saved;
  } catch {
    return "light";
  }
}

export default function AuthCallback() {
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");
  const [theme] = useState(getCallbackTheme);
  const isDark = theme === "dark";

  useEffect(() => {
    async function finish() {
      // Debug breadcrumb: shows exactly what Google/Supabase actually sent
      // back on this redirect. Check this in the browser console if sign-in
      // fails — it tells you immediately whether a session/error arrived at
      // all, without needing to dig through the Network tab.
      console.log("[AuthCallback] landed with:", window.location.href);
      try {
        await handleGoogleCallback();
        setStatus("success");
        // Redirect to app after short delay so user sees confirmation
        setTimeout(() => { window.location.href = "/"; }, 1200);
      } catch (e) {
        console.error("[AuthCallback] failed:", e);
        setStatus("error");
        setMessage(e.message || "Something went wrong. Please try again.");
      }
    }
    finish();
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg, #F0F2F5)",
      fontFamily: F, padding: 24,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@800&display=swap');
        :root {
          --bg:             ${isDark ? "#1C1C1E" : "#F0F2F5"};
          --card-bg:        ${isDark ? "#2C2C2E" : "#FFFFFF"};
          --border:         ${isDark ? "rgba(255,255,255,.09)" : "#E1E5EB"};
          --text:           ${isDark ? "#F5F5F7" : "#0D1117"};
          --text-muted:     ${isDark ? "#AEAEB2" : "#5A6478"};
          --err-text:       ${isDark ? "#FF8080" : "#B91C1C"};
          --logo-edu:       ${isDark ? "#FFFFFF" : "#1B3E8A"};
          --logo-formium:   ${isDark ? "#3ECBB3" : "#0D9488"};
        }
      `}</style>
      <div style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border, #E1E5EB)",
        borderRadius: 20, padding: "48px 40px",
        maxWidth: 400, width: "100%", textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.08)",
      }}>
        {/* Brand */}
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Playfair Display',serif", marginBottom: 32 }}>
          <span style={{ color: "var(--logo-edu)" }}>Edu</span>
          <span style={{ color: "var(--logo-formium)" }}>formium</span>
        </div>

        {status === "loading" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                style={{ animation: "spin .7s linear infinite" }} aria-label="Loading">
                <circle cx="12" cy="12" r="10" stroke="#0D9488" strokeWidth="2.5"
                  strokeDasharray="31" strokeDashoffset="10" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text, #0D1117)", marginBottom: 6 }}>
              Signing you in…
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted, #5A6478)" }}>
              Just a moment while we set up your account.
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-label="Success">
                <circle cx="12" cy="12" r="10" fill="rgba(13,148,136,.12)" stroke="#0D9488" strokeWidth="1.5"/>
                <path d="M7.5 12.5l3 3 6-6" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text, #0D1117)", marginBottom: 6 }}>
              You're in!
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted, #5A6478)" }}>
              Redirecting you to Eduformium…
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-label="Error">
                <circle cx="12" cy="12" r="10" fill="rgba(185,28,28,.08)" stroke="#B91C1C" strokeWidth="1.5"/>
                <path d="M12 7v5M12 16h.01" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text, #0D1117)", marginBottom: 8 }}>
              Sign-in failed
            </div>
            <div style={{ fontSize: 13, color: "var(--err-text, #B91C1C)", marginBottom: 24, lineHeight: 1.6 }}>
              {message}
            </div>
            <button
              onClick={() => window.location.href = "/"}
              style={{
                background: "linear-gradient(135deg,#0D9488,#0F766E)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "12px 28px", fontSize: 14, fontWeight: 600,
                fontFamily: F, cursor: "pointer",
              }}>
              Back to home
            </button>
          </>
        )}
      </div>
    </div>
  );
}