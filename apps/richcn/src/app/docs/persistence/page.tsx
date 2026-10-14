import Link from "next/link";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { DocProps } from "@/components/docs/doc-props";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("persistence");

const ADAPTER_METHODS = [
  {
    name: "load",
    text: "Called once when a document opens. Return the stored value, or null for a new document. The editor parses the value and opens it, so return whatever your API stored.",
  },
  {
    name: "save",
    text: "Called after each debounce window. It receives the document id, the schema version, the revision the editor edited from, and the content. Return saved, conflict or error.",
  },
  {
    name: "saveRecovery",
    text: "Called with a snapshot when a document could not be saved or opened. Keep it; it is the user's only copy at that point.",
  },
  {
    name: "subscribe",
    text: "Optional. The editor passes a callback that receives revisions written elsewhere, such as in another tab.",
  },
] as const;

const LOCAL_STORAGE_OPTIONS = [
  {
    name: "storage",
    type: "Storage",
    default: "window.localStorage",
    description: "The Storage to read and write. Pass a fake in a test.",
  },
  {
    name: "keyPrefix",
    type: "string",
    default: '"notion-like-editor"',
    description:
      "Prefix for every key. Documents use <keyPrefix>:<documentId>, and recovery snapshots add :recovery:<reason>.",
  },
  {
    name: "target",
    type: 'Pick<Window, "addEventListener" | "removeEventListener">',
    default: "window",
    description: "Where the storage event listener is attached for cross-tab revisions.",
  },
];

export default function PersistencePage() {
  return (
    <DocPage slug="persistence">
      <section className="space-y-3">
        <DocHeading id="how-it-works">How saving works</DocHeading>
        <p>
          Passing <code className="font-mono text-sm">adapter</code> switches the editor from memory
          mode to persisted mode. The editor loads the document when it opens, saves it after the
          autosave debounce, and writes a recovery snapshot when something fails.
        </p>
        <dl className="space-y-3">
          {ADAPTER_METHODS.map((method) => (
            <div key={method.name}>
              <dt className="font-mono text-sm font-medium">{method.name}</dt>
              <dd className="text-foreground/80">{method.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <DocHeading id="interface">The interface</DocHeading>
        <p>
          This is the file the registry installs. The shapes are copied from the source, so a change
          in the editor changes this page.
        </p>
        <DocCode editorFile="lib/document/editor-persistence.ts" language="ts" />
        <DocNote>
          The barrel exports <code className="font-mono text-sm">EditorPersistenceAdapter</code>{" "}
          only. <code className="font-mono text-sm">SaveRequest</code>,{" "}
          <code className="font-mono text-sm">SaveResult</code> and{" "}
          <code className="font-mono text-sm">RecoverySnapshot</code> live in that installed file,
          and you can import them from it if you need to name them.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="own-api">An adapter for your own API</DocHeading>
        <p>
          Annotate the object with{" "}
          <code className="font-mono text-sm">EditorPersistenceAdapter</code> and TypeScript gives
          every method the right parameter types. The revision is the whole concurrency story: send
          the revision you edited from and let the server reject a stale write.
        </p>
        <DocCode sample="persistence-api-adapter.ts" language="ts" />
        <p>
          A <code className="font-mono text-sm">conflict</code> result tells the editor that someone
          else saved first. It stops autosaving, writes a recovery snapshot, and shows the user a
          conflict notice with a reload button. An <code className="font-mono text-sm">error</code>{" "}
          result shows the message you return and keeps the content for a retry.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="local-storage">Local storage</DocHeading>
        <p>
          <code className="font-mono text-sm">createLocalStorageAdapter</code> stores documents in
          the browser, with the same adapter shape. Create it in the browser only: it reads{" "}
          <code className="font-mono text-sm">window</code> when it is created, so a server render
          cannot build one. The example reads it as a value the server does not have, and renders
          nothing until it exists.
        </p>
        <DocCode sample="editor-local-storage.tsx" />
        <DocProps props={LOCAL_STORAGE_OPTIONS} label="createLocalStorageAdapter options" />
        <DocNote>
          The empty state is honest here: local storage is one browser on one device. It is the
          right default for a demo or a scratchpad, and the wrong one for anything a user expects to
          find later.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="autosave">Autosave debounce</DocHeading>
        <p>
          The default is 800 ms after the last change. A save also starts after a maximum wait, so a
          long burst of typing still reaches storage. The save controller is created when a document
          opens or starts over, so a changed <code className="font-mono text-sm">debounceMs</code>{" "}
          applies from the next controller, and the controller that is already running keeps its
          delay.
        </p>
        <p>
          The option lives on the editor, not on the adapter:{" "}
          <code className="font-mono text-sm">
            {"options={{ autosave: { debounceMs: 1500 } }}"}
          </code>
          .
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("file-uploads")}>
              File uploads
            </Link>{" "}
            for the other adapter that touches storage
          </li>
          <li>
            <Link className="link-underline" href={docHref("document-format")}>
              Document format
            </Link>{" "}
            for what is stored and what the validator accepts
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
