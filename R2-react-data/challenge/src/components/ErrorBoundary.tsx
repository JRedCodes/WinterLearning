import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of the children after a render error. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches errors thrown while RENDERING its children (and in their effects /
 * lifecycle), shows a fallback instead of a blank page, and lets the user retry.
 *
 * It does NOT catch errors in event handlers or async code (a rejected fetch in
 * a click handler): handle those where they happen, or surface them as state
 * (TanStack Query does this for you with `error`).
 *
 * Error boundaries are still class components in React 19: there is no hook
 * equivalent of getDerivedStateFromError / componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // In production: send to Sentry/your error tracker with info.componentStack.
    console.error("Render error caught by ErrorBoundary", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset });
    return (
      <div role="alert" className="crash">
        <p>Something went wrong while showing this page.</p>
        <button type="button" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
