import Link from "next/link";

import { CodeBlock } from "@repo/core/components/code-block";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("document-format");

const ENVELOPE = `import type { Value } from "platejs";

export type EditorValue = Value;

export const EMPTY_EDITOR_VALUE = [
  {
    type: "p",
    children: [{ text: "" }],
  },
] satisfies EditorValue;`;

const SAMPLE_DOCUMENT = `{
  "schemaVersion": 1,
  "documentId": "notes",
  "revision": 3,
  "content": [
    { "type": "h1", "children": [{ "text": "Release notes" }] },
    { "type": "p", "children": [{ "text": "Shipped today." }] }
  ]
}`;

const OUTCOMES = [
  {
    name: "ok",
    text: "The document opens. Repairs are applied and returned with the result, such as a missing block id, a disallowed value, or a list number out of range. The editor shows no notice for repairs on load; paste shows its repairs in a notice.",
  },
  {
    name: "unsupported",
    text: "The document uses a block type, attribute, mark or value the allow list does not contain, or a structure the validator rejects. The editor shows a recovery notice with the first five issues and the raw JSON. The user can copy the JSON or start over, and starting over saves the original to recovery storage first.",
  },
  {
    name: "invalid",
    text: "The stored value is not a document, for example the envelope is missing fields or the JSON is too large. The same recovery notice is shown. Storage that cannot be read shows the same notice.",
  },
  {
    name: "future-version",
    text: "schemaVersion is higher than 1. The recovery notice says the document is from a newer editor.",
  },
];

export default function DocumentFormatPage() {
  return (
    <DocPage slug="document-format">
      <section className="space-y-3">
        <DocHeading id="value">The value</DocHeading>
        <p>
          A document&apos;s content is a Plate value: an array of block objects, each with a{" "}
          <code className="font-mono text-sm">type</code> and{" "}
          <code className="font-mono text-sm">children</code>.{" "}
          <code className="font-mono text-sm">EditorValue</code> is that type.
        </p>
        <CodeBlock code={ENVELOPE} language="ts" />
        <p>
          <code className="font-mono text-sm">EMPTY_EDITOR_VALUE</code> is what an editor with no{" "}
          <code className="font-mono text-sm">initialValue</code> starts from: one empty paragraph.
          Both names are re-exported from the entry point.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="envelope">The stored envelope</DocHeading>
        <p>
          What is saved is an envelope around the value.{" "}
          <code className="font-mono text-sm">serializeEditorDocument</code> writes exactly these
          four fields and nothing else.
        </p>
        <CodeBlock code={SAMPLE_DOCUMENT} language="json" />
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">schemaVersion</code> is the literal{" "}
            <code className="font-mono text-sm">1</code>.
          </li>
          <li>
            <code className="font-mono text-sm">documentId</code> is a non-empty string. It matches
            the id the editor was given.
          </li>
          <li>
            <code className="font-mono text-sm">revision</code> is a non-negative integer. It goes
            up by one on each save, and it is the value your adapter compares for conflicts.
          </li>
          <li>
            <code className="font-mono text-sm">content</code> is the array of blocks.
          </li>
        </ul>
        <DocCode editorFile="lib/document/editor-document.ts" language="ts" />
      </section>

      <section className="space-y-3">
        <DocHeading id="limits">Size limits</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">maxDepth</code>: 32 levels of nesting.
          </li>
          <li>
            <code className="font-mono text-sm">maxNodes</code>: 20,000 nodes.
          </li>
          <li>
            <code className="font-mono text-sm">maxBytes</code>: 2,000,000 bytes of JSON.
          </li>
        </ul>
        <p>
          These are the limits a document is opened against. A document over the byte limit is{" "}
          <code className="font-mono text-sm">invalid</code>: the user sees the recovery notice, not
          a half-loaded editor.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="migration">Migration on load</DocHeading>
        <p>
          Before a document opens, a bare array is wrapped in an envelope with revision 0 and the
          document id, so a value you stored before you had an envelope still opens. Any other value
          passes through unchanged and is validated as it is.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="validation">What the validator decides</DocHeading>
        <dl className="space-y-3">
          {OUTCOMES.map((outcome) => (
            <div key={outcome.name}>
              <dt className="font-mono text-sm font-medium">{outcome.name}</dt>
              <dd className="text-foreground/80">{outcome.text}</dd>
            </div>
          ))}
        </dl>
        <p>
          The allow lists are <code className="font-mono text-sm">EDITOR_ELEMENT_RULES</code> and{" "}
          <code className="font-mono text-sm">EDITOR_MARK_RULES</code> in the installed{" "}
          <code className="font-mono text-sm">lib/document/editor-document-schema.ts</code>. A value
          outside them is the difference between a repair and a rejection, so it is worth reading
          before you hand-write a document.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="ids">Block ids</DocHeading>
        <p>
          A generated block id is 10 characters. Block ids are normalized on load: a missing id gets
          a new one, a duplicate gets a new one, and ids already in the document are reserved first
          so a generated id cannot take one that a later block still owns. Ids are what{" "}
          <Link className="link-underline" href={docHref("mentions-and-page-links")}>
            page links
          </Link>{" "}
          and synced references point at, so they are stable once written.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="structure">Structure rules worth knowing</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            A code line, a table row or a table cell at the top level makes the document
            unsupported.
          </li>
          <li>A footnote definition is top level only; anywhere else it is read as a paragraph.</li>
          <li>
            A table cannot sit inside a table, and a column group cannot hold another column group.
          </li>
          <li>Callout and quote children are paragraphs only. Table cells hold paragraphs only.</li>
        </ul>
      </section>
    </DocPage>
  );
}
