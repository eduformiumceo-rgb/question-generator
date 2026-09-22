/**
 * TopUpModal — buy more exam credits via Paystack.
 * Redirect-based flow (not inline popup) for the widest device/browser
 * compatibility, including low-end Android — matches the pattern the
 * exam-payment endpoint's `callback_url` already expects.
 */
import React, { useEffect, useState } from "react";
import { getToken } from "../auth.js";

const ACCOUNT_API = "/api/exam-payment";

export default function TopUpModal({ onClose, onPurchased, S, F }) {
  const [packages, setPackages] = useState([]);
  const [loadingPkg, setLoadingPkg] = useState(null);
  const [error, setError] = useState("");

  // Escape closes the modal — standard dialog keyboard behaviour.
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken ? getToken() : null;
        const res = await fetch(`${ACCOUNT_API}/balance`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setPackages(data.packages || []);
      } catch {
        setError("Couldn't load credit packages. Please try again.");
      }
    })();
  }, []);

  const buy = async (pkg) => {
    setError("");
    setLoadingPkg(pkg.id);
    try {
      const token = getToken ? getToken() : null;
      const res = await fetch(`${ACCOUNT_API}/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ package_id: pkg.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Could not start payment.");
      // Remember the reference so payment-success can verify it, then redirect to Paystack.
      sessionStorage.setItem("eduformium_pending_exam_ref", data.reference);
      window.location.href = data.authorization_url;
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
      setLoadingPkg(null);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
    }} onClick={onClose} role="presentation">
      <div
        style={{ ...S.card, maxWidth: 420, width: "100%", margin: 0 }} onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="topup-modal-title"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 id="topup-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Top Up Exam Credits</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>×</button>
        </div>

        {error && <div style={S.err}><span>⚠</span><span>{error}</span></div>}

        {!packages.length && !error && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: F, padding: "20px 0", textAlign: "center" }}>Loading packages…</div>
        )}

        {packages.map(pkg => (
          <button
            key={pkg.id} onClick={() => buy(pkg)} disabled={loadingPkg !== null}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
              border: "1.5px solid var(--border-strong)", borderRadius: 12, padding: "14px 16px", marginBottom: 8,
              background: "var(--card-bg)", cursor: loadingPkg ? "default" : "pointer", fontFamily: F,
              opacity: loadingPkg && loadingPkg !== pkg.id ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{pkg.label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>
              {loadingPkg === pkg.id ? "Redirecting…" : `GH₵${(pkg.ghs / 100).toFixed(2)}`}
            </span>
          </button>
        ))}

        <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: F, marginTop: 10, textAlign: "center" }}>
          Secure payment via Paystack. Mobile Money and card accepted.
        </p>
      </div>
    </div>
  );
}
