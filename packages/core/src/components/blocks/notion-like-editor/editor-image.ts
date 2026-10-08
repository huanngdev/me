import { KEYS, type TElement } from "platejs";

import type { EditorCommand } from "./editor-commands";
import type { AssetRecord, UploadSource } from "./editor-assets";
import {
  IMAGE_ALT_MAX,
  IMAGE_ALIGNS,
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
} from "./editor-document-schema";
import {
  MEDIA_FILE_SKIPPED,
  createMediaKind,
  handleMediaDrop,
  handleMediaInsertData,
  readMediaLayoutProps,
  type MediaDropEvent,
  type MediaPastePlan,
} from "./editor-media";

// The slash menu that would also call these commands is DEV-125.
// This task's picker is the toolbar Replace button and Insert image on an empty image.

export const IMAGE_FILE_SKIPPED = MEDIA_FILE_SKIPPED;
export const IMAGE_UNSAFE_URL = "An image with an unsafe URL was removed.";
export const IMAGE_DATA_URL = "An image stored as base64 could not be kept. It was removed.";
export const IMAGE_BOTH_SOURCES =
  "An image URL was removed because the image already has an asset.";
export const IMAGE_UPLOAD_INTERRUPTED = "Upload didn't finish";
export const IMAGE_NOT_FOUND = "Image not found";
export const IMAGE_STORAGE_UNAVAILABLE = "Browser storage for files is unavailable.";

export const imageHtmlDeserializer = {
  rules: [{ validNodeName: "IMG" }],
  parse({ element }: { element: HTMLElement }): TElement {
    const node: TElement = { type: KEYS.img, children: [{ text: "" }] };
    const src = element.getAttribute("src");
    if (src !== null && src.length > 0) {
      node.url = src;
    }

    const alt = element.getAttribute("alt");
    if (alt !== null) {
      node.alt = alt;
    }

    const caption = figureCaption(element);
    if (caption !== undefined) {
      node.caption = [{ text: caption }];
    }

    return node;
  },
};

function figureCaption(element: HTMLElement): string | undefined {
  const parent = element.parentElement;
  if (parent === null || parent.tagName !== "FIGURE") {
    return undefined;
  }

  for (const child of parent.children) {
    if (child.tagName !== "FIGCAPTION") {
      continue;
    }

    const text = child.textContent?.trim() ?? "";
    return text.length > 0 ? text : undefined;
  }

  return undefined;
}

function readImageProps(node: Record<string, unknown>): Record<string, unknown> {
  const props = readMediaLayoutProps(node, IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH);
  if (typeof node.alt === "string" && node.alt.length <= IMAGE_ALT_MAX) {
    props.alt = node.alt;
  }

  return props;
}

function imageFallback(node: Record<string, unknown>): string | undefined {
  const alt =
    typeof node.alt === "string" && node.alt.length <= IMAGE_ALT_MAX ? node.alt : undefined;
  if (alt === undefined || alt.length === 0) {
    return undefined;
  }

  return alt;
}

function imageReady(record: AssetRecord) {
  const props: Record<string, unknown> = { assetId: record.id };
  if (isPositivePixel(record.width) && isPositivePixel(record.height)) {
    props.naturalWidth = record.width;
    props.naturalHeight = record.height;
  }

  return { props, unset: [], save: "fold" as const };
}

export const imageMedia = createMediaKind({
  nodeType: KEYS.img,
  assetKind: "image",
  pluginKey: "imageRuntime",
  mimePrefix: "image/",
  minWidth: IMAGE_MIN_WIDTH,
  maxWidth: IMAGE_MAX_WIDTH,
  aligns: IMAGE_ALIGNS,
  messages: {
    unsafeUrl: IMAGE_UNSAFE_URL,
    bothSources: IMAGE_BOTH_SOURCES,
    uploadInterrupted: IMAGE_UPLOAD_INTERRUPTED,
    notFound: IMAGE_NOT_FOUND,
    storageUnavailable: IMAGE_STORAGE_UNAVAILABLE,
    dataUrl: IMAGE_DATA_URL,
  },
  replaceUnset: ["url", "assetId", "naturalWidth", "naturalHeight"],
  commands: {
    insertFiles: { id: "block.insert.image", label: "Image" },
    insertUrl: { id: "block.insert.image-url", label: "Image from URL" },
    align: { id: "block.image.align", label: "Align image" },
    width: { id: "block.image.width", label: "Image width" },
    remove: { id: "block.image.remove", label: "Remove image" },
    replace: { id: "block.image.replace", label: "Replace image" },
  },
  readProps: readImageProps,
  fallbackText: imageFallback,
  dataUrlFile: fileFromDataUrl,
  applyReady: imageReady,
  probe: probeImageSize,
});

export const imageRuntimePlugin = imageMedia.plugin;
export const attachImageRuntime = imageMedia.attach;
export const detachImageRuntime = imageMedia.detach;
export const imageUploadState = imageMedia.uploadState;
export const cachedAssetUrl = imageMedia.cachedAssetUrl;
export const assetIsMissing = imageMedia.assetIsMissing;
export const resolveAssetURL = imageMedia.resolveAssetURL;
export const refreshImageURL = imageMedia.refreshAssetURL;
export const assetIsAdapter = imageMedia.assetIsAdapter;
export const queuePastedImageUpload = imageMedia.queuePastedUpload;
export const flushPastedImageUploads = imageMedia.flushPastedUploads;
export const beginImageUpload = (
  editor: Parameters<typeof imageMedia.beginUpload>[0],
  blockId: string,
  file: UploadSource,
) => {
  imageMedia.beginUpload(editor, blockId, file, "source");
};
export const retryImageUpload = imageMedia.retryUpload;
export const insertImageFromFiles = imageMedia.insertFromFiles;
export const insertImageFromUrl = imageMedia.insertFromUrl;
export const setImageAlign = imageMedia.setAlign;
export const setImageWidth = imageMedia.setWidth;
export const removeImage = imageMedia.remove;
export const replaceImageFromFile = imageMedia.replaceFromFile;

export type ImageDropEvent = MediaDropEvent;

export function handleImageInsertData(
  editor: Parameters<typeof handleMediaInsertData>[0],
  data: DataTransfer,
  insertData: (data: DataTransfer) => void,
): boolean {
  return handleMediaInsertData(editor, data, insertData);
}

export function handleImageDrop(
  editor: Parameters<typeof handleImageInsertData>[0],
  event: ImageDropEvent,
): boolean {
  return handleMediaDrop(editor, event);
}

export function clampImageWidth(width: number, containerWidth: number): number {
  return imageMedia.clampWidth(width, containerWidth);
}

export function imageResizeStep(): number {
  return imageMedia.resizeStep();
}

export function planPastedImage(node: Record<string, unknown>): ImagePastePlan {
  const plan = imageMedia.planPasted(node);
  if (plan.kind === "media") {
    return { kind: "image", props: plan.props, upload: plan.upload };
  }

  return plan;
}

export type ImagePastePlan =
  | { kind: "image"; props: Record<string, unknown>; upload?: UploadSource }
  | Exclude<MediaPastePlan, { kind: "media" }>;

// planPastedImage records the both-sources repair at the call site when both keys were present.
export function pastedImageDroppedUrl(node: Record<string, unknown>): boolean {
  return imageMedia.pastedDroppedUrl(node);
}

export const setImageAlt: EditorCommand<{ id: string; alt: string | null }> = {
  id: "block.image.alt",
  label: "Alt text",
  group: "action",
  run: (editor, payload) => {
    const entry = imageMedia.writable(editor, payload.id);
    if (!entry) {
      return;
    }

    if (payload.alt === null) {
      editor.tf.unsetNodes("alt", { at: entry[1] });
      return;
    }

    if (payload.alt.length > IMAGE_ALT_MAX) {
      return;
    }

    editor.tf.setNodes({ alt: payload.alt }, { at: entry[1] });
  },
};

export async function probeImageSize(
  blob: Blob,
): Promise<{ width?: number; height?: number } | undefined> {
  const create = globalThis.createImageBitmap;
  if (typeof create !== "function") {
    return undefined;
  }

  try {
    const image = await create(blob);
    const width = image.width;
    const height = image.height;
    image.close();
    if (!isPositivePixel(width) || !isPositivePixel(height)) {
      return undefined;
    }

    return { width, height };
  } catch {
    return undefined;
  }
}

function fileFromDataUrl(url: string): UploadSource | undefined {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(url.trim());
  const mime = match?.[1]?.toLowerCase();
  const payload = match?.[2];
  if (!mime || !payload) {
    return undefined;
  }

  let binary: string;
  try {
    binary = atob(payload.replace(/\s/g, ""));
  } catch {
    return undefined;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index) & 0xff;
  }

  const extension = mime.slice("image/".length).replace("+xml", "").replace("jpeg", "jpg");
  const blob = new Blob([bytes], { type: mime });
  return {
    name: `pasted.${extension}`,
    type: mime,
    size: bytes.byteLength,
    slice: (start, end) => blob.slice(start, end),
  };
}

function isPositivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
