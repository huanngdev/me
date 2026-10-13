import { Download } from "lucide-react";

import { Button } from "@/components/button";

import { isHttpFileUrl } from "../../lib/features/editor-file-url";
import { editorControlLabel } from "./block-toolbar";

// The Download action of a file, video or audio block. A cross-origin file cannot be downloaded in
// place, so an http or https link opens in a new tab. Any other link downloads under `name`.
export function MediaDownloadButton({
  kind,
  href,
  name,
  onDownload,
}: {
  kind: "file" | "video" | "audio";
  href: string | undefined; // the resolved url; undefined while it resolves or when unavailable
  name: string | undefined;
  onDownload: () => void;
}) {
  const external = href !== undefined && isHttpFileUrl(href);
  const attr =
    kind === "file"
      ? { "data-file-action": "download" }
      : kind === "video"
        ? { "data-video-action": "download" }
        : { "data-audio-action": "download" };
  return (
    <Button
      asChild
      size="sm"
      variant="ghost"
      className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
    >
      <a
        href={href}
        download={href === undefined ? undefined : name}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer nofollow" : undefined}
        aria-disabled={href === undefined ? true : undefined}
        {...attr}
        onClick={() => {
          onDownload();
        }}
      >
        {editorControlLabel(<Download aria-hidden="true" />, "Download")}
      </a>
    </Button>
  );
}
