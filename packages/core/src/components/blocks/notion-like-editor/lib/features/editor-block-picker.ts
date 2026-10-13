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
  description: string;
  keywords: readonly string[];
  icon: LucideIcon;
  group: BlockPickerGroup;
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

const DETAILS: Record<BlockPickerId, { description: string; keywords: readonly string[] }> = {
  paragraph: { description: "Plain text", keywords: [] },
  h1: { description: "Big section heading", keywords: ["h1"] },
  h2: { description: "Medium section heading", keywords: ["h2"] },
  h3: { description: "Small section heading", keywords: ["h3"] },
  bulleted: { description: "Simple bulleted list", keywords: ["ul"] },
  numbered: { description: "Ordered list of items", keywords: ["ol"] },
  todo: { description: "Track tasks with a to-do list", keywords: ["checkbox", "task", "todo"] },
  toggle: { description: "Hide content in a toggle", keywords: ["collapse"] },
  "toggle-h1": { description: "Collapsible big heading", keywords: ["h1"] },
  "toggle-h2": { description: "Collapsible medium heading", keywords: ["h2"] },
  "toggle-h3": { description: "Collapsible small heading", keywords: ["h3"] },
  quote: { description: "Capture a quote", keywords: ["blockquote"] },
  callout: { description: "Call out a short note", keywords: ["note"] },
  code: { description: "Write a code snippet", keywords: ["snippet"] },
  divider: { description: "Visually divide blocks", keywords: ["hr", "line"] },
  equation: { description: "Block of math", keywords: ["math", "latex"] },
  toc: { description: "List the headings", keywords: ["toc"] },
  table: { description: "Grid of cells", keywords: ["grid"] },
  columns: { description: "Side by side columns", keywords: [] },
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
};

// The Add order is the picker order; groups come from GROUPS.
const ADD_DEFINITIONS: readonly AddDefinition[] = [
  {
    id: "paragraph",
    label: "Text",
    kind: "paragraph",
    childType: KEYS.p,
    asList: false,
  },
  {
    id: "h1",
    label: "Heading 1",
    kind: "h1",
    childType: KEYS.h1,
    asList: false,
  },
  {
    id: "h2",
    label: "Heading 2",
    kind: "h2",
    childType: KEYS.h2,
    asList: false,
  },
  {
    id: "h3",
    label: "Heading 3",
    kind: "h3",
    childType: KEYS.h3,
    asList: false,
  },
  {
    id: "bulleted",
    label: "Bulleted list",
    kind: "bulleted",
    childType: KEYS.p,
    asList: true,
  },
  {
    id: "numbered",
    label: "Numbered list",
    kind: "numbered",
    childType: KEYS.p,
    asList: true,
  },
  {
    id: "todo",
    label: "To-do list",
    kind: "todo",
    childType: KEYS.p,
    asList: true,
  },
  {
    id: "toggle",
    label: "Toggle",
    kind: "toggle",
    childType: KEYS.toggle,
    asList: false,
  },
  {
    id: "toggle-h1",
    label: "Toggle heading 1",
    kind: "toggle-h1",
    childType: KEYS.toggle,
    asList: false,
  },
  {
    id: "toggle-h2",
    label: "Toggle heading 2",
    kind: "toggle-h2",
    childType: KEYS.toggle,
    asList: false,
  },
  {
    id: "toggle-h3",
    label: "Toggle heading 3",
    kind: "toggle-h3",
    childType: KEYS.toggle,
    asList: false,
  },
  {
    id: "quote",
    label: "Quote",
    kind: "quote",
    childType: KEYS.blockquote,
    asList: false,
  },
  {
    id: "callout",
    label: "Callout",
    kind: "callout",
    childType: KEYS.callout,
    asList: false,
  },
  {
    id: "code",
    label: "Code",
    kind: "code",
    childType: KEYS.codeBlock,
    asList: false,
  },
  {
    id: "divider",
    label: "Divider",
    structural: "divider",
    childType: KEYS.hr,
    asList: false,
  },
  {
    id: "equation",
    label: "Equation",
    structural: "equation",
    childType: KEYS.equation,
    asList: false,
  },
  {
    id: "toc",
    label: "Table of contents",
    structural: "toc",
    childType: KEYS.toc,
    asList: false,
  },
  {
    id: "table",
    label: "Table",
    structural: "table",
    childType: KEYS.table,
    asList: false,
  },
  {
    id: "columns",
    label: "Columns",
    structural: "columns",
    childType: KEYS.columnGroup,
    asList: false,
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

function parentTypeAt(editor: SlateEditor, path: readonly number[]): string | null | undefined {
  const parentPath = path.slice(0, -1);
  if (parentPath.length === 0) {
    return null;
  }
  const parent = editor.api.node(parentPath);
  const node = parent?.[0];
  if (!parent || !ElementApi.isElement(node) || typeof node.type !== "string") {
    return undefined;
  }
  return node.type;
}

function pickerItems(
  editor: SlateEditor,
  path: readonly number[],
  toIndex: number,
): BlockPickerItem[] {
  const parentType = parentTypeAt(editor, path);
  if (parentType === undefined) {
    return [];
  }
  return ADD_DEFINITIONS.map((definition) => {
    const reason = blockPlacementRefusal(
      parentType,
      toIndex,
      definition.childType,
      definition.asList,
    );
    const details = DETAILS[definition.id];
    return {
      id: definition.id,
      label: definition.label,
      description: details.description,
      keywords: details.keywords,
      icon: ICONS[definition.id],
      group: GROUPS[definition.id],
      kind: definition.kind,
      structural: definition.structural,
      disabled: reason !== undefined,
      reason,
    };
  });
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
  return pickerItems(editor, path, placement.toIndex);
}

// The same list, checked at a specific sibling index. The slash menu uses the
// paragraph's own index when a block would replace it, and index + 1 otherwise.
export function blockPickerItemsAt(
  editor: SlateEditor,
  path: readonly number[],
  toIndex: number,
): BlockPickerItem[] {
  if (path.length === 0) {
    return [];
  }
  return pickerItems(editor, path, toIndex);
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
    const details = DETAILS[turn.kind];
    return {
      id: turn.kind,
      label: turn.label,
      description: details.description,
      keywords: details.keywords,
      icon: ICONS[turn.kind],
      group: GROUPS[turn.kind],
      kind: turn.kind,
      disabled: decision === undefined || !decision.allowed,
      reason: decision?.allowed === false ? decision.reason : undefined,
      checked: turn.kind === current,
    };
  });
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
  options?: { batch?: boolean },
): string | null {
  const at = PathApi.next([...path]);
  if (!at) {
    return null;
  }
  const insert = (): void => {
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
  };
  if (options?.batch === false) {
    insert();
  } else {
    editor.tf.withNewBatch(insert);
  }
  return idAt(editor, at);
}

function selectTableStart(editor: SlateEditor, tablePath: number[]): void {
  const start = editor.api.start(tablePath.concat([0, 0]));
  if (start) {
    editor.tf.select(start);
  }
}
