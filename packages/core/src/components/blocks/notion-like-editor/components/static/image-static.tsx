import { SlateElement, type SlateElementProps } from "platejs/static";

import { isLoadableFileUrl } from "../../lib/features/editor-file-url";
import { cleanImageFields } from "../../lib/features/editor-image";
import {
  IMAGE_CAPTION_CLASS,
  imageFigureClassName,
  imageFigureStyle,
  imageMediaClassName,
} from "../elements/image-classes";
import { ImageUnavailableRow } from "./image-unavailable-row";

// The static renderer has no upload adapter. It shows only a url the browser loads directly.
// A block with no url renders nothing, since an empty placeholder has no content to publish.
export function ImageStatic(props: SlateElementProps) {
  const { fields } = cleanImageFields(props.element);
  const url = fields.url;

  if (url === undefined) {
    return (
      <SlateElement {...props} className="relative py-1">
        {props.children}
      </SlateElement>
    );
  }

  if (!isLoadableFileUrl(url)) {
    return (
      <SlateElement {...props} className="relative py-1">
        <div data-image-state="unavailable">
          <ImageUnavailableRow name={fields.name} />
        </div>
        {props.children}
      </SlateElement>
    );
  }

  // Caption, then name, is the alt text.
  const alt = fields.caption ?? fields.name ?? "";
  return (
    <SlateElement {...props} className="relative py-1">
      <figure
        data-image-state="ready"
        className={imageFigureClassName(fields.width, fields.align)}
        style={imageFigureStyle(fields.width)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- stored url that the browser loads directly */}
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          className={imageMediaClassName(fields.width)}
        />
        {fields.caption === undefined ? null : (
          <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
        )}
      </figure>
      {props.children}
    </SlateElement>
  );
}
