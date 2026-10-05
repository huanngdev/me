export type AssetKind = "image" | "video" | "audio" | "file";

export type AssetRecord = {
  id: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
  createdAt: string;
};

export type UploadState = {
  uploadId: string;
  blockId: string;
  kind: AssetKind;
  name: string;
  status: "pending" | "processing" | "ready" | "failed" | "canceled";
  assetId?: string;
  error?: string;
};

export type AssetStore = {
  put: (record: AssetRecord, blob: Blob) => Promise<void>;
  get: (id: string) => Promise<{ record: AssetRecord; blob: Blob } | null>;
  delete: (id: string) => Promise<void>;
  list: () => Promise<AssetRecord[]>;
};

const MIB = 1024 * 1024;

export const ASSET_LIMITS = {
  image: 10 * MIB,
  video: 100 * MIB,
  audio: 25 * MIB,
  file: 25 * MIB,
} as const satisfies Record<AssetKind, number>;

export type UploadSource = {
  name: string;
  type: string;
  size: number;
  slice: (start: number, end: number) => Blob;
};

export type AssetProbe = (
  blob: Blob,
  kind: AssetKind,
) => Promise<{ width?: number; height?: number; durationMs?: number } | undefined>;
