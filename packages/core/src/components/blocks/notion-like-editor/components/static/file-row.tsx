import type { ReactNode } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";

import { fileExtension } from "../../lib/features/editor-file";
import type { FileIconKind } from "../../lib/features/editor-file-icon";
import { MEDIA_ICON_CLASS } from "../elements/media-classes";

// The icon of a file row. Each kind names its lucide icon here.
export function FileTypeIcon({ kind }: { kind: FileIconKind }) {
  switch (kind) {
    case "text":
      return <FileText aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "image":
      return <FileImage aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "video":
      return <FileVideo aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "audio":
      return <FileAudio aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "archive":
      return <FileArchive aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "spreadsheet":
      return <FileSpreadsheet aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "code":
      return <FileCode aria-hidden="true" className={MEDIA_ICON_CLASS} />;
    case "file":
      return <File aria-hidden="true" className={MEDIA_ICON_CLASS} />;
  }
}

// The file name. Only the stem truncates, so the extension stays visible.
function FileName({ name }: { name: string }) {
  const extension = fileExtension(name);
  const stem = name.slice(0, name.length - extension.length);
  return (
    <span className="flex min-w-0 items-baseline">
      <span className="min-w-0 truncate">{stem}</span>
      {extension.length === 0 ? null : <span className="shrink-0">{extension}</span>}
    </span>
  );
}

// The text beside a file icon: the name, then one detail line when there is one. `nameSlot`
// replaces the name, for example with a rename field.
export function FileRowText({
  name,
  detail,
  nameSlot,
}: {
  name: string;
  detail: string | undefined;
  nameSlot?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {nameSlot ?? <FileName name={name} />}
      {detail === undefined ? null : (
        <span className="text-muted-foreground text-xs">{detail}</span>
      )}
    </div>
  );
}
