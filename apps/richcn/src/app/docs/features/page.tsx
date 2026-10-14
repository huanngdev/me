import Link from "next/link";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { DocProps } from "@/components/docs/doc-props";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("features");

const FEATURE_ROWS = [
  {
    name: "media",
    hidden:
      "Image, video, audio and file blocks in the slash menu and the Add menu. Uploads: file paste and drop, and the upload tab of the media source popover.",
  },
  {
    name: "embeds",
    hidden:
      "Embed and bookmark blocks in the slash menu and the Add menu. The URL paste menu offers neither option.",
  },
  {
    name: "tables",
    hidden:
      "The table block in the slash menu, the Add menu and Turn into. A pasted HTML table becomes paragraphs.",
  },
  {
    name: "columns",
    hidden:
      "The columns block in the slash menu and the Add menu. Pasted columns become paragraphs.",
  },
  {
    name: "code",
    hidden:
      "The code block in the slash menu, the Add menu and Turn into, and the ``` input rule. Pasted code blocks become paragraphs.",
  },
  {
    name: "equations",
    hidden:
      "The block and inline equation in the slash menu and the Add menu, the Equation button in the selection toolbar, and Mod+Shift+E.",
  },
  {
    name: "mentions",
    hidden: "The @ trigger and the slash Mention item. Pasted mentions become their names as text.",
  },
  {
    name: "pageLinks",
    hidden: 'The page link block, its picker and the slash "Page link" item.',
  },
  { name: "footnotes", hidden: 'The slash "Footnote" item. Pasted footnotes become text.' },
  { name: "dates", hidden: "The inline date insert, Mod+;. Pasted dates become their text." },
  {
    name: "emoji",
    hidden: "The : suggestions, and the closing :name: conversion.",
  },
  {
    name: "toc",
    hidden: "The table of contents block in the slash menu and the Add menu.",
  },
  { name: "find", hidden: "The find bar and Mod+F. The browser's own find opens instead." },
  { name: "slashMenu", hidden: 'The slash menu. Typing "/" inserts the character only.' },
  {
    name: "selectionToolbar",
    hidden:
      "The floating toolbar over a text selection. The keyboard shortcuts for marks still work.",
  },
  {
    name: "blockHandle",
    hidden:
      "The block handle, its Add button and grip, the block menu (Mod+/), and drag. Block selection and its keys still work.",
  },
];

const FEATURE_PROPS = FEATURE_ROWS.map((row) => ({
  name: row.name,
  type: "boolean",
  default: "true",
  description: row.hidden,
}));

export default function FeaturesPage() {
  return (
    <DocPage slug="features">
      <section className="space-y-3">
        <DocHeading id="what-it-does">What the prop does</DocHeading>
        <p>
          <code className="font-mono text-sm">features</code> turns groups of editor features off.
          Every group is on by default, so an editor with no{" "}
          <code className="font-mono text-sm">features</code> prop behaves as it always has. Only a{" "}
          <code className="font-mono text-sm">false</code> turns a group off: any other value, and
          any unknown key, is ignored.
        </p>
        <DocNote>
          &quot;Off&quot; means the feature cannot be <em>created</em>, not that the content
          disappears. Each entry point for the group is removed and its shortcut, trigger or paste
          does nothing. Existing content of that type still renders, and can still be edited and
          deleted. The document schema does not change and nothing is removed from a document.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="groups">The groups</DocHeading>
        <DocProps props={FEATURE_PROPS} label="Editor features and what is hidden when off" />
      </section>

      <section className="space-y-3">
        <DocHeading id="paste">What happens to pasted content</DocHeading>
        <p>
          A pasted node of an off type is read as its text, and a pasted media block is dropped the
          same way an unsupported image is. The paste menu, a file drop and the upload tab of the
          media source popover follow the same rules, so a user cannot get around the switch.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="comment-only">A comment-only editor</DocHeading>
        <p>
          Turn off everything that is not text. What is left is paragraphs, headings, lists, quotes,
          marks and the link popover: enough for a comment that should never grow a table.
        </p>
        <DocCode sample="features-comment-only.tsx" />
      </section>

      <section className="space-y-3">
        <DocHeading id="no-media">An editor with no media</DocHeading>
        <p>
          Two flags are often enough. Media and embeds are the groups that need a host, so removing
          them removes the upload and preview adapters from the picture as well.
        </p>
        <DocCode sample="features-no-media.tsx" />
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("options")}>
              Options
            </Link>{" "}
            for the finer tuning that is not a feature group
          </li>
          <li>
            <Link className="link-underline" href={docHref("props")}>
              Props
            </Link>{" "}
            for the full list
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
