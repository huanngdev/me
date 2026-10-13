import { SlateElement, type SlateElementProps } from "platejs/static";

import { storedBookmark } from "../../lib/features/editor-bookmark-url";
import { BOOKMARK_CARD_CLASS } from "../elements/bookmark-classes";

export function BookmarkStatic(props: SlateElementProps) {
  const fields = storedBookmark(props.element);
  if (!fields) {
    const raw = typeof props.element.url === "string" ? props.element.url : "";
    return (
      <SlateElement {...props} className="relative py-1">
        <p>{raw}</p>
        {props.children}
      </SlateElement>
    );
  }

  const heading = fields.title ?? fields.siteName ?? fields.url;
  return (
    <SlateElement {...props} className="relative py-1">
      <div className="relative" data-block-handle-anchor="">
        <a
          href={fields.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          data-bookmark-card=""
          data-bookmark-url={fields.url}
          className={`${BOOKMARK_CARD_CLASS} text-foreground no-underline`}
        >
          {fields.imageUrl ? (
            <div
              data-bookmark-thumbnail=""
              className="bg-muted hidden h-full w-[27%] shrink-0 overflow-hidden @[26rem]/card:block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- remote preview, same as the editor card */}
              <img src={fields.imageUrl} alt="" className="size-full object-cover" />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <p className="text-foreground min-w-0 truncate text-base font-semibold">{heading}</p>
            {fields.description ? (
              <p className="text-muted-foreground mt-1 line-clamp-2 min-w-0 text-sm">
                {fields.description}
              </p>
            ) : null}
            <p className="text-muted-foreground mt-auto min-w-0 truncate pt-3 text-sm">
              {fields.url}
            </p>
          </div>
        </a>
      </div>
      {props.children}
    </SlateElement>
  );
}
