import { unwrapCodeBlock } from "@platejs/code-block";
import {
  ElementApi,
  KEYS,
  NodeApi,
  PathApi,
  nanoid,
  type SlateEditor,
  type TElement,
} from "platejs";
import { applyBlockTurn, type BlockMenuKind } from "../features/editor-block-menu";
import { openAncestorToggle } from "../plugins/editor-toggle";
import {
  CALLOUT_ICONS,
  CALLOUT_TONES,
  CODE_LANGS,
  allowedChildTypes,
  allowsFirstChild,
  isAllowedValue,
  reportedFirstChild,
  reportedFirstChildNames,
  reportsContainer,
  reportsParentFromFirstChild,
  type CodeLang,
} from "../document/editor-document-schema";
import type { EditorCommand } from "./editor-command-runner";

export const BULLETED_LIST_TYPE = "bulleted-list";
export const NUMBERED_LIST_TYPE = "numbered-list";
export const TODO_LIST_TYPE = "todo-list";
const LIST_BLOCK_TYPE = {
  disc: BULLETED_LIST_TYPE,
  decimal: NUMBERED_LIST_TYPE,
  todo: TODO_LIST_TYPE,
} as const;
function isReportedListStyle(style: string): style is keyof typeof LIST_BLOCK_TYPE {
  return Object.hasOwn(LIST_BLOCK_TYPE, style);
}
function reportedBlockType(node: TElement): string {
  const style = node.listStyleType;
  if (node.type === KEYS.p && typeof style === "string" && isReportedListStyle(style)) {
    return LIST_BLOCK_TYPE[style];
  }

  return node.type;
}
// A plain paragraph whose parent lists that paragraph in childTypes reports the parent.
// A list item keeps its list type. Lowest blocks only, so the container is not visited too.
export function containerParentType(
  editor: SlateEditor,
  node: { type: string; listStyleType?: unknown },
  path: number[],
): string | undefined {
  if (node.type !== KEYS.p || typeof node.listStyleType === "string") {
    return undefined;
  }

  const parent = editor.api.parent(path);
  if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
    return undefined;
  }

  const childTypes = allowedChildTypes(parent[0].type);
  if (childTypes === undefined || !childTypes.some((type) => type === node.type)) {
    return undefined;
  }

  return parent[0].type;
}
function reportedLabelBlockType(
  editor: SlateEditor,
  node: TElement,
  path: number[],
): string | undefined {
  if (path[path.length - 1] !== 0 || typeof node.type !== "string") {
    return undefined;
  }

  const parent = editor.api.parent(path);
  if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
    return undefined;
  }

  return reportedFirstChild(parent[0].type, node.type);
}
function blockTypeOf(editor: SlateEditor, node: TElement, path: number[]): string {
  const labelReport = reportedLabelBlockType(editor, node, path);
  if (labelReport !== undefined) {
    return labelReport;
  }

  if (reportsContainer(node.type)) {
    const parent = editor.api.parent(path);
    if (parent && ElementApi.isElement(parent[0]) && typeof parent[0].type === "string") {
      const childTypes = allowedChildTypes(parent[0].type);
      if (childTypes !== undefined && childTypes.some((type) => type === node.type)) {
        return parent[0].type;
      }
    }
  }

  const reported = reportedBlockType(node);
  if (reported !== node.type || node.type !== KEYS.p) {
    return reported;
  }

  const parentType = containerParentType(editor, node, path);
  if (parentType === undefined) {
    return reported;
  }

  // Quote and callout report the container for every plain paragraph.
  // reportParent "first" reports it only for the label, so content keeps its own type.
  if (reportsParentFromFirstChild(parentType) && path[path.length - 1] !== 0) {
    return reported;
  }

  // A plain paragraph in a cell reports the table. A list item already returned its list type.
  if (parentType === KEYS.td || parentType === KEYS.th) {
    return KEYS.table;
  }

  return parentType;
}
export function getBlockType(editor: SlateEditor): string | "mixed" | null {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }

  let type: string | undefined;
  for (const [node, path] of editor.api.nodes({
    at: selection,
    mode: "lowest",
    match: (candidate) => editor.api.isBlock(candidate),
  })) {
    if (!ElementApi.isElement(node) || typeof node.type !== "string") {
      continue;
    }

    const next = blockTypeOf(editor, node, path);
    if (type === undefined) {
      type = next;
      continue;
    }

    if (type !== next) {
      return "mixed";
    }
  }

  return type ?? null;
}
export const HEADING_TYPE = {
  1: KEYS.h1,
  2: KEYS.h2,
  3: KEYS.h3,
} as const;
export type HeadingLevel = keyof typeof HEADING_TYPE;
function lowestBlocks(editor: SlateEditor) {
  const selection = editor.selection;
  if (!selection) {
    return [];
  }

  return [
    ...editor.api.nodes({
      at: selection,
      mode: "lowest",
      match: (node) => editor.api.isBlock(node),
    }),
  ];
}
// A heading is not an allowed child of a quote. Lift it before toggleBlock, or the
// childTypes normalizer turns the new heading back into a paragraph.
function liftWhereChildTypeDisallowed(editor: SlateEditor, targetType: string): void {
  const blocks = lowestBlocks(editor);
  editor.tf.withoutNormalizing(() => {
    for (const [, blockPath] of blocks.reverse()) {
      const parent = editor.api.parent(blockPath);
      if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
        continue;
      }

      const childIndex = blockPath[blockPath.length - 1];
      const childTypes = allowedChildTypes(parent[0].type);
      if (
        (childIndex === 0 && allowsFirstChild(parent[0].type, targetType)) ||
        childTypes === undefined ||
        childTypes.some((type) => type === targetType)
      ) {
        continue;
      }

      editor.tf.liftBlock({ at: blockPath, match: { type: parent[0].type } });
    }
  });
}
// toggleBlock writes only the type. It resets to a paragraph only when a selected
// block is already that type, so one heading becomes another in place. Becoming a heading unsets lineHeight.
export function createTurnIntoHeading(level: HeadingLevel): EditorCommand {
  const type = HEADING_TYPE[level];

  return {
    id: `block.turn-into.h${level}`,
    label: `Heading ${level}`,
    group: "turn-into",
    run: (editor) => {
      const becomesHeading = !editor.api.some({ match: { type } });
      if (becomesHeading) {
        liftWhereChildTypeDisallowed(editor, type);
      }
      editor.tf.toggleBlock(type);
      if (!becomesHeading || !editor.selection) {
        return;
      }

      editor.tf.unsetNodes(KEYS.lineHeight, {
        at: editor.selection,
        match: (node) => ElementApi.isElement(node) && node.type === type,
      });
    },
  };
}
export const turnIntoHeading1 = createTurnIntoHeading(1);
export const turnIntoHeading2 = createTurnIntoHeading(2);
export const turnIntoHeading3 = createTurnIntoHeading(3);
// Outside, toggleBlock wraps the selection in one container and leaves its attrs unset.
// Inside a quote or callout, liftBlock unwraps the selected paragraphs and splits a partial selection.
// A toggle label is structural. Selecting it unwraps the whole toggle. Selecting content moves
// those blocks out after the toggle, so the following block does not become a new label.
function selectionIncludesContainerLabel(editor: SlateEditor, type: string): boolean {
  return lowestBlocks(editor).some(([, blockPath]) => {
    if (blockPath[blockPath.length - 1] !== 0) {
      return false;
    }

    const parent = editor.api.parent(blockPath);
    return parent !== undefined && ElementApi.isElement(parent[0]) && parent[0].type === type;
  });
}
function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((step, index) => path[index] === step);
}
function liftSelectedContent(editor: SlateEditor, type: string): void {
  const above = editor.api.above({ match: { type } });
  if (!above) {
    return;
  }

  const containerPath = above[1];
  const destination = PathApi.next(containerPath);
  if (!destination) {
    return;
  }

  const seen = new Set<string>();
  const childPaths: number[][] = [];
  for (const [, blockPath] of lowestBlocks(editor)) {
    if (!pathStartsWith(blockPath, containerPath) || blockPath.length <= containerPath.length) {
      continue;
    }

    const index = blockPath[containerPath.length];
    if (index === undefined || index === 0) {
      continue;
    }

    const childPath = containerPath.concat(index);
    const key = childPath.join(".");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    childPaths.push(childPath);
  }

  editor.tf.withoutNormalizing(() => {
    for (const childPath of childPaths.reverse()) {
      editor.tf.moveNodes({ at: childPath, to: destination });
    }
  });
}
export function createTurnIntoContainer(
  type: string,
  meta: { id: string; label: string },
  options?: {
    afterWrap?: (editor: SlateEditor) => void;
    unwrapFromFirstChild?: boolean;
    liftContentOut?: boolean;
  },
): EditorCommand {
  return {
    id: meta.id,
    label: meta.label,
    group: "turn-into",
    run: (editor) => {
      if (editor.api.above({ match: { type } })) {
        if (options?.unwrapFromFirstChild && selectionIncludesContainerLabel(editor, type)) {
          const above = editor.api.above({ match: { type } });
          if (!above) {
            return;
          }

          editor.tf.unwrapNodes({
            at: above[1],
            match: (_node, path) => PathApi.equals(path, above[1]),
          });
          return;
        }

        if (options?.liftContentOut) {
          liftSelectedContent(editor, type);
          return;
        }

        const blocks = lowestBlocks(editor);
        editor.tf.withoutNormalizing(() => {
          for (const [, blockPath] of blocks.reverse()) {
            editor.tf.liftBlock({ at: blockPath, match: { type } });
          }
        });
        return;
      }

      editor.tf.toggleBlock(type, { wrap: true });
      options?.afterWrap?.(editor);
    },
  };
}
export const turnIntoBlockquote = createTurnIntoContainer(KEYS.blockquote, {
  id: "block.turn-into.blockquote",
  label: "Quote",
});
export const turnIntoCallout = createTurnIntoContainer(KEYS.callout, {
  id: "block.turn-into.callout",
  label: "Callout",
});
function blockId(node: TElement): string | undefined {
  if (!("id" in node) || typeof node.id !== "string" || node.id.length === 0) {
    return undefined;
  }

  return node.id;
}
function codeLineFromBlock(node: TElement): TElement {
  const line: TElement = {
    type: KEYS.codeLine,
    children: [{ text: NodeApi.string(node) }],
  };
  const id = blockId(node);
  if (id !== undefined) {
    line.id = id;
  }

  return line;
}
// Selected paragraphs become one code block, one line each, marks dropped.
// The same command on a code block unwraps it back into paragraphs.
export const turnIntoCodeBlock: EditorCommand = {
  id: "block.turn-into.code-block",
  label: "Code",
  group: "turn-into",
  run: (editor) => {
    if (!editor.selection) {
      return;
    }

    if (editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } })) {
      unwrapCodeBlock(editor);
      return;
    }

    const blocks: { node: TElement; path: number[] }[] = [];
    for (const [node, path] of lowestBlocks(editor)) {
      if (ElementApi.isElement(node)) {
        blocks.push({ node, path });
      }
    }

    const first = blocks[0];
    if (first === undefined) {
      return;
    }

    const lines = blocks.map((block) => codeLineFromBlock(block.node));
    const codeBlock: TElement = {
      type: editor.getType(KEYS.codeBlock),
      id: nanoid(10),
      children: lines.length > 0 ? lines : [{ type: KEYS.codeLine, children: [{ text: "" }] }],
    };

    editor.tf.withoutNormalizing(() => {
      for (const block of blocks.reverse()) {
        editor.tf.removeNodes({ at: block.path });
      }

      editor.tf.insertNodes(codeBlock, { at: first.path, select: true });
    });
  },
};
export type CodeLanguagePayload = {
  lang: CodeLang | null;
  at?: number[];
};
function codeBlockPath(editor: SlateEditor, at: number[] | undefined): number[] | undefined {
  if (at !== undefined) {
    const entry = editor.api.node(at);
    if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.codeBlock) {
      return undefined;
    }

    return entry[1];
  }

  const above = editor.api.above({ match: { type: KEYS.codeBlock } });
  return above?.[1];
}
export const setCodeLanguage: EditorCommand<CodeLanguagePayload> = {
  id: "format.code-language",
  label: "Code language",
  group: "format",
  run: (editor, payload) => {
    const path = codeBlockPath(editor, payload.at);
    if (path === undefined) {
      return;
    }

    if (payload.lang === null) {
      editor.tf.unsetNodes("lang", { at: path });
      return;
    }

    if (!isAllowedValue(payload.lang, CODE_LANGS)) {
      return;
    }

    editor.tf.setNodes({ lang: payload.lang }, { at: path });
  },
};
// Mod+Enter inside a code block. The list shortcut picks this or the to-do check.
export const exitCodeBlock: EditorCommand = {
  id: "block.exit.code-block",
  label: "Exit code block",
  group: "action",
  run: (editor) => {
    const codeBlock = editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } });
    if (!codeBlock) {
      return;
    }

    const at = PathApi.next(codeBlock[1]);
    if (!at) {
      return;
    }

    editor.tf.insertNodes(editor.api.create.block(), { at, select: true });
  },
};
export const turnIntoToggle = createTurnIntoContainer(
  KEYS.toggle,
  {
    id: "block.turn-into.toggle",
    label: "Toggle list",
  },
  { afterWrap: openAncestorToggle, unwrapFromFirstChild: true, liftContentOut: true },
);
export type CalloutAttrPayload = {
  value: string | null;
  at?: number[];
};
function calloutPath(editor: SlateEditor, at: number[] | undefined): number[] | undefined {
  if (at !== undefined) {
    const entry = editor.api.node(at);
    if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.callout) {
      return undefined;
    }

    return entry[1];
  }

  const above = editor.api.above({ match: { type: KEYS.callout } });
  return above?.[1];
}
function setCalloutAttr(
  editor: SlateEditor,
  key: "icon" | "variant",
  allowed: readonly string[],
  payload: CalloutAttrPayload,
): void {
  const path = calloutPath(editor, payload.at);
  if (!path) {
    return;
  }

  if (payload.value === null) {
    editor.tf.unsetNodes(key, { at: path });
    return;
  }

  if (!isAllowedValue(payload.value, allowed)) {
    return;
  }

  editor.tf.setNodes({ [key]: payload.value }, { at: path });
}
export const setCalloutIcon: EditorCommand<CalloutAttrPayload> = {
  id: "format.callout-icon",
  label: "Callout icon",
  group: "format",
  run: (editor, payload) => {
    setCalloutAttr(editor, "icon", CALLOUT_ICONS, payload);
  },
};
export const setCalloutTone: EditorCommand<CalloutAttrPayload> = {
  id: "format.callout-tone",
  label: "Callout tone",
  group: "format",
  run: (editor, payload) => {
    setCalloutAttr(editor, "variant", CALLOUT_TONES, payload);
  },
};
// One history batch so Reset removes the icon and the tone together.
export function resetCallout(editor: SlateEditor, at?: number[]): void {
  editor.tf.withNewBatch(() => {
    setCalloutIcon.run(editor, { value: null, at });
    setCalloutTone.run(editor, { value: null, at });
  });
  editor.tf.setSplittingOnce(true);
}
export const TURN_INTO_HEADING = {
  1: turnIntoHeading1,
  2: turnIntoHeading2,
  3: turnIntoHeading3,
} as const satisfies Record<HeadingLevel, EditorCommand>;
function isToggleLabelReport(blockType: string): boolean {
  if (blockType === KEYS.toggle) {
    return true;
  }

  return reportedFirstChildNames(KEYS.toggle).some((name) => name === blockType);
}
// One undo: runEditorCommand batches this. A same-level heading label reverts to a
// paragraph before turnIntoToggle can unwrap the container.
export function createTurnIntoToggleHeading(level: HeadingLevel): EditorCommand {
  const heading = TURN_INTO_HEADING[level];
  const target = reportedFirstChild(KEYS.toggle, HEADING_TYPE[level]);

  return {
    id: `block.turn-into.toggle-h${level}`,
    label: `Toggle heading ${level}`,
    group: "turn-into",
    run: (editor) => {
      const current = getBlockType(editor);
      if (target !== undefined && current === target) {
        heading.run(editor);
        return;
      }

      if (current === null || !isToggleLabelReport(current)) {
        turnIntoToggle.run(editor);
      }

      if (target === undefined || getBlockType(editor) === target) {
        return;
      }

      heading.run(editor);
    },
  };
}
export type BlockMenuTurnPayload = {
  path: number[];
  kind: BlockMenuKind;
};
// Selection-scoped, same registry shape as the heading commands. The block menu
// uses turnBlockInto so the handle target changes and the caret does not.
export const turnIntoParagraph: EditorCommand = {
  id: "block.turn-into.paragraph",
  label: "Text",
  group: "turn-into",
  run: (editor) => {
    const entry = editor.api.block();
    if (!entry) {
      return;
    }

    applyBlockTurn(editor, entry[1], "paragraph");
  },
};
export const turnBlockInto: EditorCommand<BlockMenuTurnPayload> = {
  id: "block.menu.turn-into",
  label: "Turn into",
  group: "turn-into",
  run: (editor, payload) => applyBlockTurn(editor, payload.path, payload.kind),
};
