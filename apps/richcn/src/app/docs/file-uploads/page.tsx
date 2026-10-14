import Link from "next/link";

import { DocCode } from "@/components/docs/doc-code";
import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("file-uploads");

export default function FileUploadsPage() {
  return (
    <DocPage slug="file-uploads">
      <section className="space-y-3">
        <DocHeading id="adapter">The adapter</DocHeading>
        <p>
          The image, video, audio and file blocks all store a URL. A{" "}
          <code className="font-mono text-sm">FileUploadAdapter</code> is what turns a picked,
          pasted or dropped file into that URL. The editor has no upload of its own, so the
          endpoint, the credentials and the storage are yours.
        </p>
        <DocCode editorFile="lib/features/editor-file-upload.ts" language="ts" />
      </section>

      <section className="space-y-3">
        <DocHeading id="handler">A complete upload handler</DocHeading>
        <p>
          <code className="font-mono text-sm">XMLHttpRequest</code> is used here rather than{" "}
          <code className="font-mono text-sm">fetch</code> because it reports upload progress. The
          abort signal fires when the user cancels the upload or when the block is removed, and the
          sample handles both ends of it: a signal that is already aborted rejects before anything
          is sent, and a later abort calls{" "}
          <code className="font-mono text-sm">request.abort()</code>, whose own{" "}
          <code className="font-mono text-sm">abort</code> event rejects the promise with an{" "}
          <code className="font-mono text-sm">AbortError</code>. Without that listener the promise
          would never settle, because an aborted request does not fire{" "}
          <code className="font-mono text-sm">error</code>.
        </p>
        <DocCode sample="file-upload-adapter.ts" language="ts" />
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">upload</code> must resolve to an object with a{" "}
            <code className="font-mono text-sm">url</code>.{" "}
            <code className="font-mono text-sm">name</code>,{" "}
            <code className="font-mono text-sm">size</code> and{" "}
            <code className="font-mono text-sm">mime</code> are optional; the File fills in whatever
            you leave out.
          </li>
          <li>
            <code className="font-mono text-sm">onProgress</code> takes a fraction from 0 to 1.
            Calling it is optional.
          </li>
          <li>
            One block has at most one upload at a time. Starting a second upload on the same block
            cancels the first.
          </li>
          <li>
            A failed upload shows your error message, cleaned to one line and cut to 200 characters,
            or &quot;Upload failed.&quot; when there is none. Retry uploads the same file.
          </li>
          <li>
            Size and type limits are yours. The editor checks the mime family a block needs (
            <code className="font-mono text-sm">image/</code>,{" "}
            <code className="font-mono text-sm">video/</code>,{" "}
            <code className="font-mono text-sm">audio/</code>) and nothing else.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="untrusted">What the editor checks</DocHeading>
        <p>Everything an adapter returns is untrusted. Before a result is stored:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <code className="font-mono text-sm">url</code> must be a string of 1 to 2048 characters
            with no control characters and no whitespace, and must not use a{" "}
            <code className="font-mono text-sm">javascript:</code>,{" "}
            <code className="font-mono text-sm">data:</code> or{" "}
            <code className="font-mono text-sm">vbscript:</code> scheme. An invalid URL fails the
            upload with &quot;The upload returned an invalid file.&quot;
          </li>
          <li>
            An invalid <code className="font-mono text-sm">name</code>,{" "}
            <code className="font-mono text-sm">size</code> or{" "}
            <code className="font-mono text-sm">mime</code> is dropped and the File&apos;s value
            fills it in. A name loses its control and bidi override characters, gets its path
            separators replaced, and is cut to 255 characters.
          </li>
          <li>
            A URL from <code className="font-mono text-sm">resolveUrl</code> must be{" "}
            <code className="font-mono text-sm">http</code>,{" "}
            <code className="font-mono text-sm">https</code> or{" "}
            <code className="font-mono text-sm">blob</code>; nothing else reaches{" "}
            <code className="font-mono text-sm">src</code> or{" "}
            <code className="font-mono text-sm">href</code>. A throw, an abort or an unloadable
            result gives null.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="resolve-url">resolveUrl</DocHeading>
        <p>
          Optional. The editor calls it only for a stored URL that is not http, https or
          root-relative, for example the{" "}
          <code className="font-mono text-sm">upload:&lt;id&gt;</code> form in the example above or
          the <code className="font-mono text-sm">local-file:&lt;id&gt;</code> form in the demo. It
          is how a private bucket or a browser-local file becomes something the page can load.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="no-adapter">Without an adapter</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Dropped and pasted files are rejected with a notice, and the readable text of the media
            is kept instead.
          </li>
          <li>
            An image, video or audio block shows its file only when its URL is http, https or
            root-relative. A file block opens only then.
          </li>
          <li>
            You can still set a media URL by hand from the block&apos;s own popover, and
            &quot;Replace&quot; accepts a link the same way.
          </li>
        </ul>
        <DocNote>
          Pasting an image from a web page does not store the image bytes. HTML{" "}
          <code className="font-mono text-sm">img</code>,{" "}
          <code className="font-mono text-sm">video</code> and{" "}
          <code className="font-mono text-sm">audio</code> elements are not turned into media
          blocks; only real files are, up to 10 per paste or drop.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="link-preview">Bookmark previews</DocHeading>
        <p>
          A bookmark block fetches nothing by itself. Pass a{" "}
          <code className="font-mono text-sm">linkPreview</code> adapter and the editor asks it for
          the title, description, site name and image of the linked page. Without one, the card
          shows the domain and no request is made.
        </p>
        <DocCode sample="link-preview-adapter.ts" language="ts" />
        <DocNote>
          The adapter runs on your server or behind your API route, so it can reach any URL a user
          pastes. The editor&apos;s own comment asks for the obvious protections: block private,
          loopback and link-local addresses after DNS resolution, re-check each redirect (at most
          three), cap the body at 512 KB and the time at 5 seconds, and parse{" "}
          <code className="font-mono text-sm">text/html</code> only.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("mentions-and-page-links")}>
              Mentions and page links
            </Link>{" "}
            for the other host-supplied providers
          </li>
          <li>
            <Link className="link-underline" href={docHref("features")}>
              Feature switches
            </Link>{" "}
            to remove media or embeds from the editor entirely
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
