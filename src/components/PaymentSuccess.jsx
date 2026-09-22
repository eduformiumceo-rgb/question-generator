/**
 * PaymentSuccess — route this at "/payment-success" (matches the
 * exam-payment endpoint's Paystack callback_url). Verifies the transaction
 * server-side (never trusts the redirect alone) and reports the result.
 */
import React, { useEffect, useState } from "react";
import { getToken } from "../auth.js";

const ACCOUNT_API = "/api/exam-payment";

export default function PaymentSuccess({ onDone, S, F }) {
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const reference = params.get("reference") || params.get("trxref") || sessionStorage.getItem("eduformium_pending_exam_ref");
      if (!reference) { setStatus("error"); setMessage("No payment reference found."); return; }

      try {
        const token = getToken ? getToken() : null;
        const res = await fetch(`${ACCOUNT_API}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reference }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Verification failed.");
        sessionStorage.removeItem("eduformium_pending_exam_ref");
        setStatus("success");
        setMessage(`${data.credits_added} credits added. New balance: ${data.new_balance}.`);
      } catch (e) {
        setStatus("error");
        setMessage(e.message || "Could not verify your payment. If you were charged, please contact support.");
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 16px", textAlign: "center", fontFamily: F }}>
      <div style={S.card}>
        {status === "verifying" && <p style={{ color: "var(--text)", fontFamily: F }}>Confirming your payment…</p>}
        {status === "success" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <p style={{ color: "var(--text)", fontFamily: F, fontWeight: 600 }}>{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <p style={{ color: "var(--err-text)", fontFamily: F }}>{message}</p>
          </>
        )}
        <button style={{ ...S.btn, width: "100%", marginTop: 16 }} onClick={onDone}>
          Back to Questions Generator
        </button>
      </div>
    </div>
  );
}
