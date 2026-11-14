import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import { F, S } from "./sharedStyles.jsx";
import QuestionsGenerator from "./QuestionsGenerator.jsx";
import PaymentSuccess from "./components/PaymentSuccess.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { completeHubHandoff } from "./hubHandoff.js";

// Minimal path-based routing — no react-router dependency needed for a
// two-route app. "/payment-success" matches exam-payment's Paystack
// callback_url (see functions/api/exam-payment/[[path]].js); everything
// else renders the main generator.
function App() {
  const path = window.location.pathname;

  if (path === "/payment-success") {
    return (
      <PaymentSuccess
        S={S}
        F={F}
        onDone={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  return <QuestionsGenerator />;
}

// Opened from the Eduformium Hub with a one-time code: sign in first, then draw (so the page starts signed in).
// With no code this resolves at once and nothing changes.
completeHubHandoff().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
});

// Register the service worker so the app is installable and the shell loads
// offline. Production builds only — a dev-server service worker would serve
// stale code while editing.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
