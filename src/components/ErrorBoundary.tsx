import React from "react";
import { logDiagnostic } from "../runtime/diagnostics";
import { logError } from "../runtime/logger";

export class ErrorBoundary extends React.Component<
  { title?: string; children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { title?: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown) {
    logError("RUNTIME", "UI error boundary caught error", String(error));
    logDiagnostic("error", `${this.props.title ?? "Deck Shelves"} crashed`, error instanceof Error ? error.message : String(error));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, width: 360, maxWidth: 360 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{this.props.title ?? "Deck Shelves"}</div>
          <div style={{ opacity: 0.85, fontSize: 13, lineHeight: 1.35 }}>
            The settings UI failed to render.
          </div>
          {this.state.message ? (
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8, wordBreak: "break-word" }}>
              {this.state.message}
            </div>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}
