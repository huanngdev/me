import { Music, VolumeX } from "lucide-react";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { displayFileName } from "../../lib/features/editor-file";
import { formatFileSize, isLoadableFileUrl } from "../../lib/features/editor-file-url";
import { cleanAudioFields } from "../../lib/features/editor-audio";
import { IMAGE_CAPTION_CLASS } from "../elements/image-classes";
import { MEDIA_CARD_CLASS, MEDIA_ICON_CLASS } from "../elements/media-classes";
import { FileRowText } from "./file-row";
import { MediaUnavailableRow } from "./media-unavailable-row";

// The static renderer has no upload adapter. It shows only a url the browser loads directly. A block
// with no url renders nothing, since an empty placeholder has no content to publish.
export function AudioStatic(props: SlateElementProps) {
  const { fields } = cleanAudioFields(props.element);
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
        <div data-audio-state="unavailable">
          <MediaUnavailableRow
            icon={<VolumeX aria-hidden="true" className="size-4 shrink-0" />}
            label="Audio unavailable"
            name={fields.name}
          />
        </div>
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement {...props} className="relative py-1">
      <figure data-audio-state="ready" className="flex w-full flex-col">
        <div className={MEDIA_CARD_CLASS}>
          <div className="flex items-center gap-3">
            <Music aria-hidden="true" className={MEDIA_ICON_CLASS} />
            <FileRowText
              name={displayFileName(fields)}
              detail={fields.size === undefined ? undefined : formatFileSize(fields.size)}
            />
          </div>
          <audio src={url} controls preload="metadata" className="w-full" />
        </div>
        {fields.caption === undefined ? null : (
          <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
        )}
      </figure>
      {props.children}
    </SlateElement>
  );
}
