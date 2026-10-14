import Link from "next/link";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";
import { INSTALL_COMMAND, TESTED_WITH } from "@/lib/registry";

export const metadata = docMetadata("");

const BLOCK_GROUPS = [
  {
    name: "Blocks",
    items:
      "Paragraph, headings, quote, divider, bookmark, image, file, video, audio, embed, page link, table of contents, equation, callout, toggle, code, table, columns, footnote definitions.",
  },
  {
    name: "Inline",
    items: "Link, mention, inline equation, inline date, footnote reference.",
  },
  {
    name: "Text styles",
    items:
      "Bold, italic, underline, strikethrough, inline code, superscript, subscript, keyboard, text color, highlight, font size, font family.",
  },
  {
    name: "Block attributes",
    items: "Text align, line height, indent, lists, restart numbering, to-do state, tones.",
  },
  {
    name: "Editing",
    items:
      "Slash menu, block menu, block handle, drag and drop, block selection, find and replace, undo and redo, paste, emoji suggestions, autosave, read-only mode.",
  },
];

const NEXT_PAGES = [
  {
    slug: "installation",
    text: "install the editor into a Next.js or Vite project",
  },
  {
    slug: "usage",
    text: "mount it, read changes, and render a saved document on the server",
  },
  {
    slug: "persistence",
    text: "save documents to your own API",
  },
  {
    slug: "features",
    text: "turn whole feature groups off",
  },
] as const;

export default function IntroductionPage() {
  return (
    <DocPage slug="">
      <section className="space-y-3">
        <p>
          A block editor for React, built on Plate (
          <code className="font-mono text-sm">platejs</code> 53) with shadcn primitives. A document
          is JSON, checked against an allow list of block types, attributes and marks before it is
          opened or saved. The editor installs as a shadcn block, so the source lands in your own
          project and you can read or change every line of it.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="what-it-is-not">What it is not</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>No AI writing, no suggestions.</li>
          <li>
            No live collaboration and no presence. A save that loses a race reports a conflict and
            offers the user a reload.
          </li>
          <li>
            No import or export. The document is JSON in your storage; a Markdown export is yours to
            write.
          </li>
          <li>
            No upload backend and no file hosting. The editor stores whatever URL a{" "}
            <Link className="link-underline" href={docHref("file-uploads")}>
              FileUploadAdapter
            </Link>{" "}
            hands back.
          </li>
          <li>
            No server-side editor. Only the read-only renderer runs on the server; it has no hooks
            and no editing surface.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="what-you-get">What you get</DocHeading>
        <dl className="space-y-3">
          {BLOCK_GROUPS.map((group) => (
            <div key={group.name}>
              <dt className="font-medium">{group.name}</dt>
              <dd className="text-foreground/80">{group.items}</dd>
            </div>
          ))}
        </dl>
        <p>
          Every block type has a static rendering, so saved content reads the same on the server as
          it does in the editor. The details are in the{" "}
          <Link className="link-underline" href={docHref("props")}>
            props
          </Link>{" "}
          and{" "}
          <Link className="link-underline" href={docHref("keyboard-shortcuts")}>
            keyboard shortcut
          </Link>{" "}
          references.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="requirements">Requirements</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>React 19 and React DOM 19.</li>
          <li>A Next.js or Vite project. Nothing in the editor needs a framework beyond React.</li>
          <li>Tailwind CSS v4, because the blocks use v4 utilities and CSS variables.</li>
          <li>
            shadcn with Radix primitives. Base UI projects do not compile without changes, because
            the editor renders the Radix component APIs.
          </li>
        </ul>
        <DocNote>
          The registry is tested with {TESTED_WITH} on Next.js and Vite, on Tailwind v4.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="quick-start">Quick start</DocHeading>
        <ol className="list-decimal space-y-4 pl-5">
          <li className="space-y-2">
            <p>Install the block and everything it depends on.</p>
            <CliCommand execute={INSTALL_COMMAND} />
          </li>
          <li className="space-y-2">
            <p>Put the editor in a client component. Import it from the path shadcn wrote it to.</p>
            <DocCode sample="editor-minimal.tsx" />
          </li>
          <li className="space-y-2">
            <p>
              Render that component from a page. The document lives in memory until you pass an{" "}
              <code className="font-mono text-sm">adapter</code>.
            </p>
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Where to go next</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          {NEXT_PAGES.map((page) => (
            <li key={page.slug}>
              <Link className="link-underline" href={docHref(page.slug)}>
                {page.text}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </DocPage>
  );
}
