import Link from "next/link";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("usage");

export default function UsagePage() {
  return (
    <DocPage slug="usage">
      <section className="space-y-3">
        <DocHeading id="minimal">Minimal usage</DocHeading>
        <p>
          Render the block in a client component and give it a{" "}
          <code className="font-mono text-sm">documentId</code>. Without an{" "}
          <code className="font-mono text-sm">adapter</code> the document lives in component state
          only: it is there while the editor is mounted and gone after a reload.
        </p>
        <DocCode sample="editor-minimal.tsx" />
      </section>

      <section className="space-y-3">
        <DocHeading id="document-id">documentId</DocHeading>
        <p>
          <code className="font-mono text-sm">documentId</code> is required and is the identity of
          the document. In persisted mode the editor is keyed by it: a new value unmounts the
          current editor and loads that document with{" "}
          <code className="font-mono text-sm">adapter.load</code>. Every document on a page needs
          its own id.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="initial-value-and-change">initialValue and onChange</DocHeading>
        <p>
          <code className="font-mono text-sm">initialValue</code> is the content of a new document.
          The default is <code className="font-mono text-sm">EMPTY_EDITOR_VALUE</code>, one empty
          paragraph. With an adapter, the stored document wins as soon as it loads, and{" "}
          <code className="font-mono text-sm">initialValue</code> is used only when the adapter
          answers <code className="font-mono text-sm">null</code>.
        </p>
        <p>
          <code className="font-mono text-sm">onChange</code> is called with the whole value after
          each change. It is a function prop, so the component that passes it must be a client
          component.
        </p>
        <DocCode sample="editor-on-change.tsx" />
      </section>

      <section className="space-y-3">
        <DocHeading id="read-only">readOnly</DocHeading>
        <p>
          <code className="font-mono text-sm">readOnly</code> turns editing off. The content is
          still rendered, the document rules still apply, and the block handle is not shown. Use it
          for a viewer that still needs the editor&apos;s own markup, for example a comment you may
          edit in place later.
        </p>
        <DocCode sample="editor-read-only.tsx" />
      </section>

      <section className="space-y-3">
        <DocHeading id="static">Render saved content on the server</DocHeading>
        <p>
          <code className="font-mono text-sm">NotionLikeEditorStatic</code> renders a stored value
          without Plate&apos;s editing surface. It has no hooks and no{" "}
          <code className="font-mono text-sm">&quot;use client&quot;</code> directive, so a server
          component can render it from a value read on the server. It takes a{" "}
          <code className="font-mono text-sm">value</code> and an optional{" "}
          <code className="font-mono text-sm">className</code>, and no adapters and no{" "}
          <code className="font-mono text-sm">onChange</code>.
        </p>
        <DocCode sample="editor-static.tsx" />
        <DocNote>
          The static renderer has no width of its own. Set one on the element around it, as the
          example does with{" "}
          <code className="font-mono text-sm">max-w-[var(--editor-max-width,700px)]</code>, or the
          output will take the full width of its parent.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="next-js">Next.js notes</DocHeading>
        <p>
          The public entry point has no{" "}
          <code className="font-mono text-sm">&quot;use client&quot;</code> directive, so a server
          component can import from it. What needs the directive is the file that passes a function
          prop: <code className="font-mono text-sm">onChange</code>,{" "}
          <code className="font-mono text-sm">onOpenPage</code>, an adapter, or a provider. Put the
          editor and those props in one client component and render that component from your page.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">NotionLikeEditorBlock</code> is a client component
            in its own file. It can be rendered from a page, but only with serializable props.
          </li>
          <li>
            <code className="font-mono text-sm">NotionLikeEditorStatic</code> is a server component
            in effect. Render it directly from a page.
          </li>
          <li>
            In persisted mode the document is loaded in the browser, so the first render shows the
            editor&apos;s own loading skeleton.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Next steps</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("persistence")}>
              Save the document to your own API
            </Link>
          </li>
          <li>
            <Link className="link-underline" href={docHref("file-uploads")}>
              Store pasted and dropped files
            </Link>
          </li>
          <li>
            <Link className="link-underline" href={docHref("props")}>
              The full prop list
            </Link>
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
