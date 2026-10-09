import { BaseMentionPlugin } from "@platejs/mention";
import { ElementApi, KEYS, createSlatePlugin, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "./editor-commands";
import { selectionInCodeBlock } from "./editor-code";
import {
  MENTION_ENTITY_TYPE,
  allocateMentionId,
  isStoredMentionEntityId,
  mentionInputPlainText,
  sanitizeMentionLabel,
  type MentionEntity,
  type MentionProvider,
} from "./editor-mention-node";

export const MENTION_SEARCH_DEBOUNCE_MS = 150;
export const MENTION_EMPTY_LABEL = "No people found";
export const MENTION_ERROR_LABEL = "Couldn't load people";
export const MENTION_LOADING_LABEL = "Loading…";
export const MENTION_UNKNOWN_LABEL = "Unknown person";

export type { MentionEntity, MentionProvider };

export type MentionSearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

type MentionSearchClock = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

type MentionSearchSession = {
  generation: number;
  timer: unknown;
  controller: AbortController | null;
};

type MentionInputKey = {
  key: string;
  preventDefault: () => void;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
};

const providers = new WeakMap<SlateEditor, MentionProvider>();
const clocks = new WeakMap<SlateEditor, MentionSearchClock>();
const sessions = new WeakMap<SlateEditor, MentionSearchSession>();
const inputComposing = new WeakMap<SlateEditor, boolean>();
const committing = new WeakSet<SlateEditor>();

const browserHandles = new Map<number, ReturnType<typeof setTimeout>>();
let browserHandleId = 1;

const browserClock: MentionSearchClock = {
  setTimeout: (callback, delayMs) => {
    const id = browserHandleId;
    browserHandleId += 1;
    browserHandles.set(id, setTimeout(callback, delayMs));
    return id;
  },
  clearTimeout: (id) => {
    if (typeof id !== "number") {
      return;
    }

    const handle = browserHandles.get(id);
    if (handle === undefined) {
      return;
    }

    clearTimeout(handle);
    browserHandles.delete(id);
  },
};

function mentionUiOptions(): {
  query: string;
  status: MentionSearchStatus;
  results: MentionEntity[];
  activeIndex: number;
} {
  return {
    query: "",
    status: "idle",
    results: [],
    activeIndex: 0,
  };
}

export const mentionUiPlugin = createSlatePlugin({
  key: "mentionUi",
  options: mentionUiOptions(),
});

function sessionFor(editor: SlateEditor): MentionSearchSession {
  const existing = sessions.get(editor);
  if (existing !== undefined) {
    return existing;
  }

  const created: MentionSearchSession = { generation: 0, timer: undefined, controller: null };
  sessions.set(editor, created);
  return created;
}

function clockFor(editor: SlateEditor): MentionSearchClock {
  return clocks.get(editor) ?? browserClock;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

function resetMentionUi(editor: SlateEditor): void {
  const session = sessionFor(editor);
  session.generation += 1;
  if (session.controller !== null) {
    session.controller.abort();
    session.controller = null;
  }

  if (session.timer !== undefined) {
    clockFor(editor).clearTimeout(session.timer);
    session.timer = undefined;
  }

  editor.setOption(mentionUiPlugin, "query", "");
  editor.setOption(mentionUiPlugin, "status", "idle");
  editor.setOption(mentionUiPlugin, "results", []);
  editor.setOption(mentionUiPlugin, "activeIndex", 0);
}

export function attachMentionProvider(editor: SlateEditor, provider: MentionProvider | null): void {
  if (provider === null) {
    providers.delete(editor);
    return;
  }

  providers.set(editor, provider);
}

export function setMentionSearchClock(editor: SlateEditor, clock: MentionSearchClock | null): void {
  if (clock === null) {
    clocks.delete(editor);
    return;
  }

  clocks.set(editor, clock);
}

export function setMentionComposing(editor: SlateEditor, composing: boolean): void {
  editor.composing = composing;
}

export function setMentionInputComposing(editor: SlateEditor, composing: boolean): void {
  inputComposing.set(editor, composing);
}

function mentionIsComposing(editor: SlateEditor): boolean {
  if (editor.composing === true || inputComposing.get(editor) === true) {
    return true;
  }

  const dom: unknown = editor.dom;
  return typeof dom === "object" && dom !== null && "composing" in dom && dom.composing === true;
}

function mentionInputEntry(editor: SlateEditor): [TElement, number[]] | undefined {
  for (const entry of editor.api.nodes({
    at: [],
    match: (node) => ElementApi.isElement(node) && node.type === editor.getType(KEYS.mentionInput),
  })) {
    if (ElementApi.isElement(entry[0])) {
      return [entry[0], entry[1]];
    }
  }

  return undefined;
}

function caretInLink(editor: SlateEditor): boolean {
  return (
    editor.api.above({
      match: (node) => ElementApi.isElement(node) && node.type === editor.getType(KEYS.link),
    }) !== undefined
  );
}

function caretHasCodeMark(editor: SlateEditor): boolean {
  const marks = editor.api.marks();
  return marks !== null && Reflect.get(marks, KEYS.code) === true;
}

export function mentionTriggerAllowed(editor: SlateEditor): boolean {
  if (editor.dom.readOnly === true || mentionIsComposing(editor)) {
    return false;
  }

  if (providers.get(editor) === undefined) {
    return false;
  }

  if (editor.selection === null || !editor.api.isCollapsed()) {
    return false;
  }

  if (selectionInCodeBlock(editor) || caretInLink(editor) || caretHasCodeMark(editor)) {
    return false;
  }

  return mentionInputEntry(editor) === undefined;
}

export const mentionPlugin = BaseMentionPlugin.configure({
  options: {
    trigger: "@",
    triggerPreviousCharPattern: /^\s?$/,
    insertSpaceAfterMention: false,
    triggerQuery: (editor) => mentionTriggerAllowed(editor),
    createComboboxInput: (trigger) => ({
      children: [{ text: "" }],
      trigger,
      type: KEYS.mentionInput,
    }),
  },
});

function storedPeople(results: readonly MentionEntity[]): MentionEntity[] {
  const people: MentionEntity[] = [];
  for (const entity of results) {
    const label = sanitizeMentionLabel(entity.label);
    if (
      entity.entityType !== MENTION_ENTITY_TYPE ||
      !isStoredMentionEntityId(entity.entityId) ||
      label === undefined
    ) {
      continue;
    }

    people.push({ ...entity, label });
  }

  return people;
}

async function runMentionSearch(
  editor: SlateEditor,
  query: string,
  generation: number,
): Promise<void> {
  const session = sessionFor(editor);
  if (session.generation !== generation || editor.dom.readOnly === true) {
    return;
  }

  const provider = providers.get(editor);
  if (provider === undefined) {
    editor.setOption(mentionUiPlugin, "status", "idle");
    editor.setOption(mentionUiPlugin, "results", []);
    return;
  }

  const controller = new AbortController();
  session.controller = controller;
  try {
    const results = await provider.search(query, controller.signal);
    if (session.generation !== generation || controller.signal.aborted) {
      return;
    }

    const people = storedPeople(results);
    editor.setOption(mentionUiPlugin, "results", people);
    editor.setOption(mentionUiPlugin, "status", people.length === 0 ? "empty" : "ready");
    editor.setOption(mentionUiPlugin, "activeIndex", 0);
  } catch (error: unknown) {
    if (session.generation !== generation || controller.signal.aborted || isAbortError(error)) {
      return;
    }

    editor.setOption(mentionUiPlugin, "results", []);
    editor.setOption(mentionUiPlugin, "status", "error");
  }
}

function scheduleMentionSearch(editor: SlateEditor, query: string): void {
  const session = sessionFor(editor);
  session.generation += 1;
  const generation = session.generation;
  if (session.controller !== null) {
    session.controller.abort();
    session.controller = null;
  }

  const clock = clockFor(editor);
  if (session.timer !== undefined) {
    clock.clearTimeout(session.timer);
    session.timer = undefined;
  }

  editor.setOption(mentionUiPlugin, "status", "loading");
  editor.setOption(mentionUiPlugin, "results", []);
  session.timer = clock.setTimeout(() => {
    session.timer = undefined;
    void runMentionSearch(editor, query, generation);
  }, MENTION_SEARCH_DEBOUNCE_MS);
}

export function setMentionQuery(editor: SlateEditor, query: string): void {
  editor.setOption(mentionUiPlugin, "query", query);
  editor.setOption(mentionUiPlugin, "activeIndex", 0);
  if (mentionIsComposing(editor) || editor.dom.readOnly === true) {
    return;
  }

  scheduleMentionSearch(editor, query);
}

function moveActiveMention(editor: SlateEditor, delta: number): void {
  const results = editor.getOption(mentionUiPlugin, "results");
  if (results.length === 0) {
    return;
  }

  const current = editor.getOption(mentionUiPlugin, "activeIndex");
  const next = Math.min(results.length - 1, Math.max(0, current + delta));
  editor.setOption(mentionUiPlugin, "activeIndex", next);
}

function insertMentionAtom(editor: SlateEditor, entity: MentionEntity): void {
  const label = sanitizeMentionLabel(entity.label);
  if (
    entity.entityType !== MENTION_ENTITY_TYPE ||
    !isStoredMentionEntityId(entity.entityId) ||
    label === undefined
  ) {
    return;
  }

  const input = mentionInputEntry(editor);
  editor.tf.withNewBatch(() => {
    if (input !== undefined) {
      editor.tf.select(input[1]);
      editor.tf.removeNodes({ at: input[1] });
    }

    editor.tf.insertNodes({
      type: editor.getType(KEYS.mention),
      id: allocateMentionId(),
      entityType: MENTION_ENTITY_TYPE,
      entityId: entity.entityId,
      label,
      children: [{ text: "" }],
    });
    const inserted =
      editor.selection === null
        ? undefined
        : editor.api.above({
            at: editor.selection,
            match: (node) =>
              ElementApi.isElement(node) && node.type === editor.getType(KEYS.mention),
          });
    if (inserted !== undefined) {
      const after = editor.api.after(inserted[1]);
      if (after !== undefined) {
        editor.tf.select(after);
      }
    }
    editor.tf.insertText(" ");
  });
  editor.tf.setSplittingOnce(true);
  resetMentionUi(editor);
}

export function commitMention(editor: SlateEditor, entity: MentionEntity): boolean {
  committing.add(editor);
  try {
    insertMentionAtom(editor, entity);
  } finally {
    committing.delete(editor);
  }

  return true;
}

export function commitActiveMention(editor: SlateEditor): boolean {
  const results = editor.getOption(mentionUiPlugin, "results");
  const entity = results[editor.getOption(mentionUiPlugin, "activeIndex")];
  if (entity === undefined) {
    return false;
  }

  return commitMention(editor, entity);
}

export function cancelMentionInput(editor: SlateEditor): void {
  if (committing.has(editor)) {
    return;
  }

  const input = mentionInputEntry(editor);
  if (input === undefined) {
    return;
  }

  const text = mentionInputPlainText(input[0], editor.getOption(mentionUiPlugin, "query"));
  editor.tf.withNewBatch(() => {
    editor.tf.select(input[1]);
    editor.tf.removeNodes({ at: input[1] });
    // `at` skips the combobox trigger. A bare "@" would otherwise reopen the input.
    const at = editor.selection;
    if (at !== null) {
      editor.tf.insertText(text, { at });
    }
  });
  editor.tf.setSplittingOnce(true);
  resetMentionUi(editor);
}

export function onMentionInputKeyDown(editor: SlateEditor, event: MentionInputKey): boolean {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActiveMention(editor, 1);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActiveMention(editor, -1);
    return true;
  }

  if (event.key === "Enter" || (event.key === "Tab" && event.shiftKey !== true)) {
    event.preventDefault();
    commitActiveMention(editor);
    return true;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelMentionInput(editor);
    return true;
  }

  if (event.key === "Backspace" && editor.getOption(mentionUiPlugin, "query").length === 0) {
    event.preventDefault();
    cancelMentionInput(editor);
    return true;
  }

  return false;
}

function skipMentionArrow(editor: SlateEditor, key: "ArrowLeft" | "ArrowRight"): boolean {
  const selection = editor.selection;
  if (selection === null || !editor.api.isCollapsed()) {
    return false;
  }

  const mentionType = editor.getType(KEYS.mention);
  const anchor = selection.anchor;
  const parentPath = anchor.path.slice(0, -1);
  const parentEntry = editor.api.node(parentPath);
  if (parentEntry === undefined || !ElementApi.isElement(parentEntry[0])) {
    return false;
  }

  const parent = parentEntry[0];
  if (parent.type === mentionType) {
    const point =
      key === "ArrowLeft" ? editor.api.before(parentPath) : editor.api.after(parentPath);
    if (point === undefined) {
      return false;
    }

    editor.tf.select(point);
    return true;
  }

  const index = anchor.path[anchor.path.length - 1];
  if (index === undefined) {
    return false;
  }

  if (key === "ArrowLeft" && anchor.offset === 0) {
    const previousPath = [...parentPath, index - 1];
    const previous = editor.api.node(previousPath);
    if (
      previous !== undefined &&
      ElementApi.isElement(previous[0]) &&
      previous[0].type === mentionType
    ) {
      const point = editor.api.before(previousPath);
      if (point === undefined) {
        return false;
      }

      editor.tf.select(point);
      return true;
    }
  }

  if (key === "ArrowRight") {
    const current = parent.children[index];
    const length =
      current !== undefined && "text" in current && typeof current.text === "string"
        ? current.text.length
        : 0;
    if (anchor.offset !== length) {
      return false;
    }

    const nextPath = [...parentPath, index + 1];
    const next = editor.api.node(nextPath);
    if (next !== undefined && ElementApi.isElement(next[0]) && next[0].type === mentionType) {
      const point = editor.api.after(nextPath);
      if (point === undefined) {
        return false;
      }

      editor.tf.select(point);
      return true;
    }
  }

  return false;
}

export function onMentionKeyDown(editor: SlateEditor, event: MentionInputKey): void {
  if (
    (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
    mentionInputEntry(editor) === undefined &&
    skipMentionArrow(editor, event.key)
  ) {
    event.preventDefault();
    return;
  }

  if (event.key !== "Escape" || mentionInputEntry(editor) === undefined || event.defaultPrevented) {
    return;
  }

  onMentionInputKeyDown(editor, event);
}

export function openMentionInput(editor: SlateEditor): boolean {
  if (editor.dom.readOnly === true || !mentionTriggerAllowed(editor)) {
    return false;
  }

  editor.tf.insertNodes({
    type: editor.getType(KEYS.mentionInput),
    trigger: "@",
    children: [{ text: "" }],
  });
  setMentionQuery(editor, "");
  return true;
}

export const insertMention: EditorCommand = {
  id: "inline.mention.insert",
  label: "Mention",
  group: "insert",
  isEnabled: (editor) => editor.dom.readOnly !== true && mentionTriggerAllowed(editor),
  run: (editor) => {
    if (editor.dom.readOnly === true) {
      return;
    }

    openMentionInput(editor);
  },
};
