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
