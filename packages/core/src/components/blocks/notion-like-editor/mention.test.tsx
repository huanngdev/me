import { describe, expect, test } from "bun:test";
import { useComboboxInput } from "@platejs/combobox/react";
import {
  BaseMentionInputPlugin,
  BaseMentionPlugin,
  getMentionOnSelectItem,
} from "@platejs/mention";
import { KEYS, createSlateEditor, type SlateEditor, type TElement } from "platejs";
import { Plate, PlateContent, createPlateEditor, toPlatePlugin } from "platejs/react";
import { useRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { runEditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { parseEditorDocument } from "./editor-document-validate";
import {
  onMentionKeyDown,
  MENTION_EMPTY_LABEL,
  MENTION_ERROR_LABEL,
  MENTION_SEARCH_DEBOUNCE_MS,
  MENTION_UNKNOWN_LABEL,
  attachMentionProvider,
  cancelMentionInput,
  commitActiveMention,
  insertMention,
  mentionUiPlugin,
  onMentionInputKeyDown,
  setMentionComposing,
  setMentionInputComposing,
  setMentionQuery,
  setMentionSearchClock,
} from "./editor-mention";
import {
  MENTION_ENTITY_ID_MAX,
  MENTION_ENTITY_TYPE,
  MENTION_LABEL_MAX,
  repairMentionInputs,
  type MentionEntity,
  type MentionProvider,
} from "./editor-mention-node";
import { createEditorPlugins } from "./editor-plugins";
import { pasteRepairsOf } from "./editor-paste";
import { EditorSurface } from "./editor-surface";
import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import type { EditorValue } from "./editor-value";
import {
  caret,
  controllable,
  createEditor,
  createFakeTimers,
  expectOk,
  expectUnsupported,
  isRecord,
  plainText,
} from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const ALEX_A: MentionEntity = {
  entityType: MENTION_ENTITY_TYPE,
  entityId: "person-alex-kim",
  label: "Alex Kim",
  email: "alex.kim@example.com",
};

const ALEX_B: MentionEntity = {
  entityType: MENTION_ENTITY_TYPE,
  entityId: "person-alex-kim-2",
  label: "Alex Kim",
  email: "alex.kim.studio@example.com",
};

const NGO: MentionEntity = {
  entityType: MENTION_ENTITY_TYPE,
  entityId: "person-ngo-gia",
  label: "Ngô Gia",
  email: "gia@example.com",
};

const PEOPLE = [ALEX_A, ALEX_B, NGO];

function paragraph(text: string, id = "p"): TElement {
  return { type: "p", id, children: [{ text }] };
}

function codeBlock(text: string): TElement {
  return {
    type: "code_block",
    id: "code-1",
    children: [{ type: "code_line", id: "line-1", children: [{ text }] }],
  };
}

function mentionNode(
  entity: MentionEntity = ALEX_A,
  id = "mention-1",
  extra?: Record<string, unknown>,
): TElement {
  return {
    type: KEYS.mention,
    id,
    entityType: entity.entityType,
    entityId: entity.entityId,
    label: entity.label,
    children: [{ text: "" }],
    ...extra,
  };
}

function nodesOfType(value: unknown, type: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.type === type) {
      found.push(node);
    }

    if (Array.isArray(node.children)) {
      visit(node.children);
    }
  };

  visit(value);
  return found;
}

function blockString(editor: SlateEditor, index = 0): string {
  const block = editor.children[index];
  if (block === undefined) {
    throw new Error("Missing block.");
  }

  return editor.api.string(block);
}

function documentOf(content: TElement[]) {
  return parseEditorDocument(createEditorDocument("doc-mention", content));
}

function peopleProvider(people: readonly MentionEntity[] = PEOPLE): MentionProvider & {
  calls: string[];
  signals: AbortSignal[];
} {
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  return {
    calls,
    signals,
    search(query, signal) {
      calls.push(query);
      signals.push(signal);
      const folded = query.trim().toLocaleLowerCase("en");
      return Promise.resolve(
        people.filter(
          (person) =>
            folded.length === 0 ||
            person.label.toLocaleLowerCase("en").includes(folded) ||
            person.entityId.includes(folded),
        ),
      );
    },
  };
}

function arm(editor: SlateEditor, provider: MentionProvider = peopleProvider()): MentionProvider {
  attachMentionProvider(editor, provider);
  const block = editor.children[0];
  const offset = block === undefined ? 0 : editor.api.string(block).length;
  editor.tf.select(caret([0, 0], offset));
  return provider;
}

function keyOf(key: string, shiftKey = false) {
  const event = {
    key,
    shiftKey,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

async function flush(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function NativeMentionInput() {
  const ref = useRef<HTMLButtonElement>(null);
  const combobox = useComboboxInput({
    ref,
    autoFocus: false,
    cancelInputOnBlur: false,
  });
  return (
    <button
      ref={ref}
      type="button"
      data-native-mention-input=""
      onClick={() => {
        combobox.cancelInput("manual");
      }}
    >
      cancel
    </button>
  );
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

describe("native mention plugin", () => {
  // @platejs/mention@53.0.0 dist/BaseMentionPlugin-uPSCCRSr.js 5-39:
  // MentionInputPlugin key mention_input, inline void.
  // MentionPlugin key mention, inline markable void.
  // trigger "@", triggerPreviousCharPattern /^\s?$/, createComboboxInput.
  // insert.mention (lines 32-38) stores key and value. search is not stored.
  // dist/index.js 4-16 getMentionOnSelectItem maps item.text to value and item.key to key.
  // @platejs/combobox@53.0.0 dist/index.js 2-22 withTriggerCombobox inserts the input
  // when the previous character is empty or one whitespace character.
  // dist/react/index.js 23-42 cancelInput removes the input node and does not insert text.
  test("BaseMentionPlugin stores value and key, and cancel removes the input", async () => {
    const editor = createSlateEditor({
      plugins: [BaseMentionPlugin],
      value: [paragraph("")],
    });
    const options = editor.getOptions(BaseMentionPlugin);

    expect(BaseMentionPlugin.key).toBe(KEYS.mention);
    expect(BaseMentionPlugin.key).toBe("mention");
    expect(BaseMentionInputPlugin.key).toBe(KEYS.mentionInput);
    expect(BaseMentionInputPlugin.key).toBe("mention_input");
    expect(options.trigger).toBe("@");
    expect(String(options.triggerPreviousCharPattern)).toBe(String(/^\s?$/));
    expect(editor.api.isInline({ type: KEYS.mention, children: [{ text: "" }] })).toBe(true);
    expect(editor.api.isVoid({ type: KEYS.mention, children: [{ text: "" }] })).toBe(true);
    expect(editor.api.isInline({ type: KEYS.mentionInput, children: [{ text: "" }] })).toBe(true);
    expect(editor.api.isVoid({ type: KEYS.mentionInput, children: [{ text: "" }] })).toBe(true);

    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("@");
    const input = nodesOfType(editor.children, KEYS.mentionInput)[0];
    expect(input?.trigger).toBe("@");
    expect(input?.children).toEqual([{ text: "" }]);
    expect(blockString(editor)).toBe("");

    getMentionOnSelectItem()(editor, { key: "person-1", text: "Ada" }, "Ad");
    const stored = nodesOfType(editor.children, KEYS.mention)[0];
    expect(stored?.value).toBe("Ada");
    expect(stored?.key).toBe("person-1");
    expect("search" in (stored ?? {})).toBe(false);
    expect(stored?.children).toEqual([{ text: "" }]);

    const plate = createPlateEditor({
      plugins: [
        toPlatePlugin(BaseMentionPlugin, {}).configurePlugin(BaseMentionInputPlugin, {
          render: { node: NativeMentionInput },
        }),
      ],
      value: [paragraph("")],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }

    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <Plate editor={plate}>
          <PlateContent />
        </Plate>,
      );
    });
    await act(async () => {
      plate.tf.select(caret([0, 0], 0));
      plate.tf.insertText("@");
    });

    const probe = document.querySelector("[data-native-mention-input]");
    expect(probe instanceof HTMLButtonElement).toBe(true);
    await act(async () => {
      if (probe instanceof HTMLButtonElement) {
        probe.click();
      }
    });

    expect(nodesOfType(plate.children, KEYS.mentionInput)).toEqual([]);
    expect(plainText(plate)).toBe("");

    await act(async () => {
      root?.unmount();
    });
    host.remove();
  });
});

describe("mention schema", () => {
  test("a mention round-trips and keeps the same content reference", () => {
    const content = [
      {
        type: "p",
        id: "p",
        children: [{ text: "Hi " }, mentionNode(), { text: "there" }],
      },
    ];
    const raw = createEditorDocument("doc-mention", content);
    const parsed = expectOk(parseEditorDocument(raw));

    expect(parsed.document.content).toBe(raw.content);
    expect(parsed.repairs).toEqual([]);
    expect(JSON.parse(serializeEditorDocument(parsed.document))).toEqual(
      JSON.parse(JSON.stringify(raw)),
    );
    expect(nodesOfType(parsed.document.content, KEYS.mention)[0]).toEqual(mentionNode());
  });

  test("a mention is allowed in a heading and rejected inside a link or code line", () => {
    expectOk(
      documentOf([
        {
          type: "h1",
          id: "h",
          children: [{ text: "Hi " }, mentionNode()],
        },
      ]),
    );

    const linked = createEditorDocument("doc-mention", [
      {
        type: "p",
        id: "p",
        children: [
          {
            type: "a",
            id: "link-1",
            url: "https://example.com",
            children: [{ text: "see " }, mentionNode()],
          },
        ],
      },
    ]);
    expect(expectUnsupported(parseEditorDocument(linked)).raw).toBe(linked);

    const coded = createEditorDocument("doc-mention", [
      {
        type: "code_block",
        id: "code-1",
        children: [{ type: "code_line", id: "line-1", children: [mentionNode()] }],
      },
    ]);
    expect(expectUnsupported(parseEditorDocument(coded)).raw).toBe(coded);
  });

  test("unknown mention attrs and bad fields are rejected and the raw document is kept", () => {
    const extra = createEditorDocument("doc-mention", [
      {
        type: "p",
        id: "p",
        children: [
          { text: "Hi " },
          mentionNode(ALEX_A, "mention-1", { value: "Alex Kim", key: "person-alex-kim" }),
        ],
      },
    ]);
    expect(expectUnsupported(parseEditorDocument(extra)).raw).toBe(extra);

    const cases: TElement[] = [
      mentionNode(ALEX_A, "mention-1", { entityType: "team" }),
      mentionNode(ALEX_A, "mention-1", { entityId: "" }),
      mentionNode(ALEX_A, "mention-1", { entityId: "a".repeat(MENTION_ENTITY_ID_MAX + 1) }),
      mentionNode(ALEX_A, "mention-1", { entityId: "bad\nid" }),
      mentionNode(ALEX_A, "mention-1", { label: "" }),
      mentionNode(ALEX_A, "mention-1", { label: "a".repeat(MENTION_LABEL_MAX + 1) }),
      mentionNode(ALEX_A, "mention-1", { label: "bad\nname" }),
      mentionNode(ALEX_A, "mention-1", { entityId: undefined }),
      { ...mentionNode(), children: [{ text: "Ada" }] },
      { ...mentionNode(), children: [{ text: "", bold: true }] },
    ];

    for (const node of cases) {
      const raw = createEditorDocument("doc-mention", [
        { type: "p", id: "p", children: [{ text: "Hi " }, node] },
      ]);
      expect(expectUnsupported(parseEditorDocument(raw)).raw).toBe(raw);
    }
  });

  test("mention_input is repaired to plain text and is not repaired again", () => {
    const raw = createEditorDocument("doc-mention", [
      {
        type: "p",
        id: "p",
        children: [
          { text: "Hi " },
          { type: KEYS.mentionInput, trigger: "@", query: "Ada", children: [{ text: "" }] },
        ],
      },
    ]);
    const parsed = expectOk(parseEditorDocument(raw));
    expect(parsed.repairs.some((repair) => repair.message.includes("mention input"))).toBe(true);
    expect(nodesOfType(parsed.document.content, KEYS.mentionInput)).toEqual([]);
    expect(JSON.stringify(parsed.document.content)).toContain("@Ada");

    const again = expectOk(parseEditorDocument(parsed.document));
    expect(again.repairs.some((repair) => repair.message.includes("mention input"))).toBe(false);
    expect(again.document.content).toBe(parsed.document.content);

    const direct = repairMentionInputs(
      [
        {
          type: "p",
          id: "p",
          children: [
            { text: "Hi " },
            { type: KEYS.mentionInput, trigger: "@", children: [{ text: "" }] },
          ],
        },
      ],
      "Ada",
    );
    expect(JSON.stringify(direct.content)).toContain("Hi @Ada");
    expect(nodesOfType(direct.content, KEYS.mentionInput)).toEqual([]);

    const unchanged = paragraph("Hi");
    const kept = repairMentionInputs([unchanged]);
    expect(kept.content).toEqual([unchanged]);
    expect(kept.content[0]).toBe(unchanged);
    expect(kept.repairs).toEqual([]);
  });
});

describe("mention search", () => {
  test("search waits 150ms, aborts the previous request, and ignores a stale response", async () => {
    const editor = createEditor([paragraph("")]);
    const first = controllable<MentionEntity[]>();
    const second = controllable<MentionEntity[]>();
    const signals: AbortSignal[] = [];
    const queries: string[] = [];
    attachMentionProvider(editor, {
      search(query, signal) {
        queries.push(query);
        signals.push(signal);
        return query === "a" ? first.promise : second.promise;
      },
    });
    const clock = createFakeTimers();
    setMentionSearchClock(editor, clock.timers);

    setMentionQuery(editor, "a");
    expect(editor.getOption(mentionUiPlugin, "status")).toBe("loading");
    expect(queries).toEqual([]);
    clock.advance(MENTION_SEARCH_DEBOUNCE_MS - 1);
    expect(queries).toEqual([]);
    clock.advance(1);
    expect(queries).toEqual(["a"]);
    expect(signals[0]?.aborted).toBe(false);

    setMentionQuery(editor, "ab");
    expect(signals[0]?.aborted).toBe(true);
    clock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    expect(queries).toEqual(["a", "ab"]);

    second.resolve([NGO]);
    await second.promise;
    await flush();
    expect(editor.getOption(mentionUiPlugin, "results").map((person) => person.entityId)).toEqual([
      NGO.entityId,
    ]);
    expect(editor.getOption(mentionUiPlugin, "status")).toBe("ready");

    first.resolve([ALEX_A]);
    await first.promise;
    await flush();
    expect(editor.getOption(mentionUiPlugin, "results").map((person) => person.entityId)).toEqual([
      NGO.entityId,
    ]);
  });

  test("an empty result and a failed search have their own states, and an abort is not an error", async () => {
    const emptyEditor = createEditor([paragraph("")]);
    const empty = peopleProvider([]);
    attachMentionProvider(emptyEditor, empty);
    const emptyClock = createFakeTimers();
    setMentionSearchClock(emptyEditor, emptyClock.timers);
    setMentionQuery(emptyEditor, "zzz");
    emptyClock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    await flush();
    expect(emptyEditor.getOption(mentionUiPlugin, "status")).toBe("empty");
    expect(MENTION_EMPTY_LABEL).toBe("No people found");

    const failed = createEditor([paragraph("")]);
    attachMentionProvider(failed, {
      search() {
        return Promise.reject(new Error("down"));
      },
    });
    const failedClock = createFakeTimers();
    setMentionSearchClock(failed, failedClock.timers);
    setMentionQuery(failed, "a");
    failedClock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    await flush();
    expect(failed.getOption(mentionUiPlugin, "status")).toBe("error");
    expect(failed.getOption(mentionUiPlugin, "results")).toEqual([]);
    expect(MENTION_ERROR_LABEL).toBe("Couldn't load people");

    const aborted = createEditor([paragraph("")]);
    const hanging = controllable<MentionEntity[]>();
    const signals: AbortSignal[] = [];
    attachMentionProvider(aborted, {
      search(_query, signal) {
        signals.push(signal);
        return hanging.promise;
      },
    });
    const abortedClock = createFakeTimers();
    setMentionSearchClock(aborted, abortedClock.timers);
    setMentionQuery(aborted, "a");
    abortedClock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    setMentionQuery(aborted, "b");
    expect(signals[0]?.aborted).toBe(true);
    expect(aborted.getOption(mentionUiPlugin, "status")).not.toBe("error");
    hanging.resolve([]);
    await flush();
  });

  test("composition and read-only do not search", async () => {
    const editor = createEditor([paragraph("")]);
    const provider = peopleProvider();
    attachMentionProvider(editor, provider);
    const clock = createFakeTimers();
    setMentionSearchClock(editor, clock.timers);

    setMentionInputComposing(editor, true);
    setMentionQuery(editor, "Ngô");
    clock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    await flush();
    expect(provider.calls).toEqual([]);
    expect(editor.getOption(mentionUiPlugin, "query")).toBe("Ngô");

    setMentionInputComposing(editor, false);
    setMentionQuery(editor, "Ngô");
    clock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    await flush();
    expect(provider.calls).toEqual(["Ngô"]);

    const quiet = createEditor([paragraph("Hello")]);
    const quietProvider = peopleProvider();
    attachMentionProvider(quiet, quietProvider);
    const quietClock = createFakeTimers();
    setMentionSearchClock(quiet, quietClock.timers);
    quiet.dom.readOnly = true;
    setMentionQuery(quiet, "Alex");
    quietClock.advance(MENTION_SEARCH_DEBOUNCE_MS);
    await flush();
    expect(quietProvider.calls).toEqual([]);
  });
});

describe("mention editing", () => {
  test("keyboard select inserts the atom and one trailing space as one undo, and escape keeps the query", () => {
    const editor = createEditor([paragraph("")]);
    arm(editor, peopleProvider());
    editor.tf.insertText("@");
    editor.setOption(mentionUiPlugin, "query", "Alex");
    editor.setOption(mentionUiPlugin, "results", [ALEX_A, ALEX_B]);
    editor.setOption(mentionUiPlugin, "status", "ready");
    editor.setOption(mentionUiPlugin, "activeIndex", 0);
    const before = editor.history.undos.length;

    const down = keyOf("ArrowDown");
    expect(onMentionInputKeyDown(editor, down)).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    expect(editor.getOption(mentionUiPlugin, "activeIndex")).toBe(1);

    const selected = keyOf("Enter");
    expect(onMentionInputKeyDown(editor, selected)).toBe(true);
    expect(editor.history.undos.length).toBe(before + 1);
    const stored = nodesOfType(editor.children, KEYS.mention)[0];
    expect(stored?.entityType).toBe(MENTION_ENTITY_TYPE);
    expect(stored?.entityId).toBe(ALEX_B.entityId);
    expect(stored?.label).toBe("Alex Kim");
    expect(stored?.children).toEqual([{ text: "" }]);
    expect("value" in (stored ?? {})).toBe(false);
    expect("key" in (stored ?? {})).toBe(false);
    expect(blockString(editor)).toBe(" ");
    expect(nodesOfType(editor.children, KEYS.mentionInput)).toEqual([]);

    editor.tf.undo();
    expect(nodesOfType(editor.children, KEYS.mention)).toEqual([]);
    expect(blockString(editor)).toBe("");

    const cancelled = createEditor([paragraph("Hi ")]);
    arm(cancelled);
    cancelled.tf.insertText("@");
    cancelled.setOption(mentionUiPlugin, "query", "Ada");
    const cancelKey = keyOf("Escape");
    expect(onMentionInputKeyDown(cancelled, cancelKey)).toBe(true);
    expect(nodesOfType(cancelled.children, KEYS.mentionInput)).toEqual([]);
    expect(nodesOfType(cancelled.children, KEYS.mention)).toEqual([]);
    expect(blockString(cancelled)).toBe("Hi @Ada");

    const tabbed = createEditor([paragraph("")]);
    arm(tabbed);
    tabbed.tf.insertText("@");
    tabbed.setOption(mentionUiPlugin, "results", [ALEX_A]);
    tabbed.setOption(mentionUiPlugin, "activeIndex", 0);
    expect(onMentionInputKeyDown(tabbed, keyOf("Tab"))).toBe(true);
    expect(nodesOfType(tabbed.children, KEYS.mention)[0]?.entityId).toBe(ALEX_A.entityId);
    expect(blockString(tabbed)).toBe(" ");
  });

  test("duplicate labels keep distinct ids", () => {
    const first = createEditor([paragraph("")]);
    arm(first);
    first.tf.insertText("@");
    first.setOption(mentionUiPlugin, "results", [ALEX_A, ALEX_B]);
    first.setOption(mentionUiPlugin, "activeIndex", 0);
    commitActiveMention(first);

    const second = createEditor([paragraph("")]);
    arm(second);
    second.tf.insertText("@");
    second.setOption(mentionUiPlugin, "results", [ALEX_A, ALEX_B]);
    second.setOption(mentionUiPlugin, "activeIndex", 1);
    commitActiveMention(second);

    expect(nodesOfType(first.children, KEYS.mention)[0]?.label).toBe("Alex Kim");
    expect(nodesOfType(second.children, KEYS.mention)[0]?.label).toBe("Alex Kim");
    expect(nodesOfType(first.children, KEYS.mention)[0]?.entityId).toBe(ALEX_A.entityId);
    expect(nodesOfType(second.children, KEYS.mention)[0]?.entityId).toBe(ALEX_B.entityId);
  });

  test("backspace and delete remove the atom, and arrows move over it", () => {
    const value: EditorValue = [
      {
        type: "p",
        id: "p",
        children: [{ text: "A", bold: true }, mentionNode(), { text: "B", bold: true }],
      },
    ];
    const backward = createEditor(value);
    backward.tf.select(caret([0, 2], 0));
    backward.tf.deleteBackward();
    expect(nodesOfType(backward.children, KEYS.mention)).toEqual([]);
    expect(blockString(backward)).toBe("AB");
    expect(backward.children[0]?.children).toEqual([{ text: "AB", bold: true }]);

    const forward = createEditor(value);
    forward.tf.select(caret([0, 0], 1));
    forward.tf.deleteForward();
    expect(nodesOfType(forward.children, KEYS.mention)).toEqual([]);
    expect(blockString(forward)).toBe("AB");

    const arrows = createEditor(value);
    arrows.tf.select(caret([0, 2], 0));
    const left = keyOf("ArrowLeft");
    onMentionKeyDown(arrows, left);
    expect(left.defaultPrevented).toBe(true);
    expect(arrows.selection?.anchor).toEqual({ path: [0, 0], offset: 1 });
    const right = keyOf("ArrowRight");
    onMentionKeyDown(arrows, right);
    expect(right.defaultPrevented).toBe(true);
    expect(arrows.selection?.anchor).toEqual({ path: [0, 2], offset: 0 });
  });

  test("the trigger does not fire in code, inline code, a link, or during composition", () => {
    const coded = createEditor([codeBlock("const x = 1")]);
    arm(coded);
    coded.tf.select(caret([0, 0, 0], "const x = 1".length));
    coded.tf.insertText("@");
    expect(nodesOfType(coded.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(coded)).toContain("@");

    const inline = createEditor([{ type: "p", id: "p", children: [{ text: "code", code: true }] }]);
    arm(inline);
    inline.tf.insertText("@");
    expect(nodesOfType(inline.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(inline)).toBe("code@");

    const linked = createEditor([
      {
        type: "p",
        id: "p",
        children: [
          { text: "see " },
          {
            type: "a",
            id: "link-1",
            url: "https://example.com",
            children: [{ text: "site" }],
          },
        ],
      },
    ]);
    attachMentionProvider(linked, peopleProvider());
    linked.tf.select(caret([0, 1, 0], 2));
    linked.tf.insertText("@");
    expect(nodesOfType(linked.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(linked)).toContain("@");

    const composing = createEditor([paragraph("")]);
    arm(composing);
    setMentionComposing(composing, true);
    composing.tf.insertText("@");
    expect(nodesOfType(composing.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(composing)).toBe("@");
    setMentionComposing(composing, false);

    const boundary = createEditor([paragraph("a")]);
    arm(boundary);
    boundary.tf.insertText("@");
    expect(nodesOfType(boundary.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(boundary)).toBe("a@");

    const spaced = createEditor([paragraph("hi ")]);
    arm(spaced);
    spaced.tf.insertText("@");
    expect(nodesOfType(spaced.children, KEYS.mentionInput)).toHaveLength(1);
  });

  test("read-only does not search or insert, and the command opens the input when editing", () => {
    const editor = createEditor([paragraph("Hello")]);
    const provider = peopleProvider();
    attachMentionProvider(editor, provider);
    editor.dom.readOnly = true;
    editor.tf.select(caret([0, 0], 5));
    const before = JSON.parse(JSON.stringify(editor.children));

    expect(insertMention.id).toBe("inline.mention.insert");
    expect(insertMention.label).toBe("Mention");
    expect(insertMention.group).toBe("insert");
    expect(insertMention.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, insertMention, undefined, { readOnly: true })).toBe(false);
    expect(editor.children).toEqual(before);
    editor.tf.insertText("@");
    expect(nodesOfType(editor.children, KEYS.mentionInput)).toEqual([]);
    expect(nodesOfType(editor.children, KEYS.mention)).toEqual([]);
    expect(provider.calls).toEqual([]);

    const editing = createEditor([paragraph("Hello")]);
    arm(editing);
    editing.tf.select(caret([0, 0], 2));
    expect(insertMention.isEnabled?.(editing)).toBe(true);
    expect(runEditorCommand(editing, insertMention, undefined)).toBe(true);
    expect(nodesOfType(editing.children, KEYS.mentionInput)).toHaveLength(1);
    expect(blockString(editing)).toBe("Hello");
  });

  test("pasting a mention keeps its fields, assigns a new id, and a mention input becomes text", () => {
    const editor = createEditor([paragraph("Say ")]);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertFragment([
      {
        type: "p",
        children: [
          { text: "hello " },
          mentionNode(ALEX_A, "old-mention", { value: "Alex Kim", key: "person-alex-kim" }),
          { text: " there" },
        ],
      },
    ]);

    const stored = nodesOfType(editor.children, KEYS.mention)[0];
    expect(stored?.entityType).toBe(MENTION_ENTITY_TYPE);
    expect(stored?.entityId).toBe(ALEX_A.entityId);
    expect(stored?.label).toBe(ALEX_A.label);
    expect(stored?.children).toEqual([{ text: "" }]);
    expect(stored?.id).not.toBe("old-mention");
    expect(typeof stored?.id).toBe("string");
    expect("value" in (stored ?? {})).toBe(false);
    expect("key" in (stored ?? {})).toBe(false);

    const input = createEditor([paragraph("")]);
    input.tf.select(caret([0, 0], 0));
    input.tf.insertFragment([
      {
        type: "p",
        children: [
          { text: "x" },
          { type: KEYS.mentionInput, trigger: "@", query: "Ada", children: [{ text: "" }] },
        ],
      },
    ]);
    expect(nodesOfType(input.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(input)).toContain("@Ada");
    expect(pasteRepairsOf(input).some((repair) => repair.message.includes("mention input"))).toBe(
      true,
    );
  });

  test("cancel of an empty query leaves @ as text", () => {
    const editor = createEditor([paragraph("Hi")]);
    arm(editor);
    editor.tf.insertText("@");
    cancelMentionInput(editor);
    expect(nodesOfType(editor.children, KEYS.mentionInput)).toEqual([]);
    expect(blockString(editor)).toBe("Hi@");
  });
});

describe("mention render", () => {
  test("an unknown person keeps the stored label, and read-only does not search", async () => {
    let searches = 0;
    let resolves = 0;
    const provider: MentionProvider = {
      search() {
        searches += 1;
        return Promise.resolve([ALEX_A]);
      },
      resolve() {
        resolves += 1;
        return Promise.resolve(null);
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }

    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [
        {
          type: "p",
          id: "p",
          children: [{ text: "Ask " }, mentionNode(), { text: " now" }],
        },
      ],
    });
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface
          editor={editor}
          readOnly
          placeholder=""
          className="editor"
          mentionProvider={provider}
        />,
      );
    });
    await flush();
    await act(async () => {
      await flush();
    });

    const chip = host.querySelector("[data-mention-entity-id='person-alex-kim']");
    expect(chip instanceof HTMLElement).toBe(true);
    if (!(chip instanceof HTMLElement)) {
      throw new Error("Missing mention chip.");
    }

    expect(chip.textContent).toContain("@Alex Kim");
    expect(chip.dataset.mentionState).toBe("unknown");
    expect(chip.title).toBe(MENTION_UNKNOWN_LABEL);
    expect(chip.className).toContain("bg-muted");
    expect(searches).toBe(0);
    expect(resolves).toBe(1);

    await act(async () => {
      root?.unmount();
    });
    host.remove();
  });

  test("the demo intro ends with its own mention paragraph", () => {
    const mentionIndex = DEMO_DOCUMENT_VALUE.findIndex((block) => block.id === "demo-mention");
    const unicodeIndex = DEMO_DOCUMENT_VALUE.findIndex((block) => block.id === "demo-unicode");
    const tocIndex = DEMO_DOCUMENT_VALUE.findIndex((block) => block.id === "demo-toc");
    const block = DEMO_DOCUMENT_VALUE[mentionIndex];
    const stored = nodesOfType(block, KEYS.mention)[0];

    expect(mentionIndex).toBe(unicodeIndex + 1);
    expect(tocIndex).toBe(mentionIndex + 1);
    expect(stored?.entityId).toBe("person-alex-kim");
    expect(stored?.label).toBe("Alex Kim");
    expect(stored?.entityType).toBe("person");
  });
});
