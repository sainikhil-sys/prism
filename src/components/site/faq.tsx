"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const FAQ_ITEMS = [
  {
    q: "What data do I need?",
    a: "A product list with unit cost and current price, and historical sales with a date, quantity and unit price per row. Daily forecasts need at least 70 days of history and weekly forecasts at least 30 weeks. Promotion flags, stock levels, supplier lead times and competitor prices are optional and improve what Prism can tell you.",
  },
  {
    q: "Will Prism change prices in my store automatically?",
    a: "No. Prism has no connection to your store or point-of-sale system. Approving a recommendation updates the price recorded in Prism and logs the decision; you apply the price in your own systems.",
  },
  {
    q: "Why did Prism decline to recommend a price?",
    a: "Prism needs evidence of how demand responds to price. If the sales history shows fewer than three distinct prices or almost no price variation, the model cannot estimate that response, so Prism says so instead of guessing. It also declines when your rules contradict each other, for example a minimum margin that requires a bigger price change than the maximum allowed.",
  },
  {
    q: "Does a higher estimated margin mean I will earn more?",
    a: "Not necessarily. Estimates come from a model of historical correlations and assume the price is held for the decision period with no promotion and unchanged competitor prices. Treat them as a starting point and confirm material changes with a controlled test.",
  },
  {
    q: "How accurate are the forecasts?",
    a: "That depends on your data, so Prism does not quote a general accuracy figure. Every forecast shows its own backtest errors on your most recent periods next to a simple baseline, and warns when the model does not beat it.",
  },
  {
    q: "Where do competitor prices come from?",
    a: "From you. You can enter observations by hand or import them by CSV, each with the date and source. Prism does not scrape websites or buy competitor data.",
  },
  {
    q: "Who on my team can do what?",
    a: "Viewers can see everything in their organization. Analysts can also import data, edit products and generate forecasts and recommendations. Admins can also change the pricing policy, manage members and approve or reject recommendations. Owners can also delete the organization.",
  },
  {
    q: "How much does Prism cost?",
    a: "Paid plans have not been published. Contact us if you have questions about pricing.",
  },
];

export function Faq() {
  return (
    <Accordion type="single" collapsible className="w-full border-t">
      {FAQ_ITEMS.map((item, i) => (
        <AccordionItem key={item.q} value={`q${i}`}>
          <AccordionTrigger className="py-4 text-left text-base font-medium">{item.q}</AccordionTrigger>
          <AccordionContent className="pb-4 text-[0.9375rem] leading-relaxed text-foreground/80">{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
