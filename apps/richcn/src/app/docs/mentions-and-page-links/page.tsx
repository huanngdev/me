import Link from "next/link";

import { CodeBlock } from "@repo/core/components/code-block";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("mentions-and-page-links");

// Quoted from lib/features/editor-mention-node.ts. Every shape here is also built in
// docs-samples/mention-provider.ts, which stops compiling if the editor's types change.
const MENTION_TYPES = `export const MENTION_ENTITY_TYPE = "person";
export const MENTION_ENTITY_ID_MAX = 128;
export const MENTION_LABEL_MAX = 120;

export type MentionEntityType = typeof MENTION_ENTITY_TYPE;

export type MentionEntity = {
  entityType: MentionEntityType;
  entityId: string;
  label: string;
  email?: string;
};

export type MentionProvider = {
  search: (query: string, signal: AbortSignal) => Promise<MentionEntity[]>;
  resolve?: (
    entityType: string,
    entityId: string,
    signal: AbortSignal,
  ) => Promise<MentionEntity | null>;
};`;

// Quoted from lib/features/editor-page-link.ts, in the same order as the source.
const PAGE_TYPES = `export const PAGE_LINK_KINDS = ["link", "child"] as const;
export const PAGE_LINK_TITLE_MAX = 200;
export const PAGE_LINK_SEARCH_LIMIT = 8;

export type PageLinkKind = (typeof PAGE_LINK_KINDS)[number];

export type PageEntity = {
  pageId: string;
  title: string;
  icon?: string;
};

export type PageResolution =
  { status: "ok"; page: PageEntity } | { status: "missing" } | { status: "denied" };

export type PageProvider = {
  search: (query: string, signal: AbortSignal) => Promise<PageEntity[]>;
  resolve: (pageId: string, signal: AbortSignal) => Promise<PageResolution>;
};

export type PageOpenRequest = { pageId: string; kind: PageLinkKind };`;

export default function MentionsAndPageLinksPage() {
  return (
    <DocPage slug="mentions-and-page-links">
      <section className="space-y-3">
        <DocHeading id="mentions">Mentions</DocHeading>
        <p>
          A mention is an inline reference to a person. Typing{" "}
          <code className="font-mono text-sm">@</code> opens suggestions from your{" "}
          <code className="font-mono text-sm">mentionProvider</code>.
        </p>
        <CodeBlock code={MENTION_TYPES} language="ts" />
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Without a provider the <code className="font-mono text-sm">@</code> trigger does nothing
            and the Mention item is not offered in the slash menu. Pasted mentions become their
            names as text.
          </li>
          <li>
            Identity is <code className="font-mono text-sm">entityType</code> and{" "}
            <code className="font-mono text-sm">entityId</code>, never the label. A label can be
            renamed later and the mention still points at the same person.
          </li>
          <li>
            <code className="font-mono text-sm">resolve</code> is optional. Without it, a mention
            shows the label it stored.
          </li>
          <li>Labels are cut to 120 characters and stripped of control characters.</li>
          <li>
            Search results are untrusted. Entries with the wrong entity type or an invalid id are
            dropped before they reach the list.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="mention-example">A mention provider</DocHeading>
        <p>
          Map your own API rows to <code className="font-mono text-sm">MentionEntity</code> values.
          The <code className="font-mono text-sm">signal</code> is aborted when the query changes,
          so pass it to <code className="font-mono text-sm">fetch</code> and let a stale request
          die.
        </p>
        <DocCode sample="mention-provider.ts" language="ts" />
      </section>

      <section className="space-y-3">
        <DocHeading id="page-links">Page links</DocHeading>
        <p>
          A page link is a block that points at a page in your own product. It shows the page title
          and icon, and a click goes through <code className="font-mono text-sm">onOpenPage</code>.
        </p>
        <CodeBlock code={PAGE_TYPES} language="ts" />
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">kind</code> only picks the icon, which is a link
            glyph or a page glyph. It does not change the reference.
          </li>
          <li>
            Without a <code className="font-mono text-sm">PageProvider</code> the Page link item is
            not offered, and an existing page link shows its stored title without resolving it.
          </li>
          <li>
            Without <code className="font-mono text-sm">onOpenPage</code> a page link cannot be
            opened. A <code className="font-mono text-sm">missing</code> or{" "}
            <code className="font-mono text-sm">denied</code> resolution also prevents opening, so
            an unauthorized page stays unopenable even if the link is in the document.
          </li>
          <li>
            Search results go through a cleaner: entries without a valid page id are dropped, titles
            are cleaned and cut to 200 characters, the icon is kept only when it is one grapheme,
            and the list is capped at 8.
          </li>
          <li>
            A title that is empty after cleaning displays as{" "}
            <code className="font-mono text-sm">Untitled</code>.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="page-example">A page provider</DocHeading>
        <p>
          <code className="font-mono text-sm">onOpenPage</code> is a function prop, so the component
          that passes it must be a client component. The example routes to the page; you could open
          a panel or a preview instead.
        </p>
        <DocCode sample="page-provider.tsx" />
        <DocNote>
          A page id follows the mention rule for ids: 1 to 128 characters and no control characters.
          An invalid id is not repaired on load; the document is reported as unsupported, so
          validate what your API returns before it reaches the editor.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="static">In static output</DocHeading>
        <p>
          The read-only renderer keeps mentions as their labels and page links as their titles. A
          page link has no URL in static output, so it needs no server route and no provider to
          render.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("features")}>
              Feature switches
            </Link>{" "}
            to hide mentions or page links
          </li>
          <li>
            <Link className="link-underline" href={docHref("known-limits")}>
              Known limits
            </Link>{" "}
            for what happens when an id turns out to be invalid
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
