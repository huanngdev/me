import { SquarePlay } from "lucide-react";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { cleanEmbedFields } from "../../lib/features/editor-embed";
import { embedProviderLabel, embedWatchUrl } from "../../lib/features/editor-embed-url";
import { IMAGE_CAPTION_CLASS } from "../elements/image-classes";
import { MEDIA_ICON_CLASS, MEDIA_ROW_CLASS } from "../elements/media-classes";

// The static renderer has no frame and no script. The embed is a link to its watch page, built from the
// provider and id. An empty embed renders nothing, since a placeholder has no content to publish.
export function EmbedStatic(props: SlateElementProps) {
  const { fields } = cleanEmbedFields(props.element);
  const { provider, videoId } = fields;

  if (provider === undefined || videoId === undefined) {
    return (
      <SlateElement {...props} className="relative py-1">
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement {...props} className="relative py-1">
      <figure data-embed-state="watch">
        <a
          href={embedWatchUrl(provider, videoId)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`${MEDIA_ROW_CLASS} text-foreground no-underline`}
        >
          <SquarePlay aria-hidden="true" className={MEDIA_ICON_CLASS} />
          <span>{`Watch on ${embedProviderLabel(provider)}`}</span>
        </a>
        {fields.caption === undefined ? null : (
          <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
        )}
      </figure>
      {props.children}
    </SlateElement>
  );
}
