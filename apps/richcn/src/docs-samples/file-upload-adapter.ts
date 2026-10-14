import type {
  FileUploadAdapter,
  UploadedFile,
} from "@repo/core/components/blocks/notion-like-editor/index";

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
