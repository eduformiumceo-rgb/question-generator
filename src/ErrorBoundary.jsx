/**
 * ErrorBoundary — catches render-time errors in the Questions Generator
 * (a malformed AI response slipping past validation, a browser quirk, etc.)
 * and shows a recoverable message instead of a blank white screen, which is
 * what React shows by default with no boundary. This is the kind of gap
 * that's invisible in a code review and only shows up the first time a real
 * user hits an edge case — worth closing preemptively.
 */
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("[QuestionsGenerator] Unexpected render error:", error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 16px", textAlign: "center", fontFamily: "'DM Sans',system-ui,-apple-system,sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <p style={{ fontSize: 14, color: "var(--text, #0D1117)", marginBottom: 16 }}>
            Something went wrong displaying this page. Your exam credits are safe — nothing is charged just from this.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ background: "#0D9488", border: "none", borderRadius: 99, padding: "12px 24px", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
