import {
  Code,
  Columns2,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  Sigma,
  Table,
  TextQuote,
  Type,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor } from "platejs";

import { createTableNode } from "./editor-table";
import {
  BLOCK_MENU_TURNS,
  applyBlockTurn,
  blockMenuDecisions,
  blockPlacementRefusal,
  currentBlockMenuKind,
  menuBlockView,
  type BlockMenuKind,
} from "./editor-block-menu";
import { insertColumnsBelow } from "../commands/editor-columns";
import { insertEquationBelow } from "./editor-equation";
import { insertTocBelow } from "./editor-toc";

export type BlockPickerMode = "add" | "turn-into";

export type BlockPickerGroup = "Basic" | "Lists" | "Containers" | "Advanced";

export const BLOCK_PICKER_GROUPS: readonly BlockPickerGroup[] = [
  "Basic",
  "Lists",
  "Containers",
  "Advanced",
];

// Structural inserts have no BlockMenuKind: they are inserted, never a
// conversion. A turn kind is inserted as a paragraph and then turned.
export type BlockPickerId = BlockMenuKind | "divider" | "table" | "columns" | "equation" | "toc";

export type BlockPickerItem = {
  id: BlockPickerId;
  label: string;
  icon: LucideIcon;
  group: BlockPickerGroup;
  keywords: readonly string[];
  kind?: BlockMenuKind;
  structural?: "divider" | "table" | "columns" | "equation" | "toc";
  disabled: boolean;
  reason?: string;
  checked?: boolean;
};

const ICONS: Record<BlockPickerId, LucideIcon> = {
  paragraph: Type,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  bulleted: List,
  numbered: ListOrdered,
  todo: ListTodo,
  toggle: ChevronRight,
  "toggle-h1": Heading1,
  "toggle-h2": Heading2,
  "toggle-h3": Heading3,
  quote: TextQuote,
  callout: Lightbulb,
  code: Code,
  divider: Minus,
  table: Table,
  columns: Columns2,
  equation: Sigma,
  toc: ListTree,
};

const GROUPS: Record<BlockPickerId, BlockPickerGroup> = {
  paragraph: "Basic",
  h1: "Basic",
  h2: "Basic",
  h3: "Basic",
  bulleted: "Lists",
  numbered: "Lists",
  todo: "Lists",
  toggle: "Containers",
  "toggle-h1": "Containers",
  "toggle-h2": "Containers",
  "toggle-h3": "Containers",
  quote: "Containers",
  callout: "Containers",
  code: "Advanced",
  divider: "Advanced",
  table: "Advanced",
  columns: "Advanced",
  equation: "Advanced",
  toc: "Advanced",
};

type AddDefinition = {
  id: BlockPickerId;
  label: string;
  kind?: BlockMenuKind;
  structural?: "divider" | "table" | "columns" | "equation" | "toc";
  childType: string;
  asList: boolean;
  keywords: readonly string[];
};

// The Add order is the picker order; groups come from GROUPS.
const ADD_DEFINITIONS: readonly AddDefinition[] = [
  {
    id: "paragraph",
    label: "Text",
    kind: "paragraph",
    childType: KEYS.p,
    asList: false,
    keywords: ["text", "paragraph", "p", "body"],
  },
  {
    id: "h1",
    label: "Heading 1",
    kind: "h1",
    childType: KEYS.h1,
    asList: false,
    keywords: ["h1", "heading", "title"],
  },
  {
    id: "h2",
    label: "Heading 2",
    kind: "h2",
    childType: KEYS.h2,
    asList: false,
    keywords: ["h2", "heading", "subtitle"],
  },
  {
    id: "h3",
    label: "Heading 3",
    kind: "h3",
    childType: KEYS.h3,
    asList: false,
    keywords: ["h3", "heading"],
  },
  {
    id: "bulleted",
    label: "Bulleted list",
    kind: "bulleted",
    childType: KEYS.p,
    asList: true,
    keywords: ["bullet", "bulleted", "ul", "unordered", "list"],
  },
  {
    id: "numbered",
    label: "Numbered list",
    kind: "numbered",
    childType: KEYS.p,
    asList: true,
    keywords: ["number", "numbered", "ol", "ordered", "list"],
  },
  {
    id: "todo",
    label: "To-do list",
    kind: "todo",
    childType: KEYS.p,
    asList: true,
    keywords: ["todo", "to-do", "check", "task", "checkbox"],
  },
  {
    id: "toggle",
    label: "Toggle",
    kind: "toggle",
    childType: KEYS.toggle,
    asList: false,
    keywords: ["toggle", "collapse", "details", "fold"],
  },
  {
    id: "toggle-h1",
    label: "Toggle heading 1",
    kind: "toggle-h1",
    childType: KEYS.toggle,
    asList: false,
    keywords: ["toggle", "heading", "h1", "collapse"],
  },
  {
    id: "toggle-h2",
    label: "Toggle heading 2",
    kind: "toggle-h2",
    childType: KEYS.toggle,
    asList: false,
    keywords: ["toggle", "heading", "h2", "collapse"],
  },
  {
    id: "toggle-h3",
    label: "Toggle heading 3",
    kind: "toggle-h3",
    childType: KEYS.toggle,
    asList: false,
    keywords: ["toggle", "heading", "h3", "collapse"],
  },
  {
    id: "quote",
    label: "Quote",
    kind: "quote",
    childType: KEYS.blockquote,
    asList: false,
    keywords: ["quote", "blockquote", "citation"],
  },
  {
    id: "callout",
    label: "Callout",
    kind: "callout",
    childType: KEYS.callout,
    asList: false,
    keywords: ["callout", "note", "tip", "info", "warning"],
  },
  {
    id: "code",
    label: "Code",
    kind: "code",
    childType: KEYS.codeBlock,
    asList: false,
    keywords: ["code", "snippet", "pre", "block"],
  },
  {
    id: "divider",
    label: "Divider",
    structural: "divider",
    childType: KEYS.hr,
    asList: false,
    keywords: ["divider", "hr", "line", "separator", "rule"],
  },
  {
    id: "equation",
    label: "Equation",
    structural: "equation",
    childType: KEYS.equation,
    asList: false,
    keywords: ["equation", "math", "formula", "latex", "katex"],
  },
  {
    id: "toc",
    label: "Table of contents",
    structural: "toc",
    childType: KEYS.toc,
    asList: false,
    keywords: ["toc", "table of contents", "outline", "contents"],
  },
  {
    id: "table",
    label: "Table",
    structural: "table",
    childType: KEYS.table,
    asList: false,
    keywords: ["table", "grid", "rows", "columns"],
  },
  {
    id: "columns",
    label: "Columns",
    structural: "columns",
    childType: KEYS.columnGroup,
    asList: false,
    keywords: ["columns", "layout", "grid"],
  },
];

// The item the caret/selection sits in, and the index a picker choice would
// take. Both come from the target path, matching insertParagraphBelow.
export function addPlacement(
  editor: SlateEditor,
  path: readonly number[],
): { parentType: string | null; toIndex: number } | null {
  const index = path[path.length - 1];
  if (index === undefined) {
    return null;
  }
  const parentPath = path.slice(0, -1);
  let parentType: string | null = null;
  if (parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    const node = parent?.[0];
    if (!parent || !ElementApi.isElement(node) || typeof node.type !== "string") {
      return null;
    }
    parentType = node.type;
  }
  return { parentType, toIndex: index + 1 };
}

// Add mode items with the parent's verdict. An item the parent cannot hold is
// disabled with the reason, exactly like the block menu.
export function blockPickerAddItems(
  editor: SlateEditor,
  path: readonly number[],
): BlockPickerItem[] {
  const placement = addPlacement(editor, path);
  if (!placement) {
    return [];
  }
  return ADD_DEFINITIONS.map((definition) => {
    const reason = blockPlacementRefusal(
      placement.parentType,
      placement.toIndex,
      definition.childType,
      definition.asList,
    );
    return {
      id: definition.id,
      label: definition.label,
      icon: ICONS[definition.id],
      group: GROUPS[definition.id],
      keywords: definition.keywords,
      kind: definition.kind,
      structural: definition.structural,
      disabled: reason !== undefined,
      reason,
    };
  });
}

// Turn-into mode items come from the existing conversion matrix, so its
// allowed/refused rules are not duplicated. Non-conversions are not listed.
export function blockPickerTurnItems(
  editor: SlateEditor,
  path: readonly number[],
): BlockPickerItem[] {
  const view = menuBlockView(editor, [...path]);
  if (!view) {
    return [];
  }
  const decisions = blockMenuDecisions(view) ?? [];
  const current = currentBlockMenuKind(view);
  const byKind = new Map(decisions.map((decision) => [decision.kind, decision]));
  return BLOCK_MENU_TURNS.map((turn) => {
    const decision = byKind.get(turn.kind);
    return {
      id: turn.kind,
      label: turn.label,
      icon: ICONS[turn.kind],
      group: GROUPS[turn.kind],
      keywords: ADD_DEFINITIONS.find((entry) => entry.id === turn.kind)?.keywords ?? [],
      kind: turn.kind,
      disabled: decision === undefined || !decision.allowed,
      reason: decision?.allowed === false ? decision.reason : undefined,
      checked: turn.kind === current,
    };
  });
}

export function blockPickerItems(
  editor: SlateEditor,
  path: readonly number[],
  mode: BlockPickerMode,
): BlockPickerItem[] {
  return mode === "add" ? blockPickerAddItems(editor, path) : blockPickerTurnItems(editor, path);
}

function idAt(editor: SlateEditor, path: readonly number[]): string | null {
  const node = editor.api.node([...path]);
  const candidate = node?.[0];
  if (candidate && ElementApi.isElement(candidate) && typeof candidate.id === "string") {
    return candidate.id;
  }
  return null;
}

// Insert one picked block as the next sibling of the target, inside the same
// container. Turn kinds reuse applyBlockTurn; structural kinds reuse the
// feature insert helpers. One new batch keeps a single undo step.
export function insertPickedBlock(
  editor: SlateEditor,
  path: readonly number[],
  item: BlockPickerItem,
): string | null {
  const at = PathApi.next([...path]);
  if (!at) {
    return null;
  }
  editor.tf.withNewBatch(() => {
    if (item.kind !== undefined && item.kind !== "paragraph") {
      editor.tf.insertNodes({ type: KEYS.p, id: nanoid(10), children: [{ text: "" }] }, { at });
      const start = editor.api.start(at);
      if (start) {
        editor.tf.select(start);
      }
      applyBlockTurn(editor, at, item.kind);
      return;
    }
    if (item.kind === "paragraph") {
      editor.tf.insertNodes(
        { type: KEYS.p, id: nanoid(10), children: [{ text: "" }] },
        { at, select: true },
      );
      return;
    }
    switch (item.structural) {
      case "divider":
        editor.tf.insertNodes(
          { type: KEYS.hr, id: nanoid(10), children: [{ text: "" }] },
          { at, select: true },
        );
        break;
      case "equation":
        insertEquationBelow(editor, path);
        break;
      case "toc":
        insertTocBelow(editor, path);
        break;
      case "table":
        editor.tf.insertNodes(createTableNode(3, 3), { at, select: false });
        selectTableStart(editor, at);
        break;
      case "columns":
        insertColumnsBelow(editor, path, 2);
        break;
      default:
        break;
    }
  });
  return idAt(editor, at);
}

function selectTableStart(editor: SlateEditor, tablePath: number[]): void {
  const start = editor.api.start(tablePath.concat([0, 0]));
  if (start) {
    editor.tf.select(start);
  }
}
