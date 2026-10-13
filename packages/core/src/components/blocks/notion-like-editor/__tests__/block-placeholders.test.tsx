import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, NodeApi, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { placeholderSpec } from "../components/editor/block-placeholders";
import type { EditorValue } from "../lib/document/editor-value";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const ATTR = "data-block-placeholder";
const PLACEHOLDER = "Type to write";

type Mounted = {
  editor: ReturnType<typeof createPlateEditor>;
  host: HTMLDivElement;
  unmount: () => Promise<void>;
};

async function mount(value: TElement[]): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value: value as EditorValue });
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={false}
        placeholder={PLACEHOLDER}
        className="editor"
      />,
    );
  });
  return {
    editor,
    host,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function paragraph(id: string, text = ""): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

// The placeholder each top-level block should carry. This is the full pass's rule
// written out: a block shows its spec when the spec is always-on, or when the
// block holds the caret. A single empty document shows none (the document-level
// placeholder covers it).
function expectedPlaceholders(editor: Mounted["editor"]): Map<string, string | null> {
  const expected = new Map<string, string | null>();
  const first = editor.children[0];
  const single =
    editor.children.length === 1 &&
    first !== undefined &&
    ElementApi.isElement(first) &&
    NodeApi.string(first) === "";
  const caret = editor.selection ? (editor.selection.anchor.path[0] ?? null) : null;
  editor.children.forEach((node, index) => {
    if (!ElementApi.isElement(node) || typeof node.id !== "string") {
      return;
    }
    const spec = single ? null : placeholderSpec(node, { parentType: null, index }, PLACEHOLDER);
    expected.set(node.id, spec && (spec.always || index === caret) ? spec.text : null);
  });
  return expected;
}

function assertPlaceholders(mounted: Mounted, label: string): void {
  const expected = expectedPlaceholders(mounted.editor);
  for (const [id, text] of expected) {
    const actual =
      mounted.host.querySelector(`[data-block-id='${id}']`)?.getAttribute(ATTR) ?? null;
    expect({ label, id, actual }).toEqual({ label, id, actual: text });
  }
}

async function inAct(run: () => void): Promise<void> {
  await act(async () => {
    run();
  });
}

describe("block placeholders after an edit", () => {
  test("typing in one empty block of 300 writes O(1) placeholder attributes per key", async () => {
    const value = Array.from({ length: 300 }, (_, index) => paragraph(`b${index}`));
    const mounted = await mount(value);
    const setAttribute = Element.prototype.setAttribute;
    const removeAttribute = Element.prototype.removeAttribute;
    let writes = 0;
    Element.prototype.setAttribute = function (name: string, text: string) {
      if (name === ATTR) {
        writes += 1;
      }
      setAttribute.call(this, name, text);
    };
    Element.prototype.removeAttribute = function (name: string) {
      if (name === ATTR) {
        writes += 1;
      }
      removeAttribute.call(this, name);
    };
    try {
      await inAct(() => {
        mounted.editor.tf.select({ path: [150, 0], offset: 0 });
      });
      assertPlaceholders(mounted, "caret in block 150");
      writes = 0;
      const keys = 5;
      for (let index = 0; index < keys; index += 1) {
        await inAct(() => {
          mounted.editor.tf.insertText("a");
        });
      }
      // A full pass would clear the attribute on all 299 other empty blocks at once.
      expect(writes).toBeLessThanOrEqual(keys * 2);
      assertPlaceholders(mounted, "after typing in block 150");
    } finally {
      Element.prototype.setAttribute = setAttribute;
      Element.prototype.removeAttribute = removeAttribute;
      await mounted.unmount();
    }
  });

  test("placeholders match a full pass through emptying, caret moves, Enter, merge and undo", async () => {
    const mounted = await mount([
      { type: KEYS.h1, id: "h", children: [{ text: "" }] },
      paragraph("p0"),
      paragraph("p1"),
      paragraph("p2"),
      paragraph("p3"),
      paragraph("p4"),
    ]);
    const { editor } = mounted;
    try {
      await inAct(() => {
        editor.tf.select({ path: [2, 0], offset: 0 });
      });
      assertPlaceholders(mounted, "caret on empty p1");

      await inAct(() => {
        editor.tf.insertText("a");
      });
      assertPlaceholders(mounted, "typing in an empty block");

      await inAct(() => {
        editor.tf.select({ path: [3, 0], offset: 0 });
      });
      assertPlaceholders(mounted, "caret moves to the next empty paragraph");

      await inAct(() => {
        editor.tf.select({ path: [4, 0], offset: 0 });
      });
      assertPlaceholders(mounted, "caret moves between two empty paragraphs");

      await inAct(() => {
        editor.tf.insertText("b");
      });
      await inAct(() => {
        editor.tf.deleteBackward("character");
      });
      assertPlaceholders(mounted, "emptying a block again");

      await inAct(() => {
        editor.tf.insertBreak();
      });
      assertPlaceholders(mounted, "Enter splits the block");

      await inAct(() => {
        editor.tf.deleteBackward("character");
      });
      assertPlaceholders(mounted, "Backspace merges the empty block");

      await inAct(() => {
        editor.tf.undo();
      });
      assertPlaceholders(mounted, "undo after the merge");

      await inAct(() => {
        editor.tf.undo();
      });
      assertPlaceholders(mounted, "undo after the split");
    } finally {
      await mounted.unmount();
    }
  });

  test("a single empty document shows no attribute, and typing into it flips the state", async () => {
    const mounted = await mount([paragraph("only")]);
    const { editor } = mounted;
    try {
      await inAct(() => {
        editor.tf.select({ path: [0, 0], offset: 0 });
      });
      assertPlaceholders(mounted, "single empty document");
      expect(mounted.host.querySelector(`[${ATTR}]`)).toBeNull();

      await inAct(() => {
        editor.tf.insertText("a");
      });
      assertPlaceholders(mounted, "typed into the single block");

      await inAct(() => {
        editor.tf.deleteBackward("character");
      });
      assertPlaceholders(mounted, "emptied back to a single empty document");
      expect(mounted.host.querySelector(`[${ATTR}]`)).toBeNull();
    } finally {
      await mounted.unmount();
    }
  });
});
