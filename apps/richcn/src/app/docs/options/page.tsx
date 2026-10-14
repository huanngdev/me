import Link from "next/link";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { DocProps } from "@/components/docs/doc-props";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("options");

const OPTION_PROPS = [
  {
    name: "handle.gap",
    type: "number",
    default: "12",
    description: "Pixels between the block handle and the left edge of its block.",
  },
  {
    name: "handle.centerMax",
    type: "number",
    default: "48",
    description:
      "Tallest block, in pixels, that the handle is centred on when the block has no anchor. A taller block puts the handle on its first line.",
  },
  {
    name: "handle.anchorCenterMax",
    type: "number",
    default: "64",
    description:
      "Tallest marked anchor, such as a media frame, that the handle is centred on. A taller anchor keeps the handle at its top.",
  },
  {
    name: "autosave.debounceMs",
    type: "number",
    default: "800",
    description:
      "Milliseconds after the last change before a save starts. The save controller is created when a document opens or starts over, so a changed value applies from the next controller. The controller already running keeps its delay.",
  },
  {
    name: "shortcutHints",
    type: "boolean",
    default: "true",
    description:
      "false hides every shortcut hint and every aria-keyshortcuts attribute in the editor.",
  },
  {
    name: "appendOnTailClick",
    type: "boolean",
    default: "true",
    description:
      "false stops a click in the empty space below the last block from adding or focusing a paragraph. The browser handles the click.",
  },
];

export default function OptionsPage() {
  return (
    <DocPage slug="options">
      <section className="space-y-3">
        <DocHeading id="how-they-resolve">How they resolve</DocHeading>
        <p>
          <code className="font-mono text-sm">options</code> is optional, and every field inside it
          is optional. A field that is missing, or holds a value of the wrong type, takes its
          default. A number is used only when it is finite and not negative, and a flag only when it
          is a boolean. An unknown key is ignored.
        </p>
        <DocNote>
          A change to <code className="font-mono text-sm">handle</code>,{" "}
          <code className="font-mono text-sm">shortcutHints</code> or{" "}
          <code className="font-mono text-sm">appendOnTailClick</code> takes effect at once, with no
          remount: the editor instance is kept and the handle is measured again. Passing a new
          object with the same values does nothing, because the values are compared, not the object.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="fields">Every field</DocHeading>
        <DocProps props={OPTION_PROPS} label="Editor options" />
      </section>

      <section className="space-y-3">
        <DocHeading id="example">Example</DocHeading>
        <p>
          Every field together. In a real editor you would set one or two: a wider handle gap for a
          dense sidebar layout, or a longer debounce for a slow API.
        </p>
        <DocCode sample="editor-options.tsx" />
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("theming")}>
              Theming
            </Link>{" "}
            for width and colour, which are CSS variables rather than options
          </li>
          <li>
            <Link className="link-underline" href={docHref("persistence")}>
              Persistence
            </Link>{" "}
            for what the autosave debounce is waiting for
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
