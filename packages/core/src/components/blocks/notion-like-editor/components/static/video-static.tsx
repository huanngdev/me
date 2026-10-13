import { VideoOff } from "lucide-react";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { isLoadableFileUrl } from "../../lib/features/editor-file-url";
import { cleanVideoFields } from "../../lib/features/editor-video";
import {
  IMAGE_CAPTION_CLASS,
  imageFigureClassName,
  imageFigureStyle,
  imageMediaClassName,
} from "../elements/image-classes";
import { MediaUnavailableRow } from "./media-unavailable-row";

// The static renderer has no upload adapter. It shows only a url the browser loads directly. A block
// with no url renders nothing, since an empty placeholder has no content to publish.
export function VideoStatic(props: SlateElementProps) {
  const { fields } = cleanVideoFields(props.element);
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
        <div data-video-state="unavailable">
          <MediaUnavailableRow
            icon={<VideoOff aria-hidden="true" className="size-4 shrink-0" />}
            label="Video unavailable"
            name={fields.name}
          />
        </div>
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement {...props} className="relative py-1">
      <figure
        data-video-state="ready"
        className={imageFigureClassName(fields.width, fields.align)}
        style={imageFigureStyle(fields.width)}
      >
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className={`${imageMediaClassName(fields.width)} bg-black`}
        />
        {fields.caption === undefined ? null : (
          <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
        )}
      </figure>
      {props.children}
    </SlateElement>
  );
}
