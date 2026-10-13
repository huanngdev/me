import { fileExtension } from "./editor-file";

// The icon kinds a file row shows. The row maps each kind to its lucide icon.
export type FileIconKind =
  "text" | "image" | "video" | "audio" | "archive" | "spreadsheet" | "code" | "file";

const SPREADSHEET_MIMES = new Set([
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const CODE_MIMES = new Set([
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/json",
  "application/xml",
  "text/xml",
]);

const ARCHIVE_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-bzip2",
  "application/zstd",
]);

const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
]);

const EXTENSION_KINDS = new Map<string, FileIconKind>([
  ["pdf", "text"],
  ["doc", "text"],
  ["docx", "text"],
  ["odt", "text"],
  ["rtf", "text"],
  ["txt", "text"],
  ["md", "text"],
  ["csv", "spreadsheet"],
  ["tsv", "spreadsheet"],
  ["xls", "spreadsheet"],
  ["xlsx", "spreadsheet"],
  ["ods", "spreadsheet"],
  ["html", "code"],
  ["htm", "code"],
  ["css", "code"],
  ["js", "code"],
  ["jsx", "code"],
  ["ts", "code"],
  ["tsx", "code"],
  ["json", "code"],
  ["xml", "code"],
  ["py", "code"],
  ["go", "code"],
  ["rs", "code"],
  ["sh", "code"],
  ["yml", "code"],
  ["yaml", "code"],
  ["zip", "archive"],
  ["tar", "archive"],
  ["gz", "archive"],
  ["tgz", "archive"],
  ["7z", "archive"],
  ["rar", "archive"],
  ["bz2", "archive"],
  ["xz", "archive"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["gif", "image"],
  ["webp", "image"],
  ["svg", "image"],
  ["bmp", "image"],
  ["avif", "image"],
  ["mp4", "video"],
  ["mov", "video"],
  ["webm", "video"],
  ["mkv", "video"],
  ["avi", "video"],
  ["mp3", "audio"],
  ["wav", "audio"],
  ["ogg", "audio"],
  ["m4a", "audio"],
  ["flac", "audio"],
  ["aac", "audio"],
]);

// The kind by mime type, or undefined when the mime type says nothing useful.
function kindForMime(mime: string): FileIconKind | undefined {
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (SPREADSHEET_MIMES.has(mime)) {
    return "spreadsheet";
  }
  if (CODE_MIMES.has(mime)) {
    return "code";
  }
  if (ARCHIVE_MIMES.has(mime)) {
    return "archive";
  }
  if (DOCUMENT_MIMES.has(mime) || mime.startsWith("text/")) {
    return "text";
  }
  return undefined;
}

// The icon kind for a file. The mime type decides first. A generic or missing mime type falls back
// to the extension of the name. Anything else is the plain file kind.
export function fileIconKind(mime: string | undefined, name: string | undefined): FileIconKind {
  const byMime = mime === undefined ? undefined : kindForMime(mime);
  if (byMime !== undefined) {
    return byMime;
  }

  const extension = name === undefined ? "" : fileExtension(name).slice(1).toLowerCase();
  return EXTENSION_KINDS.get(extension) ?? "file";
}
