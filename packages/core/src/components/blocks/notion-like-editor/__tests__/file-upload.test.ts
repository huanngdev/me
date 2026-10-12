import { describe, expect, test } from "bun:test";

import {
  formatFileSize,
  isLoadableFileUrl,
  resolveFileUrl,
  sanitizeStoredFileUrl,
  sanitizeUploadedFile,
} from "../lib/features/editor-file-url";
import type { FileUploadAdapter } from "../lib/features/editor-file-upload";

function adapterWith(resolveUrl: FileUploadAdapter["resolveUrl"]): FileUploadAdapter {
  return {
    upload: () => Promise.reject(new Error("not used")),
    resolveUrl,
  };
}

describe("sanitizeStoredFileUrl", () => {
  test("accepts http, https and other opaque references, and trims them", () => {
    expect(sanitizeStoredFileUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(sanitizeStoredFileUrl("http://example.com/a.pdf")).toBe("http://example.com/a.pdf");
    expect(sanitizeStoredFileUrl("local-file:abc")).toBe("local-file:abc");
    expect(sanitizeStoredFileUrl("  https://example.com/x  ")).toBe("https://example.com/x");
  });

  test("rejects javascript, data and vbscript in any case and with leading spaces", () => {
    expect(sanitizeStoredFileUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeStoredFileUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(sanitizeStoredFileUrl(" data:text/html,hi")).toBeNull();
    expect(sanitizeStoredFileUrl("DATA:text/html,hi")).toBeNull();
    expect(sanitizeStoredFileUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeStoredFileUrl(" javascript:alert(1)")).toBeNull();
  });

  test("rejects empty, too long, control, whitespace and non-string values", () => {
    expect(sanitizeStoredFileUrl("")).toBeNull();
    expect(sanitizeStoredFileUrl("   ")).toBeNull();
    expect(sanitizeStoredFileUrl("a".repeat(2049))).toBeNull();
    expect(sanitizeStoredFileUrl("https://example.com/\u0007")).toBeNull();
    expect(sanitizeStoredFileUrl("https://example.com/a b")).toBeNull();
    expect(sanitizeStoredFileUrl("https://example.com/a\nb")).toBeNull();
    expect(sanitizeStoredFileUrl(null)).toBeNull();
    expect(sanitizeStoredFileUrl(42)).toBeNull();
    expect(sanitizeStoredFileUrl(undefined)).toBeNull();
  });

  test("accepts exactly 2048 characters", () => {
    const url = `https://example.com/${"a".repeat(2048 - "https://example.com/".length)}`;
    expect(url.length).toBe(2048);
    expect(sanitizeStoredFileUrl(url)).toBe(url);
  });
});

describe("isLoadableFileUrl", () => {
  test("is true only for http, https and blob URLs", () => {
    expect(isLoadableFileUrl("https://example.com/a.png")).toBe(true);
    expect(isLoadableFileUrl("http://example.com/a.png")).toBe(true);
    expect(isLoadableFileUrl("blob:https://example.com/3f2a")).toBe(true);
    expect(isLoadableFileUrl("local-file:abc")).toBe(false);
    expect(isLoadableFileUrl("javascript:alert(1)")).toBe(false);
    expect(isLoadableFileUrl("data:text/plain,hi")).toBe(false);
    expect(isLoadableFileUrl("/relative/path.png")).toBe(false);
    expect(isLoadableFileUrl("not a url")).toBe(false);
  });
});

describe("resolveFileUrl", () => {
  test("returns an http or https url without calling the adapter", async () => {
    let calls = 0;
    const adapter = adapterWith(() => {
      calls += 1;
      return Promise.resolve("blob:https://example.com/x");
    });

    const url = await resolveFileUrl(
      adapter,
      "https://cdn.example.com/a.png",
      new AbortController().signal,
    );
    expect(url).toBe("https://cdn.example.com/a.png");
    expect(calls).toBe(0);
  });

  test("returns null for a stored value that is not a valid url", async () => {
    const url = await resolveFileUrl(
      adapterWith(() => Promise.resolve("blob:https://example.com/x")),
      "javascript:alert(1)",
      new AbortController().signal,
    );
    expect(url).toBeNull();
  });

  test("uses the adapter result only when it is loadable", async () => {
    const signal = new AbortController().signal;
    const loadable = await resolveFileUrl(
      adapterWith(() => Promise.resolve("blob:https://example.com/x")),
      "local-file:abc",
      signal,
    );
    expect(loadable).toBe("blob:https://example.com/x");

    const unloadable = await resolveFileUrl(
      adapterWith(() => Promise.resolve("javascript:alert(1)")),
      "local-file:abc",
      signal,
    );
    expect(unloadable).toBeNull();
  });

  test("gives null for a non-string result from the adapter", async () => {
    const bad: unknown = 42;
    const url = await resolveFileUrl(
      adapterWith(() => Promise.resolve(bad as string)),
      "local-file:abc",
      new AbortController().signal,
    );
    expect(url).toBeNull();
  });

  test("gives null when there is no adapter or no resolveUrl", async () => {
    const signal = new AbortController().signal;
    expect(await resolveFileUrl(null, "local-file:abc", signal)).toBeNull();
    expect(
      await resolveFileUrl(
        { upload: () => Promise.reject(new Error("not used")) },
        "local-file:abc",
        signal,
      ),
    ).toBeNull();
  });

  test("gives null when resolveUrl throws or rejects", async () => {
    const signal = new AbortController().signal;
    expect(
      await resolveFileUrl(
        adapterWith(() => {
          throw new Error("boom");
        }),
        "local-file:abc",
        signal,
      ),
    ).toBeNull();
    expect(
      await resolveFileUrl(
        adapterWith(() => Promise.reject(new Error("boom"))),
        "local-file:abc",
        signal,
      ),
    ).toBeNull();
  });

  test("gives null when the signal is aborted before or during the call", async () => {
    const aborted = new AbortController();
    aborted.abort();
    let calls = 0;
    const adapter = adapterWith(() => {
      calls += 1;
      return Promise.resolve("blob:https://example.com/x");
    });
    expect(await resolveFileUrl(adapter, "local-file:abc", aborted.signal)).toBeNull();
    expect(calls).toBe(0);

    const during = new AbortController();
    const late = adapterWith(() => {
      during.abort();
      return Promise.resolve("blob:https://example.com/x");
    });
    expect(await resolveFileUrl(late, "local-file:abc", during.signal)).toBeNull();
  });
});

describe("sanitizeUploadedFile", () => {
  test("keeps valid fields", () => {
    expect(
      sanitizeUploadedFile({
        url: "https://cdn.example.com/a.pdf",
        name: "report.pdf",
        size: 2048,
        mime: "application/pdf",
      }),
    ).toEqual({
      url: "https://cdn.example.com/a.pdf",
      name: "report.pdf",
      size: 2048,
      mime: "application/pdf",
    });
  });

  test("rejects a missing, invalid or non-object url", () => {
    expect(sanitizeUploadedFile({ url: "javascript:alert(1)" })).toBeNull();
    expect(sanitizeUploadedFile({ name: "a.txt" })).toBeNull();
    expect(sanitizeUploadedFile(null)).toBeNull();
    expect(sanitizeUploadedFile(["https://example.com"])).toBeNull();
    expect(sanitizeUploadedFile("https://example.com")).toBeNull();
  });

  test("cleans names of control and bidi characters and replaces path separators", () => {
    const cleaned = sanitizeUploadedFile({ url: "local-file:a", name: "a‮b\u0007.pdf" });
    expect(cleaned?.name).toBe("ab.pdf");

    const separated = sanitizeUploadedFile({ url: "local-file:a", name: "../etc/passwd" });
    expect(separated?.name).toBe(".._etc_passwd");
  });

  test("limits names to 255 characters", () => {
    const long = sanitizeUploadedFile({ url: "local-file:a", name: "x".repeat(300) });
    expect(long?.name?.length).toBeLessThanOrEqual(255);
    expect(long?.name?.length).toBe(255);
  });

  test("drops an invalid name, size or mime and keeps the url", () => {
    const blank = sanitizeUploadedFile({ url: "local-file:a", name: "‮\u0001" });
    expect(blank).toEqual({ url: "local-file:a" });

    for (const size of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "12"]) {
      expect(sanitizeUploadedFile({ url: "local-file:a", size })).toEqual({ url: "local-file:a" });
    }

    for (const mime of ["Image/PNG", "image", "text/plain; charset=utf-8", 7]) {
      expect(sanitizeUploadedFile({ url: "local-file:a", mime })).toEqual({ url: "local-file:a" });
    }
  });
});

describe("formatFileSize", () => {
  test("uses base 1024 with at most one decimal and no trailing .0", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1100)).toBe("1.1 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatFileSize(1288490189)).toBe("1.2 GB");
    expect(formatFileSize(5 * 1024 ** 4)).toBe("5 TB");
  });

  test("moves up a unit when rounding reaches 1024", () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1 MB");
  });

  test("shows invalid input as 0 B", () => {
    expect(formatFileSize(Number.NaN)).toBe("0 B");
    expect(formatFileSize(-5)).toBe("0 B");
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("0 B");
  });
});
