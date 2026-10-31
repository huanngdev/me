"use client";

import { useEffect, useState } from "react";

import { hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  BracesIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  PaletteIcon,
} from "lucide-react";

import { CopyButton } from "../copy-button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../resizable";
import { Tree, TreeItem, TreeItemLabel } from "../reui/tree";
import { highlightCode, languageForPath } from "./highlight-code-client";

export type BlockFile = {
  path: string;
  code?: string;
};

type BlockFileExplorerProps = {
  files: readonly BlockFile[];
  slug: string;
  rootName: string;
};

type FileNodeType = "folder" | "ts" | "tsx" | "css" | "json" | "md" | "config";

type FileItem = {
  name: string;
  type: FileNodeType;
  children?: string[];
  file?: BlockFile;
};

const ROOT_ID = "root";
const INDENT = 16;

export function BlockFileExplorer({ files, slug, rootName }: BlockFileExplorerProps) {
  "use no memo";

  const { items, folders, firstFileId } = buildItems(files, rootName);

  const tree = useTree<FileItem>({
    initialState: {
      expandedItems: folders,
      selectedItems: firstFileId ? [firstFileId] : [],
    },
    indent: INDENT,
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => (item.getItemData().children?.length ?? 0) > 0,
    dataLoader: {
      getItem: (itemId) => items[itemId],
      getChildren: (itemId) => items[itemId]?.children ?? [],
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  const selectedId = tree.getState().selectedItems.find((id) => items[id]?.file);
  const active = items[selectedId ?? firstFileId ?? ""]?.file;
  const activePath = active?.path ?? "";
  const [registryCode, setRegistryCode] = useState<Record<string, string> | null>(null);
  const [highlighted, setHighlighted] = useState<{ path: string; html: string } | null>(null);
  const needsRegistry = files.some((file) => file.code === undefined);
  const [loadingSource, setLoadingSource] = useState(needsRegistry);
  const activeCode = active?.code ?? (activePath ? registryCode?.[activePath] : undefined) ?? "";

  useEffect(() => {
    if (!needsRegistry) return;

    let cancelled = false;
    const prefix = `registry/default/${slug}/`;

    void fetch(`/r/${slug}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { files?: { path?: string; content?: string }[] } | null) => {
        if (cancelled) return;

        const sources: Record<string, string> = {};
        for (const file of data?.files ?? []) {
          if (
            typeof file.path === "string" &&
            file.path.startsWith(prefix) &&
            typeof file.content === "string"
          ) {
            sources[file.path.slice(prefix.length)] = file.content;
          }
        }
        setRegistryCode(sources);
        setLoadingSource(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRegistryCode({});
          setLoadingSource(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [needsRegistry, slug]);

  useEffect(() => {
    if (!activePath || !activeCode) return;

    let cancelled = false;

    void highlightCode(activeCode, languageForPath(activePath)).then((html) => {
      if (!cancelled) setHighlighted({ path: activePath, html });
    });

    return () => {
      cancelled = true;
    };
  }, [activePath, activeCode]);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel
        defaultSize="30%"
        minSize="20%"
        maxSize={480}
        className="bg-background flex min-h-0 flex-col overflow-hidden"
      >
        <div className="text-muted-foreground flex h-9 items-center border-b px-3 text-xs font-medium tracking-wide uppercase">
          {rootName}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          <Tree indent={INDENT} tree={tree}>
            {tree.getItems().map((item) => (
              <TreeItem key={item.getId()} item={item}>
                <TreeItemLabel>
                  <span className="flex min-w-0 items-center gap-2">
                    {getFileIcon(item.getItemData().type, item.isExpanded())}
                    <span className="truncate">{item.getItemName()}</span>
                  </span>
                </TreeItemLabel>
              </TreeItem>
            ))}
          </Tree>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel className="bg-background flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex h-9 items-center justify-between gap-2 border-b px-3">
          <span className="text-muted-foreground truncate font-mono text-xs">
            {active?.path ?? "Select a file"}
          </span>
          {active && activeCode ? <CopyButton text={activeCode} size="icon-sm" /> : null}
        </header>
        {active ? (
          highlighted?.path === active.path ? (
            <div
              className="code-block-shiki min-h-0 flex-1 overflow-auto text-xs leading-[20px] [&_pre]:!bg-transparent [&_pre]:p-4"
              dangerouslySetInnerHTML={{ __html: highlighted.html }}
            />
          ) : activeCode ? (
            <pre className="code-block-shiki min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-[20px]">
              {activeCode}
            </pre>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              {loadingSource ? "Loading source…" : "Source unavailable"}
            </div>
          )
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            No file selected
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function buildItems(files: readonly BlockFile[], rootName: string) {
  const items: Record<string, FileItem> = {
    [ROOT_ID]: { name: rootName, type: "folder", children: [] },
  };
  const folders: string[] = [];
  let firstFileId: string | undefined;

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    let parentId = ROOT_ID;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const parent = items[parentId];
      if (!parent) return;

      if (index === segments.length - 1) {
        items[currentPath] = { name: segment, type: fileType(segment), file };
        parent.children = [...(parent.children ?? []), currentPath];
        firstFileId ??= currentPath;
        return;
      }

      if (!items[currentPath]) {
        items[currentPath] = { name: segment, type: "folder", children: [] };
        parent.children = [...(parent.children ?? []), currentPath];
        folders.push(currentPath);
      }
      parentId = currentPath;
    });
  }

  return { items, folders, firstFileId };
}

function fileType(name: string): FileNodeType {
  if (name.endsWith(".tsx")) return "tsx";
  if (name.endsWith(".ts")) return "ts";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".md") || name.endsWith(".mdx")) return "md";
  return "config";
}

function getFileIcon(type: FileNodeType | undefined, isExpanded?: boolean) {
  if (!type || type === "folder") {
    return isExpanded ? (
      <FolderOpenIcon className="pointer-events-none size-4 text-amber-500" />
    ) : (
      <FolderIcon className="pointer-events-none size-4 text-amber-500" />
    );
  }
  if (type === "tsx" || type === "ts") {
    return <FileCodeIcon className="pointer-events-none size-4 text-blue-500" />;
  }
  if (type === "css") {
    return <PaletteIcon className="pointer-events-none size-4 text-purple-500" />;
  }
  if (type === "json") {
    return <BracesIcon className="pointer-events-none size-4 text-yellow-500" />;
  }
  if (type === "md") {
    return <FileTextIcon className="text-muted-foreground pointer-events-none size-4" />;
  }
  return <FileIcon className="text-muted-foreground pointer-events-none size-4" />;
}
