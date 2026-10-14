import Link from "next/link";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";
import { EDITOR_CSS_VARS } from "@/lib/registry";

export const metadata = docMetadata("theming");

const VARIABLE_GROUPS = [
  {
    title: "Text tones",
    prefix: "--editor-text-",
    note: "Nine palette tokens for the Text color mark.",
  },
  {
    title: "Background tones",
    prefix: "--editor-bg-",
    note: "Nine palette tokens for the Highlight mark and the block background.",
  },
  {
    title: "Callout tones",
    prefix: "--editor-callout-",
    note: "A background and a border for each of the five callout tones.",
  },
  {
    title: "Code colours",
    prefix: "--editor-code-",
    note: "The highlight.js palette used by code blocks.",
  },
  {
    title: "Fonts",
    prefix: "--editor-font-",
    note: "The sans, serif and mono stacks the editor renders in.",
  },
] as const;

export default function ThemingPage() {
  const variables = EDITOR_CSS_VARS.light;

  return (
    <DocPage slug="theming">
      <section className="space-y-3">
        <DocHeading id="width">Width</DocHeading>
        <p>
          <code className="font-mono text-sm">--editor-max-width</code> sets the width of the
          editing column. The default is <code className="font-mono text-sm">700px</code>, and the
          column reads it as{" "}
          <code className="font-mono text-sm">var(--editor-max-width,700px)</code>. It applies to
          the editable in memory mode, to the column in persisted mode, and to the loading skeleton
          and the recovery notice.
        </p>
        <p>
          Set it on an ancestor of the editor. To make it fill the space instead, use a percentage.
        </p>
        <DocCode sample="editor-theming.tsx" />
        <DocNote>
          The static renderer has no width of its own. Give the element around it the same width, as
          the{" "}
          <Link className="link-underline" href={docHref("usage")}>
            usage page
          </Link>{" "}
          shows, or the read-only output will be wider than the editor was.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="variables">The colour variables</DocHeading>
        <p>
          The registry writes these into the stylesheet{" "}
          <code className="font-mono text-sm">components.json</code> points at, once for light and
          once for dark. They are inherited CSS custom properties, so a value set on an ancestor
          overrides the stylesheet for everything below it.
        </p>
        <dl className="space-y-3">
          {VARIABLE_GROUPS.map((group) => (
            <div key={group.title}>
              <dt className="font-medium">
                {group.title}{" "}
                <span className="text-muted-foreground text-sm">
                  ({variables.filter((name) => name.startsWith(group.prefix)).length})
                </span>
              </dt>
              <dd className="text-foreground/80">
                <p>{group.note}</p>
                <p className="mt-1 font-mono text-xs break-words">
                  {variables.filter((name) => name.startsWith(group.prefix)).join(", ")}
                </p>
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Each name is also mapped to a Tailwind colour in the{" "}
          <code className="font-mono text-sm">@theme</code> block, so{" "}
          <code className="font-mono text-sm">text-editor-text-blue</code> and{" "}
          <code className="font-mono text-sm">bg-editor-callout-info-bg</code> work out of the box.
          The tone variables are the ones exposed that way; the code palette and the font stacks are
          read by the editor&apos;s own classes.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="override">How to override</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            In the stylesheet, edit the values in the light and dark blocks the registry wrote. This
            changes every editor on the site.
          </li>
          <li>
            On an element, set the variables with a <code className="font-mono text-sm">style</code>{" "}
            prop, as the example above does. This changes one editor and everything inside it.
          </li>
          <li>
            For a per-document theme, put the variable values in a wrapper around the editor and
            switch them from your own state.
          </li>
        </ul>
        <DocNote>
          Keys are custom properties, so TypeScript needs a cast in a{" "}
          <code className="font-mono text-sm">style</code> object:{" "}
          <code className="font-mono text-sm">{"as CSSProperties"}</code>. The example shows it.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="dark-mode">Dark mode</DocHeading>
        <p>
          Every variable in the list above has a second value in the{" "}
          <code className="font-mono text-sm">dark</code> block, so nothing in the editor hard-codes
          a light colour. The switch is the same one your app already uses: the registry writes the
          dark values inside <code className="font-mono text-sm">.dark</code>, and the editor&apos;s
          styles use the <code className="font-mono text-sm">dark:</code> variant against that
          class.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Keep the dark values where they are. The editor&apos;s code blocks, callouts and media
            surfaces all assume a value exists in both blocks.
          </li>
          <li>
            If you build your own palette, override both blocks. A light value with no dark
            counterpart is the one mistake this system cannot hide.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="other">Anything else</DocHeading>
        <p>
          The editor has no other theming surface. Mark sizes, list markers, spacing and the block
          handle are set in the installed source, and the components sit behind your own{" "}
          <code className="font-mono text-sm">components/ui</code> primitives, so a change to
          Tailwind tokens reaches them without touching the block.
        </p>
      </section>
    </DocPage>
  );
}
