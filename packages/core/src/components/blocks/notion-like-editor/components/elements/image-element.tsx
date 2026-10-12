import { useState, type ReactNode } from "react";
import { Image as ImageIcon } from "lucide-react";
import {
  PlateElement,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { Skeleton } from "@/components/skeleton";
import { cn } from "@/lib/utils";

import { cleanImageFields, type ImageFields } from "../../lib/features/editor-image";
import { useResolvedFileUrl, type ResolvedFileUrl } from "./file-upload-scope";
import { hrElementClassName } from "./hr-element";
import {
  IMAGE_CAPTION_CLASS,
  IMAGE_ROW_CLASS,
  IMAGE_SKELETON_CLASS,
  imageAlignClass,
  imageFigureClassName,
  imageFigureStyle,
  imageLoadingStyle,
  imageMediaClassName,
} from "./image-classes";
import { ImageUnavailableRow } from "../static/image-unavailable-row";

export type ImageState = "empty" | "loading" | "ready" | "unavailable";

// `src` is the loadable url once resolved. `failedUrl` is the url whose load failed.
function imageState(
  url: string | undefined,
  status: ResolvedFileUrl["status"],
  src: string | undefined,
  failedUrl: string | undefined,
): ImageState {
  if (url === undefined) {
    return "empty";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  if (src === undefined) {
    return "loading";
  }
  return src === failedUrl ? "unavailable" : "ready";
}

// The image block. The upload UI comes later, so the empty row is not clickable yet.
export function ImageElement(props: PlateElementProps) {
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { fields } = cleanImageFields(element);
  const resolved = useResolvedFileUrl(fields.url);
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);

  const src = resolved.status === "ready" ? resolved.url : undefined;
  const state = imageState(fields.url, resolved.status, src, failedUrl);

  let body: ReactNode;
  if (state === "empty") {
    body = (
      <div className={IMAGE_ROW_CLASS}>
        <ImageIcon aria-hidden="true" className="size-4 shrink-0" />
        <span>Add an image</span>
      </div>
    );
  } else if (state === "loading") {
    body = (
      <div
        className={cn("flex flex-col", imageAlignClass(fields.align))}
        style={imageLoadingStyle(fields.width)}
      >
        <Skeleton className={IMAGE_SKELETON_CLASS} />
      </div>
    );
  } else if (state === "unavailable") {
    body = <ImageUnavailableRow name={fields.name} />;
  } else {
    body = (
      <ImageFigure
        fields={fields}
        src={src ?? ""}
        onError={() => {
          setFailedUrl(src);
        }}
      />
    );
  }

  return (
    <PlateElement
      {...props}
      className={cn("relative py-1", hrElementClassName(selected, focused, readOnly))}
    >
      <div
        contentEditable={false}
        data-block-handle-anchor=""
        data-image-state={state}
        className="relative"
      >
        {body}
      </div>
      {props.children}
    </PlateElement>
  );
}

function ImageFigure({
  fields,
  src,
  onError,
}: {
  fields: ImageFields;
  src: string;
  onError: () => void;
}) {
  // Caption, then name, is the alt text. An empty alt is allowed for a decorative image.
  const alt = fields.caption ?? fields.name ?? "";
  return (
    <figure
      className={imageFigureClassName(fields.width, fields.align)}
      style={imageFigureStyle(fields.width)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- stored or resolved image url, loaded without next/image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        className={imageMediaClassName(fields.width)}
        onError={onError}
      />
      {fields.caption === undefined ? null : (
        <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
      )}
    </figure>
  );
}
