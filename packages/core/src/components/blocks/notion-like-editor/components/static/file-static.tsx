import { SlateElement, type SlateElementProps } from "platejs/static";

import { cn } from "@/lib/utils";

import { cleanFileFields, displayFileName } from "../../lib/features/editor-file";
import { fileIconKind } from "../../lib/features/editor-file-icon";
import { formatFileSize, isDirectFileUrl } from "../../lib/features/editor-file-url";
import { FileRowText, FileTypeIcon } from "./file-row";
import { MEDIA_ROW_CLASS } from "../elements/media-classes";

// The static renderer has no upload adapter. A url the browser loads directly is a link. Any other
// url shows the row without a link. A block with no url renders nothing, since an empty placeholder
// has no content to publish.
export function FileStatic(props: SlateElementProps) {
  const { fields } = cleanFileFields(props.element);
  const url = fields.url;

  if (url === undefined) {
    return (
      <SlateElement {...props} className="relative py-1">
        {props.children}
      </SlateElement>
    );
  }

  const name = displayFileName(fields);
  const icon = <FileTypeIcon kind={fileIconKind(fields.mime, name)} />;

  if (!isDirectFileUrl(url)) {
    return (
      <SlateElement {...props} className="relative py-1">
        <div data-file-state="unavailable" className={MEDIA_ROW_CLASS}>
          {icon}
          <FileRowText name={name} detail="File unavailable" />
        </div>
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement {...props} className="relative py-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        data-file-state="ready"
        className={cn(
          MEDIA_ROW_CLASS,
          "hover:bg-accent focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        )}
      >
        {icon}
        <FileRowText
          name={name}
          detail={fields.size === undefined ? undefined : formatFileSize(fields.size)}
        />
      </a>
      {props.children}
    </SlateElement>
  );
}
