import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

import { PUBLIC_PORTFOLIO_URL } from "../../constants";
import { type FixedBackButtonProps } from "../fixed-back-button";
import { type BlockFile } from "./block-file-explorer";
import { BlockPreviewTabs } from "./block-preview-tabs";
import { BlockUrlProvider, SafariPreview } from "./block-url";

export type { BlockFile };

const DEFAULT_PREVIEW_URL = PUBLIC_PORTFOLIO_URL.replace(/^https?:\/\//, "");

const registryPathCache = new Map<string, Set<string>>();

/**
 * Source files already published in `public/r/<name>.json` are not serialized into the page
 * payload; the Code tab loads them from that file on demand. This keeps demo pages small while
 * the registry JSON (which the install flow needs anyway) stays the single source of truth.
 */
function registrySourcePaths(name: string): Set<string> {
  const cached = registryPathCache.get(name);
  if (cached) return cached;

  const sources = new Set<string>();
  const prefix = `registry/default/${name}/`;

  try {
    const registry = JSON.parse(
      readFileSync(path.join(process.cwd(), "public", "r", `${name}.json`), "utf8"),
    ) as { files?: { path?: string }[] };

    for (const file of registry.files ?? []) {
      if (typeof file.path === "string" && file.path.startsWith(prefix)) {
        sources.add(file.path.slice(prefix.length));
      }
    }
  } catch {
    // No registry entry for this page: keep every file inline so the Code tab still works.
  }

  registryPathCache.set(name, sources);
  return sources;
}

export type BlockPreviewFrameProps = {
  children: ReactNode;
  url?: string;
  name?: string;
  backButton?: FixedBackButtonProps | false;
  files?: readonly BlockFile[];
  install?: ReactNode;
  docs?: ReactNode;
};

export async function BlockPreviewFrame({
  children,
  url = DEFAULT_PREVIEW_URL,
  name = "block",
  backButton,
  files,
  install,
  docs,
}: BlockPreviewFrameProps) {
  const registrySources = registrySourcePaths(name);
  const explorerFiles = (files ?? []).map((file) =>
    registrySources.has(file.path) ? { path: file.path } : file,
  );

  const preview = (
    <div className="flex flex-col items-center gap-3">
      <SafariPreview baseUrl={url} className="w-[min(92vw,130vh)] drop-shadow-xl">
        <div data-block-viewport className="bg-background size-full overflow-auto">
          {children}
        </div>
      </SafariPreview>
    </div>
  );

  return (
    <div
      data-fullscreen-block
      className="bg-secondary/30 relative isolate h-dvh min-h-0 w-full overflow-hidden"
    >
      <BlockUrlProvider>
        <BlockPreviewTabs
          preview={preview}
          files={explorerFiles}
          slug={name}
          rootName={name}
          url={url}
          backButton={backButton}
          install={install}
          docs={docs}
        />
      </BlockUrlProvider>
    </div>
  );
}
