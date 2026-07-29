import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Faq } from "@/lib/page-faqs";

/**
 * Visible FAQ block that mirrors the FAQPage JSON-LD emitted by the route.
 * Keep the copy identical to the schema source in src/lib/page-faqs.ts.
 */
export function FaqSection({
  faqs,
  title = "Frequently asked questions",
  id = "faq",
}: {
  faqs: Faq[];
  title?: string;
  id?: string;
}) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
