# File uploads

## Contents

- [The contract](#the-contract)
- [A complete upload handler](#a-complete-upload-handler)
- [What the editor checks](#what-the-editor-checks)
- [Without an adapter](#without-an-adapter)
- [Bookmark previews](#bookmark-previews)

## The contract

The image, video, audio and file blocks all store a URL. A `FileUploadAdapter` is what turns a
picked, pasted or dropped file into that URL. The editor has no upload of its own, so the endpoint,
the credentials and the storage are the project's.

```ts
// What the consumer's upload returns. Only `url` is required.
export type UploadedFile = {
  url: string; // what the document stores; a consumer usually returns an https URL
  name?: string;
  size?: number; // bytes
  mime?: string;
};

export type FileUploadOptions = {
  signal: AbortSignal; // aborted when the user cancels or the block is removed
  onProgress: (fraction: number) => void; // 0 to 1; optional for the consumer to call
};

export type FileUploadAdapter = {
  upload: (file: File, options: FileUploadOptions) => Promise<UploadedFile>;
  // Optional. Turns a stored url into one the browser can load. Needed only when `upload`
  // returns a reference that is not directly loadable (the demo returns "local-file:<id>").
  resolveUrl?: (url: string, signal: AbortSignal) => Promise<string | null>;
};
```

Pass it as `fileUpload`. One block has at most one upload at a time; starting a second upload on the
same block cancels the first. A failed upload shows the error message, cleaned to one line and cut to
200 characters, or "Upload failed." when there is none. Retry uploads the same file.

## A complete upload handler

`XMLHttpRequest` is used rather than `fetch` because it reports upload progress. The abort signal
fires when the user cancels the upload or when the block is removed, and both ends of it are handled
below: an already-aborted signal rejects before anything is sent, and a later abort calls
`request.abort()`, whose own `abort` event rejects the promise with an `AbortError`. Without that
listener the promise would never settle, because an aborted request does not fire `error`.

```ts
import type { FileUploadAdapter, UploadedFile } from "@/components/blocks/notion-like-editor";

const MAX_BYTES = 25 * 1024 * 1024;

export const endpointUploadAdapter: FileUploadAdapter = {
  upload(file, { signal, onProgress }) {
    if (file.size > MAX_BYTES) {
      return Promise.reject(new Error("That file is larger than 25 MB."));
    }

    return new Promise<UploadedFile>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const request = new XMLHttpRequest();
      const body = new FormData();
      body.append("file", file);

      request.open("POST", "/api/uploads");

      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded / event.total);
        }
      });

      request.addEventListener("load", () => {
        if (request.status < 200 || request.status >= 300) {
          reject(new Error("The upload failed."));
          return;
        }

        // The endpoint answers with { url, name, size, mime }. Only url is required.
        resolve(JSON.parse(request.responseText) as UploadedFile);
      });

      request.addEventListener("error", () => reject(new Error("The upload failed.")));

      // An aborted request fires "abort", not "error", so it needs its own listener or the
      // promise would never settle.
      request.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));

      signal.addEventListener(
        "abort",
        () => {
          request.abort();
        },
        { once: true },
      );

      request.send(body);
    });
  },

  async resolveUrl(url, signal) {
    // Optional. Only the editor calls it, and only for a stored url that is not http, https or
    // root-relative, such as this one.
    if (!url.startsWith("upload:")) {
      return url;
    }

    const id = url.slice("upload:".length);
    const response = await fetch(`/api/uploads/${id}/url`, { signal });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { url: string };
    return body.url;
  },
};
```

Size and type limits are the project's. The editor checks only the mime family a block needs
(`image/`, `video/`, `audio/`) and nothing else.

## What the editor checks

Everything an adapter returns is untrusted. Before a result is stored:

- `url` must be a string of 1 to 2048 characters with no control characters and no whitespace, and
  must not use a `javascript:`, `data:` or `vbscript:` scheme. An invalid `url` fails the upload with
  "The upload returned an invalid file."
- An invalid `name`, `size` or `mime` is dropped and the File's value fills it in. A name loses its
  control and bidi override characters, gets its path separators replaced, and is cut to 255
  characters.
- A URL from `resolveUrl` must be `http`, `https` or `blob`; nothing else reaches `src` or `href`. A
  throw, an abort or an unloadable result gives null.

`resolveUrl` is optional. The editor calls it only for a stored URL that is not http, https or
root-relative, such as the `upload:<id>` form above or the demo's `local-file:<id>`. It is how a
private bucket or a browser-local file becomes something the page can load.

## Without an adapter

- Dropped and pasted files are rejected with a notice, and the readable text of the media is kept
  instead.
- An image, video or audio block shows its file only when its URL is http, https or root-relative. A
  file block opens only then.
- A media URL can still be typed by hand from the block's own popover, and "Replace" accepts a link
  the same way.
- Pasting an image from a web page does not store the image bytes. HTML `img`, `video` and `audio`
  elements are not stored; only real files are, up to 10 per paste or drop.

## Bookmark previews

A bookmark block fetches nothing by itself. Pass a `linkPreview` adapter and the editor asks it for
the title, description, site name and image of the linked page. Without one, the card shows the
domain and no request is made.

```ts
import type { LinkPreviewAdapter } from "@/components/blocks/notion-like-editor";

// The editor never fetches the URL itself. This endpoint does, and it answers with
// { title?, description?, siteName?, imageUrl? }.
export const previewAdapter: LinkPreviewAdapter = {
  async fetchPreview(url, signal) {
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      title?: string;
      description?: string;
      siteName?: string;
      imageUrl?: string;
    };
  },
};
```

The adapter runs on the server or behind an API route, so it can reach any URL a user pastes. The
editor's own comment asks for the obvious protections: block private, loopback and link-local
addresses after DNS resolution, re-check each redirect (at most three), cap the body at 512 KB and
the time at 5 seconds, and parse `text/html` only.

More at [richcn.huanngdev.site/docs/file-uploads](https://richcn.huanngdev.site/docs/file-uploads).
