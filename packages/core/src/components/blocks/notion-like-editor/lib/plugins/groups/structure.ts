import {
  KEYS,
  PathApi,
  combineTransformMatchOptions,
  createSlatePlugin,
  type SlateEditor,
} from "platejs";
import { openEquationEditor } from "../../features/editor-equation";
import { SYNCED_REF_KEY, goToSyncedOriginal } from "../../features/editor-synced-block";
import { BOOKMARK_KEY } from "../../features/editor-bookmark-url";
import { AUDIO_KEY } from "../../features/editor-audio";
import { EMBED_KEY } from "../../features/editor-embed";
import { FILE_KEY } from "../../features/editor-file";
import { IMAGE_KEY } from "../../features/editor-image";
import { VIDEO_KEY } from "../../features/editor-video";
import { PAGE_LINK_KEY } from "../../features/editor-page-link";
import {
  allowedChildTypes,
  allowsFirstChild,
  containerContentType,
  elementAllowsMarks,
  allowedElementAttrs,
  isAllowedElementAttrValue,
  repairAttrKeys,
  reportsContainer,
  firstChildForbiddenAttrs,
  firstChildType,
  firstChildTypes,
  isVoidElementType,
  maxNesting,
  unsatisfiedDependentAttrs,
} from "../../document/editor-document-schema";
import { normalizeTableNode } from "../../features/editor-table";
import { isElementRecord, isPropsRecord } from "./shared";

function sameTypeDepth(editor: SlateEditor, type: string, path: number[]): number {
  let depth = 1;
  let parentPath = path.slice(0, -1);
  while (parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    if (parent && isElementRecord(parent[0]) && parent[0].type === type) {
      depth += 1;
    }

    parentPath = parentPath.slice(0, -1);
  }

  return depth;
}

function normalizeContainerShape(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  const limit = maxNesting(node.type);
  if (limit !== undefined && sameTypeDepth(editor, node.type, path) > limit) {
    editor.tf.unwrapNodes({
      at: path,
      match: (_candidate, candidatePath) => PathApi.equals(candidatePath, path),
    });
    return true;
  }

  const labels = firstChildTypes(node.type);
  const expected = firstChildType(node.type);
  if (labels === undefined || expected === undefined || !Array.isArray(node.children)) {
    return false;
  }

  const first = node.children[0];
  const childPath = path.concat(0);
  if (!isElementRecord(first) || !allowsFirstChild(node.type, first.type)) {
    editor.tf.insertNodes({ type: expected, children: [{ text: "" }] }, { at: childPath });
    return true;
  }

  const drop = firstChildForbiddenAttrs(node.type).filter((key) => key in first);
  if (drop.length === 0) {
    return false;
  }

  editor.tf.unsetNodes(drop, { at: childPath });
  return true;
}

function normalizeDisallowedChild(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  const childTypes = allowedChildTypes(node.type);
  if (childTypes === undefined || !Array.isArray(node.children)) {
    return false;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (!isElementRecord(child) || childTypes.some((type) => type === child.type)) {
      continue;
    }

    if (index === 0 && allowsFirstChild(node.type, child.type)) {
      continue;
    }

    const childPath = path.concat(index);
    // Columns are top-level only. A group inside a toggle, quote, callout, table
    // cell, or column is moved out whole. Unwrapping it would dump its columns
    // into the container.
    if (child.type === KEYS.columnGroup) {
      if (
        (node.type === KEYS.td || node.type === KEYS.th) &&
        moveMediaAfterTable(editor, path, childPath)
      ) {
        return true;
      }

      const containerPath = node.type === KEYS.column ? path.slice(0, -1) : path;
      const destination = PathApi.next(containerPath);
      if (!destination) {
        return false;
      }

      editor.tf.withoutNormalizing(() => {
        editor.tf.moveNodes({ at: childPath, to: destination });
        const container = editor.api.node(path);
        const remaining =
          container && isElementRecord(container[0]) && Array.isArray(container[0].children)
            ? container[0].children
            : [];
        if (remaining.length === 0) {
          editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: path.concat(0) });
        }
      });
      return true;
    }

    // A table cell only stores paragraphs. Lifting a void one level would
    // leave it inside the row, so move it to after the table and keep the cell.
    if (
      (child.type === BOOKMARK_KEY ||
        child.type === IMAGE_KEY ||
        child.type === FILE_KEY ||
        child.type === VIDEO_KEY ||
        child.type === AUDIO_KEY ||
        child.type === EMBED_KEY ||
        child.type === PAGE_LINK_KEY ||
        child.type === KEYS.toc ||
        child.type === KEYS.equation ||
        child.type === SYNCED_REF_KEY) &&
      (node.type === KEYS.td || node.type === KEYS.th)
    ) {
      if (moveMediaAfterTable(editor, path, childPath)) {
        return true;
      }
    }

    if (isVoidElementType(child.type)) {
      editor.tf.liftNodes({ at: childPath, voids: true });
      return true;
    }

    if (allowedChildTypes(child.type) !== undefined) {
      // Match this path only. A type match would also unwrap the parent quote.
      editor.tf.unwrapNodes({
        at: childPath,
        match: (_candidate, candidatePath) => PathApi.equals(candidatePath, childPath),
      });
      return true;
    }

    const target = containerContentType(node.type);
    if (target === undefined) {
      return false;
    }

    const allowed = allowedElementAttrs(target);
    const drop = Object.keys(child).filter(
      (key) => key !== "type" && key !== "children" && allowed?.has(key) !== true,
    );
    editor.tf.withoutNormalizing(() => {
      // The parent runs before the child's own pass, so marks leave with the retype.
      if (!elementAllowsMarks(child.type)) {
        stripTextMarks(editor, child.children, childPath);
      }
      editor.tf.setNodes({ type: target }, { at: childPath });
      if (drop.length > 0) {
        editor.tf.unsetNodes(drop, { at: childPath });
      }
    });
    return true;
  }

  return false;
}

function textMarkKeys(node: unknown): string[] {
  if (typeof node !== "object" || node === null || !("text" in node)) {
    return [];
  }

  if (typeof node.text !== "string" || "children" in node) {
    return [];
  }

  return Object.keys(node).filter((key) => key !== "text");
}

function stripTextMarks(editor: SlateEditor, children: unknown, path: number[]): void {
  if (!Array.isArray(children)) {
    return;
  }

  for (let index = 0; index < children.length; index += 1) {
    const keys = textMarkKeys(children[index]);
    if (keys.length > 0) {
      editor.tf.unsetNodes(keys, { at: path.concat(index) });
    }
  }
}

function normalizeDisallowedMarks(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  if (elementAllowsMarks(node.type) || !Array.isArray(node.children)) {
    return false;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const keys = textMarkKeys(node.children[index]);
    if (keys.length === 0) {
      continue;
    }

    editor.tf.unsetNodes(keys, { at: path.concat(index) });
    return true;
  }

  return false;
}

function normalizeRepairAttrs(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  const drop = repairAttrKeys(node.type).filter(
    (key) => key in node && !isAllowedElementAttrValue(node.type, key, node[key]),
  );
  if (drop.length === 0) {
    return false;
  }

  editor.tf.unsetNodes(drop, { at: path });
  return true;
}

export const childTypesPlugin = createSlatePlugin({
  key: "childTypes",
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry) {
      const [node, path] = entry;
      if (
        isElementRecord(node) &&
        (normalizeRepairAttrs(editor, node, path) ||
          normalizeDisallowedMarks(editor, node, path) ||
          normalizeContainerShape(editor, node, path) ||
          normalizeDisallowedChild(editor, node, path) ||
          normalizeTableNode(editor, node, path))
      ) {
        return;
      }

      normalizeNode(entry);
    },
  },
}));

// Targets are list paragraphs. Plain paragraphs, headings and quotes take the indent
// through blockIndentPlugin. The indent normalizer unsets indent on any other type, so
// the same types stay targets here. Only list paragraphs get Plate's margin, through query.
// offset 0 keeps the paragraph from adding a second margin; the ul padding is the visible step.

export const dependentAttrsPlugin = createSlatePlugin({
  key: "dependentAttrs",
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry) {
      const [node, path] = entry;
      if (isElementRecord(node)) {
        const unsatisfied = unsatisfiedDependentAttrs(node.type, node);
        if (unsatisfied.length > 0) {
          editor.tf.unsetNodes(unsatisfied, { at: path });
          return;
        }
      }

      normalizeNode(entry);
    },
  },
}));

// IndentPlugin's Tab indents every paragraph. Outside a list, Tab must leave the editor.
// At the depth cap, Tab is handled and changes nothing.

function listBreakAbove(source: object): {
  attrs: {
    listStyleType?: string;
    indent?: number;
    listRestart?: number;
    listRestartPolite?: number;
    checked?: boolean;
  };
  unset: string[];
} {
  const attrs: {
    listStyleType?: string;
    indent?: number;
    listRestart?: number;
    listRestartPolite?: number;
    checked?: boolean;
  } = {};
  const unset: string[] = [];
  if (
    !("listStyleType" in source) ||
    typeof source.listStyleType !== "string" ||
    !("indent" in source) ||
    typeof source.indent !== "number"
  ) {
    return { attrs, unset };
  }

  attrs.listStyleType = source.listStyleType;
  attrs.indent = source.indent;
  // The new first item is a fresh todo. Plate writes checked: false for that, and the
  // original item keeps the checked value it already has.
  if (source.listStyleType === KEYS.listTodo) {
    attrs.checked = false;
  }
  if ("listRestart" in source && typeof source.listRestart === "number") {
    attrs.listRestart = source.listRestart;
    unset.push(KEYS.listRestart);
  }
  if ("listRestartPolite" in source && typeof source.listRestartPolite === "number") {
    attrs.listRestartPolite = source.listRestartPolite;
    unset.push(KEYS.listRestartPolite);
  }

  return { attrs, unset };
}

function voidEntry(editor: SlateEditor): { path: number[] } | undefined {
  const selection = editor.selection;
  if (!selection || !editor.api.isCollapsed()) {
    return undefined;
  }

  const entry = editor.api.above({
    match: (node) => isElementRecord(node) && isVoidElementType(node.type),
    voids: true,
  });
  if (!entry) {
    return undefined;
  }

  return { path: entry[1] };
}

function blockString(node: unknown): string {
  if (!isElementRecord(node) || !Array.isArray(node.children)) {
    return "";
  }

  let text = "";
  for (const child of node.children) {
    if (
      typeof child === "object" &&
      child !== null &&
      "text" in child &&
      typeof child.text === "string" &&
      !("children" in child)
    ) {
      text += child.text;
    }
  }

  return text;
}

// Slate's deleteText removes a void when the caret is inside it (slate dist/index.js
// 4540-4566). The caret after that removal is not the end of the previous block, so
// this places it. Backspace at the start of the next block would otherwise skip the
// void (Editor.before, voids false) and merge the neighbors.

function removeVoid(editor: SlateEditor, path: number[]): void {
  const previous = PathApi.hasPrevious(path) ? PathApi.previous(path) : undefined;
  editor.tf.removeNodes({ at: path, voids: true });
  if (previous) {
    const end = editor.api.end(previous);
    if (end) {
      editor.tf.select(end);
    }
    return;
  }

  const start = editor.api.start(path);
  if (start) {
    editor.tf.select(start);
  }
}

function selectVoidNeighbor(editor: SlateEditor, reverse: boolean): boolean {
  const selection = editor.selection;
  const block = selection ? editor.api.block() : undefined;
  if (
    !block ||
    !isElementRecord(block[0]) ||
    isVoidElementType(block[0].type) ||
    !editor.api.isCollapsed() ||
    !editor.api.isAt(reverse ? { start: true } : { end: true })
  ) {
    return false;
  }

  const neighborPath = reverse ? PathApi.previous(block[1]) : PathApi.next(block[1]);
  if (!neighborPath) {
    return false;
  }

  const neighbor = editor.api.node(neighborPath);
  if (!neighbor || !isElementRecord(neighbor[0]) || !isVoidElementType(neighbor[0].type)) {
    return false;
  }

  // An empty block after a void is removed and the void becomes selected.
  // Delete in front of a void keeps the block, empty or not.
  if (reverse && blockString(block[0]).length === 0) {
    const voidPath = neighborPath;
    editor.tf.removeNodes({ at: block[1] });
    editor.tf.select(voidPath);
    return true;
  }

  editor.tf.select(neighborPath);
  return true;
}

// Chrome's keydown calls deleteBackward("block") on a selected void (slate-react
// dist/index.js 4332-4343). beforeinput deleteContentBackward calls deleteBackward()
// with the default character unit (3539-3541). Both remove only the void.

export const voidKeyboardPlugin = createSlatePlugin({
  key: "voidKeyboard",
}).overrideEditor(({ editor, tf: { deleteBackward, deleteForward } }) => ({
  transforms: {
    deleteBackward(unit) {
      const selected = voidEntry(editor);
      if (selected) {
        removeVoid(editor, selected.path);
        return;
      }

      if (selectVoidNeighbor(editor, true)) {
        return;
      }

      deleteBackward(unit);
    },
    deleteForward(unit) {
      const selected = voidEntry(editor);
      if (selected) {
        removeVoid(editor, selected.path);
        return;
      }

      if (selectVoidNeighbor(editor, false)) {
        return;
      }

      deleteForward(unit);
    },
  },
}));

function voidAcceptsProps(type: string, props: Record<string, unknown>): boolean {
  const allowed = allowedElementAttrs(type);
  return Object.keys(props).every((key) => key !== "type" && allowed?.has(key) === true);
}

// combineTransformMatchOptions (@platejs/slate dist/index.js:472) keeps the caller's
// match. An object is tested key-by-key (index.js:409 and getMatch at 435). A function
// is called as given. A missing match stays the node at a path, or any block.

export const voidPropsPlugin = createSlatePlugin({
  key: "voidProps",
}).overrideEditor(({ editor, tf: { setNodes } }) => ({
  transforms: {
    setNodes(props, options) {
      if (!isPropsRecord(props)) {
        setNodes(props, options);
        return;
      }

      setNodes(props, {
        ...options,
        match: combineTransformMatchOptions(
          editor,
          (node) => {
            if (!isElementRecord(node) || !isVoidElementType(node.type)) {
              return true;
            }

            return voidAcceptsProps(node.type, props);
          },
          options,
        ),
      });
    },
  },
}));

// Plate's split at offset 0 leaves the original id on the empty first half and gives the block a new id.
// A non-empty block keeps its identity and an empty block is inserted above. Registered last so this
// runs before heading splitReset. Slate's isEmpty is false for a void, so Enter on a divider would
// insert above it. A void gets an empty paragraph after it instead.

export const breakAbovePlugin = createSlatePlugin({
  key: "breakAbove",
}).overrideEditor(({ editor, tf: { insertBreak } }) => ({
  transforms: {
    insertBreak() {
      const selection = editor.selection;
      const block = selection ? editor.api.block() : undefined;
      if (
        block &&
        isElementRecord(block[0]) &&
        block[0].type === KEYS.equation &&
        editor.api.isCollapsed()
      ) {
        const id = block[0].id;
        if (typeof id === "string" && id.length > 0) {
          openEquationEditor(editor, id);
        }
        return;
      }

      if (
        block &&
        isElementRecord(block[0]) &&
        block[0].type === SYNCED_REF_KEY &&
        editor.api.isCollapsed()
      ) {
        if (editor.dom.readOnly !== true) {
          goToSyncedOriginal(editor);
        }
        return;
      }

      if (
        block &&
        isElementRecord(block[0]) &&
        isVoidElementType(block[0].type) &&
        editor.api.isCollapsed()
      ) {
        const at = PathApi.next(block[1]);
        if (!at) {
          return;
        }

        editor.tf.insertNodes(editor.api.create.block(), { at, select: true });
        return;
      }

      // A code line reports its container. Enter stays a code break, including at offset 0.
      if (block && isElementRecord(block[0]) && reportsContainer(block[0].type)) {
        insertBreak();
        return;
      }

      if (
        block &&
        editor.api.isCollapsed() &&
        editor.api.isAt({ start: true }) &&
        !editor.api.isEmpty(selection, { block: true })
      ) {
        const above = editor.api.create.block();
        const copied = listBreakAbove(block[0]);
        Object.assign(above, copied.attrs);
        const sourcePath = block[1];
        // A container label (firstChildTypes) breaks above the container, not inside it.
        const parentPath = sourcePath.slice(0, -1);
        const parent = parentPath.length > 0 ? editor.api.node(parentPath) : undefined;
        const aboveContainer =
          parent !== undefined &&
          isElementRecord(parent[0]) &&
          firstChildType(parent[0].type) !== undefined &&
          sourcePath[sourcePath.length - 1] === 0;
        editor.tf.insertNodes(above, {
          at: aboveContainer ? parentPath : sourcePath,
          select: false,
        });
        const moved = PathApi.next(sourcePath);
        if (copied.unset.length > 0 && moved) {
          editor.tf.unsetNodes(copied.unset, { at: moved });
        }
        return;
      }

      insertBreak();
    },
  },
}));

// Shift+Enter follows Enter: a soft break would hide a newline inside one code_line.
// Tab is Plate's code tab (2 spaces). This plugin is registered after listKeyboard, so
// Tab inside code returns before the list handler, and Tab outside still reaches it.

function moveMediaAfterTable(
  editor: SlateEditor,
  cellPath: number[],
  childPath: number[],
): boolean {
  const tablePath = cellPath.slice(0, -2);
  if (tablePath.length !== cellPath.length - 2) {
    return false;
  }

  const table = editor.api.node(tablePath);
  if (!table || !isElementRecord(table[0]) || table[0].type !== KEYS.table) {
    return false;
  }

  const destination = PathApi.next(tablePath);
  if (!destination) {
    return false;
  }

  editor.tf.withoutNormalizing(() => {
    editor.tf.moveNodes({ at: childPath, to: destination, voids: true });
    const cell = editor.api.node(cellPath);
    const children =
      cell && isElementRecord(cell[0]) && Array.isArray(cell[0].children) ? cell[0].children : [];
    if (children.length === 0) {
      editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: cellPath.concat(0) });
    }
  });
  return true;
}
