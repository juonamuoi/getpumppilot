import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HelpFlow } from "@/lib/help-flows";

/**
 * Visible, numbered instructions for a help flow.
 *
 * Renders the exact same steps that the route emits as HowTo JSON-LD, which
 * is what keeps the page eligible for step-by-step rich results.
 */
export function HowToSteps({ flow }: { flow: HelpFlow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{flow.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{flow.description}</p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {flow.steps.map((step, i) => (
            <li
              key={step.name}
              id={step.anchor}
              className="flex scroll-mt-24 gap-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{step.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
