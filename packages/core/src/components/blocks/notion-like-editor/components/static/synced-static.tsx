import { ElementApi, PathApi, type Descendant, type TElement } from "platejs";
import {
  createStaticEditor,
  PlateStatic,
  SlateElement,
  type SlateElementProps,
} from "platejs/static";

import { syncedTargetStatus } from "../../lib/features/editor-synced-repair";
import { editorStaticPlugins } from "../../lib/static/editor-static-plugins";

const FROM_ABOVE = "Synced from above";
const FROM_BELOW = "Synced from below";
const MISSING = "The original block was deleted.";
const INVALID = "Invalid reference";

function indexElements(value: readonly Descendant[]): Map<string, TElement> {
  const index = new Map<string, TElement>();
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) return;
    if (typeof node.id === "string" && node.id.length > 0 && !index.has(node.id)) {
      index.set(node.id, node);
    }
    node.children.forEach(visit);
  };
  value.forEach(visit);
  return index;
}

function pathOf(value: readonly Descendant[], id: string, path: number[] = []): number[] | null {
  for (let index = 0; index < value.length; index += 1) {
    const node = value[index];
    if (!ElementApi.isElement(node)) continue;
    const here = [...path, index];
    if (node.id === id) return here;
    const nested = pathOf(node.children, id, here);
    if (nested) return nested;
  }
  return null;
}

function previewTree(node: Descendant): Descendant {
  if (!ElementApi.isElement(node)) return node;
  const children = node.children.map((child) => previewTree(child));
  const copy: TElement = { ...node, children };
  if (
    (node.type === "h1" || node.type === "h2" || node.type === "h3") &&
    typeof node.id === "string" &&
    node.id.length > 0
  ) {
    copy.id = `preview-${node.id}`;
  }
  return copy;
}

export function SyncedStatic(props: SlateElementProps) {
  const targetId =
    typeof props.element.targetBlockId === "string" ? props.element.targetBlockId : "";
  const value = props.editor.children;
  const index = indexElements(value);
  const target = index.get(targetId);
  const status = syncedTargetStatus(target, targetId);
  const refId = typeof props.element.id === "string" ? props.element.id : "";
  const refPath = pathOf(value, refId) ?? [];
  const targetPath = pathOf(value, targetId);
  const label =
    status === "live" && targetPath
      ? PathApi.compare(targetPath, refPath) < 0
        ? FROM_ABOVE
        : FROM_BELOW
      : undefined;
  const preview =
    status === "live" && target && ElementApi.isElement(previewTree(target))
      ? (previewTree(target) as TElement)
      : null;
  const previewEditor = preview
    ? createStaticEditor({ plugins: editorStaticPlugins, value: [preview] })
    : null;

  return (
    <SlateElement
      {...props}
      className="group border-border relative my-2 max-w-full min-w-0 rounded-md border-s ps-3"
    >
      <div data-synced-ref="" data-synced-state={status}>
        {label === undefined ? null : (
          <p data-synced-label className="text-muted-foreground text-xs">
            {label}
          </p>
        )}
        {previewEditor ? (
          <div data-synced-preview className="pointer-events-none max-w-full min-w-0">
            <PlateStatic editor={previewEditor} className="contents" />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {status === "missing" ? MISSING : INVALID}
          </p>
        )}
      </div>
      {props.children}
    </SlateElement>
  );
}
