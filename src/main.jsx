import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import { F, S } from "./sharedStyles.jsx";
import QuestionsGenerator from "./QuestionsGenerator.jsx";
import PaymentSuccess from "./components/PaymentSuccess.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import AuthCallback from "./AuthCallback.jsx";

// Minimal path-based routing — no react-router dependency needed for a
// two-route app. "/payment-success" matches exam-payment's Paystack
// callback_url (see functions/api/exam-payment/[[path]].js); everything
// else renders the main generator.
function App() {
  const path = window.location.pathname;

  // Google sign-in redirects here after consent. AuthCallback exchanges the
  // Supabase session for this app's own JWT (handleGoogleCallback in auth.js)
  // and sends the teacher back to "/". Without this route, Google sign-in
  // could never complete — the tokens would land in the URL and be ignored.
  if (path === "/auth/callback") {
    return <AuthCallback />;
  }

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
