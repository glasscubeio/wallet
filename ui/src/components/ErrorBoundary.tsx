import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/Brand";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a single broken component can't leave the user
 * staring at a blank page.
 *
 * This exists because that is exactly what happened: a bad prop read inside
 * the code input threw during render, React unmounted the whole tree, and the
 * only symptom anyone could describe was "it breaks" — the actual TypeError
 * was only visible in the console.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] render error:", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
        <Brand size="lg" />

        <div className="max-w-[42ch] space-y-2">
          <h1 className="font-display text-[22px] font-semibold text-ink">
            This page hit an error
          </h1>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            Your money is safe — this is a display problem, not a transaction one. Reloading
            usually clears it.
          </p>
        </div>

        {/* Shown, not hidden: without it the only clue lives in the console. */}
        <pre className="max-w-full overflow-x-auto rounded-[10px] border border-line bg-card px-4 py-3 text-left font-mono text-[12px] text-debit">
          {error.message}
        </pre>

        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/")}>
            Back to wallet
          </Button>
        </div>
      </div>
    );
  }
}
