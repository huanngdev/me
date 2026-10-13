import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor, type PlateElementProps } from "platejs/react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { ListParagraph } from "../components/elements/block-list";
import type { EditorValue } from "../lib/document/editor-value";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

// One call made while a letter is typed. `frames` are the stack frames that name a
// file, so a failure says which caller made the call.
type Call = { kind: string; frames: string[] };

type Typed = { calls: Call[]; renders: string[]; changed: string[] };

type Configurable = {
  configure: (config: { render: { node: (props: PlateElementProps) => unknown } }) => unknown;
};

function frames(): string[] {
  return (new Error().stack ?? "")
    .split("\n")
    .slice(2)
    .map((line) => line.trim().replace(/^at /, ""))
    .filter((line) => line.includes("/") && !line.includes("typing-path.test"));
}

function paragraphs(count: number): TElement[] {
  return Array.from({ length: count }, (_, index) => ({
    type: KEYS.p,
    id: `p${index}`,
    children: [{ text: `Line ${index}` }],
  })) as TElement[];
}

const isRoot = (at: unknown): boolean => at === undefined || (Array.isArray(at) && at.length === 0);

// Records the calls made until `stop`. A root walk is a `nodes`, `node` or `string`
// call with no `at`, or with an `at` of the root. A walk made inside findBlockById
// shows that function in its frames.
function startRecording(
  editor: SlateEditor,
  host: HTMLElement,
): { calls: Call[]; stop: () => void } {
  const calls: Call[] = [];
  const api = editor.api;
  const nodes = api.nodes;
  const node = api.node;
  const string = api.string;
  const querySelectorAll = Element.prototype.querySelectorAll;
  const getRect = HTMLElement.prototype.getBoundingClientRect;
  const editable = host.querySelector("[data-slate-editor]");
  Reflect.set(api, "nodes", (...args: Parameters<typeof nodes>) => {
    if (isRoot(Reflect.get(args[0] ?? {}, "at"))) {
      calls.push({ kind: "root-nodes", frames: frames() });
    }
    return nodes(...args);
  });
  Reflect.set(api, "node", (...args: Parameters<typeof node>) => {
    if (isRoot(args[0])) {
      calls.push({ kind: "root-node", frames: frames() });
    }
    return node(...args);
  });
  Reflect.set(api, "string", (...args: Parameters<typeof string>) => {
    if (isRoot(args[0])) {
      calls.push({ kind: "root-string", frames: frames() });
    }
    return string(...args);
  });
  Element.prototype.querySelectorAll = function (this: Element, selector: string) {
    if (this === editable && selector.includes("data-block-id")) {
      calls.push({ kind: "blocks-query", frames: frames() });
    }
    return querySelectorAll.call(this, selector);
  } as typeof querySelectorAll;
  HTMLElement.prototype.getBoundingClientRect = function () {
    calls.push({ kind: "rect", frames: frames() });
    return getRect.call(this);
  };
  return {
    calls,
    stop: () => {
      Reflect.set(api, "nodes", nodes);
      Reflect.set(api, "node", node);
      Reflect.set(api, "string", string);
      Element.prototype.querySelectorAll = querySelectorAll;
      HTMLElement.prototype.getBoundingClientRect = getRect;
    },
  };
}

// Mounts the full editor, puts the caret in the middle paragraph, and types one letter
// through the path a keystroke takes: a keydown on the editable, then the insert.
// `renders` lists the paragraphs that re-render; `changed` the blocks whose DOM changed.
async function typeOneLetter(count: number): Promise<Typed> {
  const renders: string[] = [];
  const Counting = (props: PlateElementProps) => {
    renders.push(String(props.element.id));
    return <ListParagraph {...props} />;
  };
  // The paragraph plugin renders through ListParagraph. The test wraps that one renderer.
  const plugins = createEditorPlugins().map((plugin) =>
    plugin.key === KEYS.p
      ? (plugin as unknown as Configurable).configure({ render: { node: Counting } })
      : plugin,
  ) as ReturnType<typeof createEditorPlugins>;
  const host = document.createElement("div");
  host.setAttribute("data-block-viewport", "");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins, value: paragraphs(count) as EditorValue });
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
    );
  });
  try {
    const middle = Math.floor(count / 2);
    await act(async () => {
      editor.tf.select({ path: [middle, 0], offset: 4 });
    });
    const editable = host.querySelector("[data-slate-editor]");
    renders.length = 0;
    const observed: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      observed.push(...records);
    });
    if (editable) {
      observer.observe(editable, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    }
    const recording = startRecording(editor, host);
    try {
      await act(async () => {
        editable?.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
        editor.tf.insertText("x");
      });
    } finally {
      recording.stop();
      observer.disconnect();
    }
    const changed = new Set<string>();
    for (const record of observed) {
      const block =
        record.target instanceof Element ? record.target.closest("[data-block-id]") : null;
      changed.add(block?.getAttribute("data-block-id") ?? "(outside a block)");
    }
    return { calls: recording.calls, renders: [...renders], changed: [...changed] };
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
}

describe("typing path", () => {
  test("a letter in a paragraph of a 300-paragraph document makes no root-level document walk", async () => {
    const { calls } = await typeOneLetter(300);
    const roots = calls.filter((call) => call.kind.startsWith("root-"));
    expect(roots.map((call) => call.frames.slice(0, 3))).toEqual([]);
  });

  test("a letter makes no findBlockById lookup and no query for every block", async () => {
    const { calls } = await typeOneLetter(300);
    expect(
      calls.filter((call) => call.frames.some((frame) => frame.includes("findBlockById"))),
    ).toEqual([]);
    expect(calls.filter((call) => call.kind === "blocks-query")).toEqual([]);
  });

  test("the box reads for a letter do not depend on the number of blocks", async () => {
    const small = (await typeOneLetter(50)).calls.filter((call) => call.kind === "rect").length;
    const large = (await typeOneLetter(300)).calls.filter((call) => call.kind === "rect").length;
    expect(large).toBe(small);
  });

  test("only the edited paragraph re-renders and only its DOM changes", async () => {
    const { renders, changed } = await typeOneLetter(300);
    expect(renders).toEqual(["p150"]);
    expect(changed).toEqual(["p150"]);
  });
});
