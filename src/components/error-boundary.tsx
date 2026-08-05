import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  children: ReactNode;
  /** Short label used in reporting context, e.g. "dashboard". */
  boundary: string;
  title?: string;
  description?: string;
};

type State = { error: Error | null; componentStack?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error);
    this.setState({ componentStack: info.componentStack ?? undefined });
    reportLovableError(error, {
      boundary: this.props.boundary,
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null, componentStack: undefined });

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-4 lg:p-8">
        <Card className="mx-auto max-w-2xl border-destructive/40 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              {this.props.title ?? "This section didn't load"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              {this.props.description ??
                "Something went wrong while rendering this page. Your data is safe — nothing was executed."}
            </p>
            <details className="rounded-md border border-border/60 bg-background/50 p-3">
              <summary className="cursor-pointer text-xs font-medium text-foreground">
                Error details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ""}
                {componentStack ? `\n\nComponent stack:${componentStack}` : ""}
              </pre>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.reset} size="sm">
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Try again
              </Button>
              <Button size="sm" variant="outline" onClick={() => location.reload()}>
                Reload page
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href="/">Go home</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
