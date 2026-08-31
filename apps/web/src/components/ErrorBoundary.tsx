import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidMount(): void {
    // Hydration beacon: the page-level watchdog waits for this before standing
    // down, so a never-hydrating island surfaces an actionable panel.
    (window as unknown as { __islandReady?: boolean }).__islandReady = true;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] island crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel error-banner" role="alert">
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
