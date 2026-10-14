// The PDF preview of a file block. The browser's own PDF viewer shows the file. An iframe with no
// sandbox attribute is the only frame where that viewer runs, so the bytes are checked here before
// the frame sees them. A stored blob can have an empty or wrong type, so the result is always
// typed again as a PDF.

export const PDF_MIME = "application/pdf";
export const PDF_PREVIEW_MAX_BYTES = 50 * 1024 * 1024;

const PDF_SIGNATURE = new TextEncoder().encode("%PDF-");
const SIGNATURE_WINDOW = 1024;

export function isPdfMime(mime: string | undefined): boolean {
  return mime === PDF_MIME;
}

// True when the browser's PDF viewer is on. Without navigator, there is no viewer.
export function pdfViewerAvailable(): boolean {
  return typeof navigator !== "undefined" && Reflect.get(navigator, "pdfViewerEnabled") === true;
}

type PdfPreviewResult =
  { ok: true; blob: Blob } | { ok: false; reason: "network" | "too-large" | "not-pdf" };

// The signature must end inside the first 1024 bytes.
function hasPdfSignature(bytes: Uint8Array): boolean {
  for (let start = 0; start + PDF_SIGNATURE.length <= bytes.length; start += 1) {
    if (PDF_SIGNATURE.every((byte, offset) => bytes[start + offset] === byte)) {
      return true;
    }
  }
  return false;
}

// An abort rejects with the abort error, so the caller can ignore it. Every other failure is a result.
export async function loadPdfPreview(url: string, signal: AbortSignal): Promise<PdfPreviewResult> {
  let blob: Blob;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return { ok: false, reason: "network" };
    }
    blob = await response.blob();
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return { ok: false, reason: "network" };
  }

  if (blob.size > PDF_PREVIEW_MAX_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  const head = new Uint8Array(await blob.slice(0, SIGNATURE_WINDOW).arrayBuffer());
  if (!hasPdfSignature(head)) {
    return { ok: false, reason: "not-pdf" };
  }

  return { ok: true, blob: new Blob([blob], { type: PDF_MIME }) };
}
