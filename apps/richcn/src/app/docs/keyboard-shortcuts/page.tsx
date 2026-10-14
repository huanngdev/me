import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";

import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("keyboard-shortcuts");

/** Keys use the editor's own notation: Mod is Cmd on macOS and Ctrl elsewhere. */
const SHORTCUTS = [
  { action: "Paragraph", keys: "Mod+Alt+0" },
  { action: "Paragraph (second binding)", keys: "Mod+Shift+0" },
  { action: "Heading 1", keys: "Mod+Alt+1" },
  { action: "Heading 2", keys: "Mod+Alt+2" },
  { action: "Heading 3", keys: "Mod+Alt+3" },
  { action: "Code block: exit", keys: "Mod+Enter" },
  { action: "Footnote definition: jump to its first reference", keys: "Mod+Enter" },
  { action: "To-do: check it", keys: "Mod+Enter" },
  { action: "Link: open the link popover", keys: "Mod+K" },
  { action: "Inline equation: insert or wrap", keys: "Mod+Shift+E" },
  { action: "Inline date: insert today", keys: "Mod+;" },
  { action: "Bold", keys: "Mod+B" },
  { action: "Italic", keys: "Mod+I" },
  { action: "Underline", keys: "Mod+U" },
  { action: "Strikethrough", keys: "Mod+Shift+X" },
  { action: "Inline code", keys: "Mod+E" },
  { action: "Superscript", keys: "Mod+." },
  { action: "Subscript", keys: "Mod+," },
  { action: "Indent", keys: "Mod+]" },
  { action: "Outdent", keys: "Mod+[" },
  { action: "Indent in a list", keys: "Tab" },
  { action: "Bulleted list", keys: "Mod+Shift+8" },
  { action: "Numbered list", keys: "Mod+Shift+7" },
  { action: "To-do list", keys: "Mod+Shift+9" },
  { action: "Find and replace: open", keys: "Mod+F" },
  { action: "Block menu: open", keys: "Mod+/" },
  { action: "Block selection: select the block text, then all blocks", keys: "Mod+A" },
  { action: "Block selection: duplicate", keys: "Mod+D" },
  { action: "Block selection: move up", keys: "Mod+Shift+Alt+ArrowUp" },
  { action: "Block selection: move down", keys: "Mod+Shift+Alt+ArrowDown" },
  { action: "Undo", keys: "Mod+Z" },
  { action: "Redo", keys: "Mod+Shift+Z" },
  { action: "Clear formatting", keys: "Mod+\\" },
] as const;

const MAC_GLYPH: Record<string, string> = { Mod: "⌘", Alt: "⌥", Shift: "⇧" };
const OTHER_NAME: Record<string, string> = { Mod: "Ctrl", Alt: "Alt", Shift: "Shift" };

function keysFor(keys: string, labels: Record<string, string>): string {
  return keys
    .split("+")
    .map((key) => labels[key] ?? key)
    .join("+");
}

export default function KeyboardShortcutsPage() {
  return (
    <DocPage slug="keyboard-shortcuts">
      <section className="space-y-3">
        <p>
          <code className="font-mono text-sm">Mod</code> is{" "}
          <code className="font-mono text-sm">Cmd</code> on macOS and{" "}
          <code className="font-mono text-sm">Ctrl</code> elsewhere. The editor reads every shortcut
          from one registry, so the hints in its menus and the handlers in the editor cannot drift
          apart.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="list">Shortcuts</DocHeading>
        <div className="border-border overflow-hidden rounded-lg border">
          <Table aria-label="Keyboard shortcuts">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[55%]">Action</TableHead>
                <TableHead>macOS</TableHead>
                <TableHead>Windows and Linux</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SHORTCUTS.map((shortcut) => (
                <TableRow key={`${shortcut.action}-${shortcut.keys}`}>
                  <TableCell className="text-sm whitespace-normal">{shortcut.action}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-normal">
                    {keysFor(shortcut.keys, MAC_GLYPH)}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-normal">
                    {keysFor(shortcut.keys, OTHER_NAME)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <DocHeading id="where-hints-show">Where the hints are shown</DocHeading>
        <p>
          The slash menu, the Turn into menus, the block menu, the selection toolbar, the find bar
          and the block handle show the keys of their commands. macOS and iOS show glyphs (
          <code className="font-mono text-sm">⌘ ⌥ ⇧</code>), and other platforms show names (
          <code className="font-mono text-sm">Ctrl</code>,{" "}
          <code className="font-mono text-sm">Alt</code>,{" "}
          <code className="font-mono text-sm">Shift</code>). A touch-only device shows no hints at
          all.
        </p>
        <DocNote>
          The <code className="font-mono text-sm">shortcutHints</code> option turns the hints off
          for the whole editor, together with the{" "}
          <code className="font-mono text-sm">aria-keyshortcuts</code> attributes. The shortcuts
          themselves keep working. See{" "}
          <Link className="link-underline" href={docHref("options")}>
            Options
          </Link>
          .
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="browser-keys">Keys the editor takes over</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">Mod+F</code> opens the editor&apos;s find bar when
            focus is in the editor, in place of the browser&apos;s find.
          </li>
          <li>
            <code className="font-mono text-sm">Tab</code> indents a list item instead of moving
            focus. Outside a list it moves focus as usual.
          </li>
          <li>
            A markdown shortcut typed through an input method composition does not convert, for
            example <code className="font-mono text-sm">-</code> then space on a Vietnamese IME.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="input-rules">Input rules</DocHeading>
        <p>
          Some formatting has no shortcut and is typed instead. These convert as you type, and every
          one of them is a block or mark that a feature switch can turn off.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">#</code>,{" "}
            <code className="font-mono text-sm">##</code>,{" "}
            <code className="font-mono text-sm">###</code> then space: heading 1, 2 and 3.
          </li>
          <li>
            <code className="font-mono text-sm">&gt;</code> then space: quote.{" "}
            <code className="font-mono text-sm">---</code>: divider.
          </li>
          <li>
            <code className="font-mono text-sm">-</code>,{" "}
            <code className="font-mono text-sm">1.</code> or{" "}
            <code className="font-mono text-sm">[]</code> then space: bulleted, numbered or to-do
            list. A number above 1 restarts the numbering.
          </li>
          <li>
            <code className="font-mono text-sm">```</code> then space: code block.
          </li>
          <li>
            Around text: <code className="font-mono text-sm">**</code> bold,{" "}
            <code className="font-mono text-sm">*</code> or{" "}
            <code className="font-mono text-sm">_</code> italic,{" "}
            <code className="font-mono text-sm">~~</code> strikethrough, a backtick inline code.
          </li>
          <li>
            A URL then space or Enter becomes a link. <code className="font-mono text-sm">:</code>{" "}
            then a name opens emoji suggestions.
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
