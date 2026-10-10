import { createElement, type ReactNode } from "react";
import { Copy, CornerUpLeft, Trash2 } from "lucide-react";
import { ElementApi, type Descendant, type SlateEditor, type TElement, type TText } from "platejs";
import { pipeRenderLeafStatic } from "platejs/static";
import {
  ElementProvider,
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import {
  SYNCED_CONVERT_LABEL,
  SYNCED_FROM_ABOVE,
  SYNCED_FROM_BELOW,
  SYNCED_GO_LABEL,
  SYNCED_INVALID_PLACEHOLDER,
  SYNCED_MISSING_PLACEHOLDER,
  SYNCED_REF_KEY,
  SYNCED_REMOVE_LABEL,
  convertSyncedRefAt,
  findBlockById,
  goToSyncedOriginal,
  removeSyncedRefAt,
  syncedDirection,
  syncedTargetStatus,
  type SyncedDirection,
  type SyncedTargetStatus,
} from "../../lib/features/editor-synced-block";
import { isStoredSyncedTargetId } from "../../lib/document/editor-document-schema";
import { BLOCK_SELECTED_CLASS } from "./hr-element";
import { MEDIA_TOOLBAR_CLASS, EditorTextButton, keepMediaSelection } from "../ui/block-toolbar";

// PlateStatic (static-CTmHK15f.js:599) assigns `editor.children = value`, so it
// cannot render a target inside the live editor. pluginRenderElementStatic
// (static-CTmHK15f.js:352) also skips ElementProvider, which the react renderer
// wraps at react/index.js:1799. useElement() would then see this reference.
// A nested editor has no media runtime and its own history. This walker reuses
// the main editor's element and leaf components instead.

const PREVIEW_ROOT = 1_000_000;

type PreviewProps = {
  attributes: PlateElementProps["attributes"];
  element: TElement;
  children?: ReactNode;
  path: number[];
  editor: SlateEditor;
};

type ElementRenderer = (props: PreviewProps) => ReactNode;

type PreviewView = {
  status: SyncedTargetStatus;
  node: TElement | undefined;
  direction: SyncedDirection | undefined;
};

function isText(node: Descendant): node is TText {
  return !ElementApi.isElement(node);
}

function isElementRenderer(value: unknown): value is ElementRenderer {
  return typeof value === "function";
}

function elementRenderer(editor: SlateEditor, type: string): ElementRenderer | undefined {
  // React editors index element components by node type. The static isElement
  // cache is not built for them (withSlate pluginCache.node has types, not isElement).
  const types: unknown = editor.meta.pluginCache.node.types;
  const key =
    typeof types === "object" && types !== null && type in types
      ? Reflect.get(types, type)
      : undefined;
  if (typeof key !== "string") {
    return undefined;
  }

  const component: unknown = editor.meta.components?.[key];
  if (isElementRenderer(component)) {
    return component;
  }

  const render: unknown = editor.getPlugin({ key }).render?.node;
  return isElementRenderer(render) ? render : undefined;
}

function previewTree(node: Descendant): Descendant {
  if (!ElementApi.isElement(node)) {
    return node;
  }

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

function previewAttributes(path: number[]): PlateElementProps["attributes"] {
  return {
    "data-slate-node": "element",
    ref: () => undefined,
    "data-preview-path": path.join("."),
  };
}

function PreviewText({ editor, text, path }: { editor: SlateEditor; text: TText; path: number[] }) {
  const renderLeaf = pipeRenderLeafStatic(editor);
  const shown = text.text.length === 0 ? "\uFEFF" : text.text;
  return renderLeaf({
    attributes: { "data-slate-leaf": true },
    children: shown,
    leaf: text,
    text,
    path,
  });
}

function PreviewNode({
  editor,
  node,
  path,
}: {
  editor: SlateEditor;
  node: Descendant;
  path: number[];
}) {
  if (isText(node)) {
    return <PreviewText editor={editor} text={node} path={path} />;
  }

  if (node.type === SYNCED_REF_KEY) {
    return <p>{SYNCED_INVALID_PLACEHOLDER}</p>;
  }

  const children = node.children.map((child, index) => (
    <PreviewNode
      key={path.concat(index).join(".")}
      editor={editor}
      node={child}
      path={path.concat(index)}
    />
  ));
  const renderer = elementRenderer(editor, node.type);

  return (
    <ElementProvider element={node} entry={[node, path]} path={path}>
      {renderer === undefined ? (
        <div>{children}</div>
      ) : (
        createElement(
          renderer,
          {
            attributes: previewAttributes(path),
            editor,
            element: node,
            path,
          },
          children,
        )
      )}
    </ElementProvider>
  );
}

function SyncedPreview({ node }: { node: TElement }) {
  "use no memo";
  const editor = useEditorRef();
  const preview = previewTree(node);
  if (!ElementApi.isElement(preview)) {
    return null;
  }

  return <PreviewNode editor={editor} node={preview} path={[PREVIEW_ROOT]} />;
}

function targetId(element: PlateElementProps["element"]): string {
  return typeof element.targetBlockId === "string" ? element.targetBlockId : "";
}

function refLabel(direction: SyncedDirection | undefined): string | undefined {
  if (direction === "above") {
    return SYNCED_FROM_ABOVE;
  }

  if (direction === "below") {
    return SYNCED_FROM_BELOW;
  }

  return undefined;
}

export function SyncedRefElement(props: PlateElementProps) {
  "use no memo";
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const storedTargetId = targetId(props.element);
  const view = useEditorSelector((): PreviewView => {
    const refPath = editor.api.findPath(props.element);
    const found = isStoredSyncedTargetId(storedTargetId)
      ? findBlockById(editor, storedTargetId)
      : undefined;
    const status = syncedTargetStatus(found?.[0], storedTargetId);
    const direction =
      status === "live" && found && refPath ? syncedDirection(found[1], refPath) : undefined;
    return { status, node: found?.[0], direction };
  }, [storedTargetId, props.element]);
  const label = refLabel(view.direction);
  const path = editor.api.findPath(props.element);

  function selectRef(): void {
    if (!path) {
      return;
    }

    const start = editor.api.start(path);
    if (!start) {
      return;
    }

    editor.tf.withoutSaving(() => {
      editor.tf.select(start);
    });
  }

  function runOnRef(run: (refPath: number[]) => void): void {
    if (!path || readOnly) {
      return;
    }

    editor.tf.withNewBatch(() => {
      run(path);
    });
    editor.tf.setSplittingOnce(true);
  }

  return (
    <PlateElement
      {...props}
      className={cn(
        "group border-border relative my-2 max-w-full min-w-0 rounded-md border-s ps-3",
        selected && focused && !readOnly && BLOCK_SELECTED_CLASS,
      )}
    >
      <div
        contentEditable={false}
        data-synced-ref=""
        data-synced-state={view.status}
        onMouseDown={selectRef}
      >
        {label === undefined ? null : (
          <p data-synced-label className="text-muted-foreground text-xs">
            {label}
          </p>
        )}
        {view.status === "live" && view.node ? (
          <div
            data-synced-preview
            className="pointer-events-none max-w-full min-w-0 overflow-x-auto"
          >
            <SyncedPreview node={view.node} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {view.status === "missing" ? SYNCED_MISSING_PLACEHOLDER : SYNCED_INVALID_PLACEHOLDER}
          </p>
        )}
        {readOnly ? null : (
          <div
            data-synced-toolbar
            className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}
            onMouseDown={(event) => {
              // Selecting the void here replaces these buttons before click fires.
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {view.status === "live" ? (
              <EditorTextButton
                label={SYNCED_GO_LABEL}
                icon={<CornerUpLeft aria-hidden="true" />}
                onMouseDown={keepMediaSelection}
                onClick={() => {
                  if (path) {
                    goToSyncedOriginal(editor, path);
                  }
                }}
              />
            ) : null}
            {view.status === "live" ? (
              <EditorTextButton
                label={SYNCED_CONVERT_LABEL}
                icon={<Copy aria-hidden="true" />}
                onMouseDown={keepMediaSelection}
                onClick={() => {
                  runOnRef((refPath) => {
                    convertSyncedRefAt(editor, refPath);
                  });
                }}
              />
            ) : null}
            <EditorTextButton
              variant="destructive"
              label={SYNCED_REMOVE_LABEL}
              icon={<Trash2 aria-hidden="true" />}
              onMouseDown={keepMediaSelection}
              onClick={() => {
                runOnRef((refPath) => {
                  removeSyncedRefAt(editor, refPath);
                });
              }}
            />
          </div>
        )}
      </div>
    </PlateElement>
  );
}
