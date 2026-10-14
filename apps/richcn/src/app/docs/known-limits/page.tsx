import Link from "next/link";

import { DocHeading } from "@/components/docs/doc-heading";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("known-limits");

export default function KnownLimitsPage() {
  return (
    <DocPage slug="known-limits">
      <section className="space-y-3">
        <p>
          Everything on this page is a limit of the editor as it ships. None of it is a bug report;
          it is what to expect before you build on top of it.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="editing" level={2}>
          Editing
        </DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>No undo depth limit is configured. Long sessions can hold a lot of history.</li>
          <li>Find counts stop at 1000 matches, and the bar shows the count with a plus sign.</li>
          <li>
            Restart numbering has no menu or toolbar control. Only the numbered input rule, with a
            number above 1, sets it.
          </li>
          <li>
            Creating a synced reference has no menu item. The command exists and is tested, but no
            control runs it, so a user cannot make one yet.
          </li>
          <li>
            Mod+F opens the editor&apos;s find bar when focus is in the editor, in place of the
            browser&apos;s find.
          </li>
          <li>
            A markdown shortcut typed through an input method composition does not convert, for
            example <code className="font-mono text-sm">-</code> then space on a Vietnamese IME.
          </li>
          <li>
            Emoji data loads on first use, so the first <code className="font-mono text-sm">:</code>{" "}
            may pause for a moment.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="tables-and-structure" level={2}>
          Tables and structure
        </DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            A table holds at most 50 rows and 20 columns, cannot sit inside another table, and its
            cells hold paragraphs only.
          </li>
          <li>
            The slash menu inserts a table at 3 by 3, and the table options menu has no size picker.
          </li>
          <li>
            Footnote definitions are top level only. A definition moved anywhere else becomes a
            paragraph.
          </li>
          <li>
            A <code className="font-mono text-sm">&lt;sup&gt;</code> in pasted HTML stays plain
            text. Footnotes are not parsed from HTML.
          </li>
          <li>Equations are capped at 4000 characters.</li>
          <li>
            A document with a code line, table row or table cell at the top level opens as
            unsupported.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="media" level={2}>
          Media
        </DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Files need a <code className="font-mono text-sm">fileUpload</code> adapter. Without one,
            dropped or pasted files are rejected with a notice, and the readable text of the media
            is kept. With one, each file becomes an image, video, audio or file block, up to 10 per
            paste or drop, and HTML <code className="font-mono text-sm">img</code>,{" "}
            <code className="font-mono text-sm">video</code> and{" "}
            <code className="font-mono text-sm">audio</code> elements are not stored.
          </li>
          <li>
            Video and audio play only direct file links the browser can load. A YouTube or Vimeo
            page link is not turned into a player, and a link the browser cannot play shows as
            unavailable. Both players load on demand, the first time a block of that type is shown.
          </li>
          <li>
            The audio block shows its player alone: no card, no file name, no icon. The static
            output is the browser&apos;s own{" "}
            <code className="font-mono text-sm">&lt;audio controls&gt;</code> in the same bounded
            column, so the two match. The player sends no CORS request, so a link on another site
            plays without CORS headers.
          </li>
          <li>
            A PDF file block has a Preview action only when the browser&apos;s PDF viewer is on (
            <code className="font-mono text-sm">navigator.pdfViewerEnabled</code>); without it,
            Download is the fallback. Preview fetches the file and the bytes must start with{" "}
            <code className="font-mono text-sm">%PDF-</code> within the first 1024 bytes. A file the
            browser cannot fetch, such as a cross-origin link without CORS, shows &quot;This PDF
            can&apos;t be previewed.&quot; A PDF over 50 MB is not shown.
          </li>
          <li>
            Page links have no URL in static output, so a read-only page needs no route for them.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="paste-and-size" level={2}>
          Paste and size
        </DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Paste is capped at 2000 blocks and 1,000,000 text characters, and HTML over 2,000,000
            characters is dropped in favour of its plain text.
          </li>
          <li>
            Autosave waits 800 ms after a change by default, and a revision conflict asks the user
            to reload.
          </li>
          <li>
            The document limits are 20,000 nodes and 2 MB of JSON. Larger documents are not
            measured.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="browser" level={2}>
          Browser and touch
        </DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Browser support is measured, not certified. Core flows pass in automated runs on Chrome
            154, Firefox and WebKit (Playwright builds) at 1280×900, and in Chrome and WebKit touch
            emulation at 390×844. Safari, iOS Safari, Android Chrome, VoiceOver and a real
            Vietnamese IME have not been tested by hand.
          </li>
          <li>
            Touch devices have no block menu. The block handle is hidden when the device cannot
            hover, and nothing else opens Turn into, Duplicate, Delete, Color or move for a block.
            The selection toolbar and the slash menu work on touch.
          </li>
          <li>
            The on-screen keyboard is not handled. Popovers do not follow{" "}
            <code className="font-mono text-sm">visualViewport</code>, so the keyboard can cover
            them.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="performance" level={2}>
          Performance
        </DocHeading>
        <p>
          Measured up to 5,000 paragraphs on one machine: Apple M5, Chrome headless, production
          build of the demo app at 1280×900. Typing latency is measured from keydown to the frame
          after it, so it includes up to one frame of waiting.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>1,000 paragraphs: mount 0.13 s, typing p50 8 ms and p95 10 ms.</li>
          <li>5,000 paragraphs: mount 0.36 s, typing p50 20 ms and p95 24 ms.</li>
          <li>
            A keystroke does no work that grows with the number of blocks in the editor&apos;s own
            code. The rest of the cost at 5,000 paragraphs is in Plate&apos;s store and React.
          </li>
          <li>
            A text-only document loads about 2.0 MB of JavaScript (0.62 MB over the network). The
            video and audio players add about 0.6 MB when a document has such a block.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="next" level={2}>
          Related
        </DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("document-format")}>
              Document format
            </Link>{" "}
            for the rules behind the structural limits
          </li>
          <li>
            <Link className="link-underline" href={docHref("file-uploads")}>
              File uploads
            </Link>{" "}
            for what an adapter has to do
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
