import Link from "next/link";

import { DocHeading } from "@/components/docs/doc-heading";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";
import { FAQ } from "@/lib/faq";
import { faqJsonLd } from "@/lib/json-ld";

export const metadata = docMetadata("faq");

export default function FaqPage() {
  return (
    <DocPage slug="faq" jsonLd={[faqJsonLd()]}>
      <section className="space-y-3">
        <p>
          The questions that come up first. Each answer stands alone, so a search result or an agent
          can read one without the rest of this page.
        </p>
      </section>

      <section className="space-y-6">
        <DocHeading id="questions">Questions</DocHeading>
        <dl className="space-y-6">
          {FAQ.map((entry) => (
            <div key={entry.question} className="space-y-1.5">
              <dt className="font-medium">{entry.question}</dt>
              <dd className="text-foreground/80">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("installation")}>
              Installation
            </Link>{" "}
            for the commands and the prompts
          </li>
          <li>
            <Link className="link-underline" href={docHref("known-limits")}>
              Known limits
            </Link>{" "}
            for what the editor does not do yet
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
