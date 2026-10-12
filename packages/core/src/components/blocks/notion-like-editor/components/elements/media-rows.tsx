import { useState, type ReactNode } from "react";
import { Image as ImageIcon, RotateCw, Trash2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/button";
import { Progress } from "@/components/progress";
import { cn } from "@/lib/utils";

import { formatFileSize } from "../../lib/features/editor-file-url";
import { EditorIconButton, EditorTextButton } from "../ui/block-toolbar";

// The frame shared by the placeholder, uploading and failed rows of a media block. A single-line row
// is about 44px tall. The icon is the first child, then the text column, then the actions.
export const MEDIA_ROW_CLASS =
  "bg-muted text-foreground flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm";

export const MEDIA_ICON_CLASS = "text-muted-foreground size-4 shrink-0";

// The empty block. Editable, it is a button named by its label. Read-only, it is plain text.
export function MediaPlaceholderRow({
  label,
  icon,
  interactive,
  onActivate,
}: {
  label: string;
  icon: ReactNode;
  interactive: boolean;
  onActivate: () => void;
}) {
  if (!interactive) {
    return (
      <div className={MEDIA_ROW_CLASS}>
        {icon}
        <span>{label}</span>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      data-media-placeholder=""
      className={cn(
        MEDIA_ROW_CLASS,
        "focus-visible:ring-ring/50 h-auto cursor-pointer justify-start font-normal whitespace-normal focus-visible:ring-[3px] focus-visible:outline-none",
      )}
      onClick={() => {
        onActivate();
      }}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}

// The name, size and percent are shown. The live region announces the start only, once per mount.
// The percent is left to the progress bar's own value.
export function MediaUploadingRow({
  name,
  size,
  progress,
  onCancel,
}: {
  name: string;
  size: number;
  progress: number;
  onCancel: () => void;
}) {
  const [announcement] = useState(() => `Uploading ${name}`);
  const percent = Math.round(progress * 100);

  return (
    <div className={MEDIA_ROW_CLASS} data-media-row="uploading">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <ImageIcon aria-hidden="true" className={MEDIA_ICON_CLASS} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        <span className="text-muted-foreground text-xs">
          {`${formatFileSize(size)} · ${percent}%`}
        </span>
        <Progress value={percent} aria-label={`Upload progress for ${name}`} className="w-full" />
      </div>
      <EditorIconButton
        variant="ghost"
        label="Cancel upload"
        icon={<X aria-hidden="true" />}
        onClick={onCancel}
      />
    </div>
  );
}

export function MediaFailedRow({
  message,
  onRetry,
  onRemove,
}: {
  message: string;
  onRetry: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={MEDIA_ROW_CLASS} data-media-row="failed">
      <TriangleAlert aria-hidden="true" className={MEDIA_ICON_CLASS} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span>Upload failed</span>
        <span className="text-muted-foreground min-w-0 truncate text-xs">{message}</span>
      </div>
      <EditorTextButton label="Retry" icon={<RotateCw aria-hidden="true" />} onClick={onRetry} />
      <EditorIconButton
        variant="destructive"
        label="Remove"
        icon={<Trash2 aria-hidden="true" />}
        onClick={onRemove}
      />
    </div>
  );
}
