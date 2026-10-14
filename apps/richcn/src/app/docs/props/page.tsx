import Link from "next/link";

import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { DocProps } from "@/components/docs/doc-props";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("props");

const BLOCK_PROPS = [
  {
    name: "documentId",
    type: "string",
    default: "required",
    description: "The document identity. The persisted editor is keyed by it.",
  },
  {
    name: "initialValue",
    type: "EditorValue",
    default: "EMPTY_EDITOR_VALUE",
    description: "The content of a new document. The default is one empty paragraph.",
  },
  {
    name: "onChange",
    type: "(value: EditorValue) => void",
    default: "none",
    description: "Called with the value after each change.",
  },
  {
    name: "readOnly",
    type: "boolean",
    default: "false",
    description: "Turns editing off.",
  },
  {
    name: "placeholder",
    type: "string",
    default: "DEFAULT_PLACEHOLDER",
    description:
      'Shown in an empty block. The default is "Type something, or type "/" for commands".',
  },
  {
    name: "ariaLabel",
    type: "string",
    default: '"Rich text editor"',
    description: "The accessible name of the editable.",
  },
  {
    name: "className",
    type: "string",
    default: "none",
    description: "Added to the wrapper element.",
  },
  {
    name: "adapter",
    type: "EditorPersistenceAdapter",
    default: "none",
    description: "Selects persisted mode when present. Without it, the editor runs in memory mode.",
  },
  {
    name: "linkPreview",
    type: "LinkPreviewAdapter | null",
    default: "null",
    description: "Fills bookmark previews.",
  },
  {
    name: "mentionProvider",
    type: "MentionProvider | null",
    default: "null",
    description: "Searches and resolves people for mentions.",
  },
  {
    name: "pageProvider",
    type: "PageProvider | null",
    default: "null",
    description: "Searches and resolves pages for page links.",
  },
  {
    name: "onOpenPage",
    type: "(request: PageOpenRequest) => void",
    default: "none",
    description: "Called when a user opens a page link.",
  },
  {
    name: "fileUpload",
    type: "FileUploadAdapter | null",
    default: "null",
    description:
      "Uploads files and resolves their stored URLs. The image, video, audio and file blocks use it to show a stored URL that is not http, https or root-relative.",
  },
  {
    name: "options",
    type: "EditorOptions",
    default: "DEFAULT_EDITOR_OPTIONS",
    description: "Tuning values for the handle, autosave, shortcut hints and the tail click.",
  },
  {
    name: "features",
    type: "EditorFeatures",
    default: "DEFAULT_EDITOR_FEATURES",
    description: "Turns feature groups off. Every group is on by default.",
  },
];

const STATIC_PROPS = [
  {
    name: "value",
    type: "EditorValue",
    default: "required",
    description: "The document content to render.",
  },
  {
    name: "className",
    type: "string",
    default: "none",
    description: "Added to the rendered element.",
  },
];

const EXPORTS = [
  "NotionLikeEditorBlock, NotionLikeEditorBlockProps",
  "NotionLikeEditorStatic, NotionLikeEditorStaticProps",
  "EditorValue, EMPTY_EDITOR_VALUE",
  "EditorOptions, ResolvedEditorOptions, DEFAULT_EDITOR_OPTIONS",
  "EditorFeatures, EditorFeature, EDITOR_FEATURES, DEFAULT_EDITOR_FEATURES",
  "DEFAULT_PLACEHOLDER",
  "createLocalStorageAdapter, EditorPersistenceAdapter",
  "LinkPreviewAdapter",
  "FileUploadAdapter, FileUploadOptions, UploadedFile",
  "MentionProvider, MentionEntity",
  "PageProvider, PageEntity, PageResolution, PageOpenRequest",
];

export default function PropsPage() {
  return (
    <DocPage slug="props">
      <section className="space-y-3">
        <p>
          The public entry point has no{" "}
          <code className="font-mono text-sm">&quot;use client&quot;</code> directive, so a server
          component can import from it. What needs the directive is the file that passes a function
          prop.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="block">NotionLikeEditorBlock</DocHeading>
        <p>
          The editor. With an <code className="font-mono text-sm">adapter</code> it loads and saves
          a stored document; without one it keeps the document in component state.
        </p>
        <DocProps props={BLOCK_PROPS} label="NotionLikeEditorBlock props" />
      </section>

      <section className="space-y-3">
        <DocHeading id="static">NotionLikeEditorStatic</DocHeading>
        <p>
          The read-only renderer. It has no hooks, takes no adapters and calls nothing. It renders
          whatever the value contains, including content a feature switch has turned off.
        </p>
        <DocProps props={STATIC_PROPS} label="NotionLikeEditorStatic props" />
      </section>

      <section className="space-y-3">
        <DocHeading id="exports">Exports</DocHeading>
        <p>Everything the entry point re-exports. Anything not on this list is internal.</p>
        <ul className="list-disc space-y-1.5 pl-5 font-mono text-sm">
          {EXPORTS.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
        <DocNote>
          In the installed copy, the entry point is{" "}
          <code className="font-mono text-sm">@/components/blocks/notion-like-editor</code>. The
          editor&apos;s own files can be imported directly from that folder if you need something
          the barrel does not export, such as <code className="font-mono text-sm">SaveRequest</code>
          ; nothing outside the folder is public.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("options")}>
              Options
            </Link>{" "}
            for the fields inside the <code className="font-mono text-sm">options</code> prop
          </li>
          <li>
            <Link className="link-underline" href={docHref("features")}>
              Feature switches
            </Link>{" "}
            for the groups inside the <code className="font-mono text-sm">features</code> prop
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
