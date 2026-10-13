import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { KEYS, createSlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import {
  calendarDateToStoredDate,
  formatStoredDate,
  isStoredDate,
  parseStoredDate,
  storedDateToCalendarDate,
  todayStoredDate,
  toStoredDate,
} from "../lib/features/editor-date-value";
import { insertInlineDate, inlineDateNode } from "../lib/features/editor-inline-date";
import { insertInlineEquation } from "../lib/features/editor-inline-equation";
import { preparePastedFragment } from "../lib/paste/editor-paste";
import { insertTodayDate } from "../lib/plugins/editor-inline-date-ui";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import {
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectOk,
  expectUnsupported,
  texts,
} from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const DATE_MODULE = join(import.meta.dir, "../lib/features/editor-date-value.ts");

function para(id: string, children: unknown[]): EditorValue[number] {
  return { type: KEYS.p, id, children } as unknown as EditorValue[number];
}

function date(id: string, value: string): unknown {
  return { type: KEYS.date, id, date: value, children: [{ text: "" }] };
}

function dateNodes(editor: { children: unknown[] }): TElement[] {
  const found: TElement[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    if ("type" in node && node.type === KEYS.date) {
      found.push(node as TElement);
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  editor.children.forEach(visit);
  return found;
}

function parse(value: EditorValue) {
  return parseEditorDocument(createEditorDocument("document", value));
}

// Runs the given code in a child process with TZ set. One test process cannot change its own zone.
function inZone(zone: string, body: string): unknown {
  const script = `
    (async () => {
      const m = await import(${JSON.stringify(DATE_MODULE)});
      const result = (() => { ${body} })();
      console.log(JSON.stringify(result));
    })();
  `;
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    env: { ...process.env, TZ: zone },
  });
  if (child.exitCode !== 0) {
    throw new Error(child.stderr.toString());
  }
  return JSON.parse(child.stdout.toString().trim());
}

describe("inline date values", () => {
  test("valid calendar dates are accepted, including leap days and the year bounds", () => {
    for (const value of ["2024-02-29", "2000-02-29", "2026-10-12", "0001-01-01", "9999-12-31"]) {
      expect(isStoredDate(value)).toBe(true);
      expect(parseStoredDate(value)).not.toBeNull();
    }
  });

  test("impossible dates, other shapes and non-strings are rejected", () => {
    const invalid: unknown[] = [
      "2023-02-29",
      "2026-02-30",
      "1900-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-10-00",
      "2026-04-31",
      "2026-2-5",
      "2026-10-12T00:00:00Z",
      "2026-10-12Z",
      "2026-10-12 ",
      " 2026-10-12",
      "0000-01-01",
      "",
      20261012,
      null,
      undefined,
      {},
    ];
    for (const value of invalid) {
      expect(isStoredDate(value)).toBe(false);
      expect(parseStoredDate(value)).toBeNull();
      expect(formatStoredDate(value)).toBe("Invalid date");
    }
  });

  test("toStoredDate returns the stored form only for a real day", () => {
    expect(toStoredDate(2026, 10, 12)).toBe("2026-10-12");
    expect(toStoredDate(2024, 2, 29)).toBe("2024-02-29");
    expect(toStoredDate(2026, 2, 30)).toBeNull();
    expect(toStoredDate(2026, 0, 1)).toBeNull();
    expect(toStoredDate(2026.5, 1, 1)).toBeNull();
  });

  test("the label is the absolute date", () => {
    expect(formatStoredDate("2026-10-12")).toBe("Oct 12, 2026");
    expect(formatStoredDate("2024-02-29")).toBe("Feb 29, 2024");
    expect(formatStoredDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  test("the calendar date round trip is the identity for every day of 2024 and 2026", () => {
    for (const year of [2024, 2026]) {
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 1; day <= 31; day += 1) {
          const stored = toStoredDate(year, month, day);
          if (stored === null) {
            continue;
          }
          const calendar = storedDateToCalendarDate(stored);
          expect(calendar).toBeInstanceOf(Date);
          expect(calendarDateToStoredDate(calendar as Date)).toBe(stored);
        }
      }
    }
  });

  test("today is the local calendar day at the day boundary", () => {
    expect(todayStoredDate(new Date(2026, 9, 12, 23, 59))).toBe("2026-10-12");
    expect(todayStoredDate(new Date(2026, 9, 13, 0, 0))).toBe("2026-10-13");
  });

  // The same assertions run in a child process per zone. The values must not move with the zone.
  for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
    test(`format, calendar round trip and today hold under TZ=${zone}`, () => {
      const result = inZone(
        zone,
        `
        const days = [];
        for (const year of [2024, 2026]) {
          for (let month = 1; month <= 12; month += 1) {
            for (let day = 1; day <= 31; day += 1) {
              const stored = m.toStoredDate(year, month, day);
              if (stored !== null && m.calendarDateToStoredDate(m.storedDateToCalendarDate(stored)) !== stored) {
                days.push(stored);
              }
            }
          }
        }
        return {
          labels: [m.formatStoredDate("2026-10-12"), m.formatStoredDate("2024-02-29"), m.formatStoredDate("2026-01-01")],
          today: [m.todayStoredDate(new Date(2026, 9, 12, 23, 59)), m.todayStoredDate(new Date(2026, 9, 13, 0, 0))],
          mismatches: days,
        };
        `,
      );

      expect(result).toEqual({
        labels: ["Oct 12, 2026", "Feb 29, 2024", "Jan 1, 2026"],
        today: ["2026-10-12", "2026-10-13"],
        mismatches: [],
      });
    });
  }
});

describe("inline date schema", () => {
  test("a valid node is accepted in every inline-capable parent", () => {
    const value: EditorValue = [
      para("p", [{ text: "a " }, date("d1", "2026-10-12"), { text: " b" }]),
      {
        type: KEYS.h1,
        id: "h",
        children: [{ text: "x " }, date("d2", "2024-02-29")],
      } as EditorValue[number],
      {
        type: KEYS.p,
        id: "li",
        listStyleType: "disc",
        indent: 1,
        children: [date("d3", "2026-01-01")],
      } as unknown as EditorValue[number],
      {
        type: KEYS.blockquote,
        id: "q",
        children: [para("qp", [date("d4", "2026-10-13")])],
      } as unknown as EditorValue[number],
      {
        type: KEYS.callout,
        id: "c",
        variant: "info",
        icon: "lightbulb",
        children: [para("cp", [date("d5", "2026-10-14")])],
      } as unknown as EditorValue[number],
      {
        type: KEYS.table,
        id: "t",
        children: [
          {
            type: KEYS.tr,
            id: "tr",
            children: [
              {
                type: KEYS.td,
                id: "td",
                children: [para("tp", [date("d6", "2026-10-15")])],
              },
            ],
          },
        ],
      } as unknown as EditorValue[number],
    ];
    expectOk(parse(value));
  });

  test("an invalid date is unsupported", () => {
    expectUnsupported(parse([para("p", [date("d1", "2026-02-30")])]));
    expectUnsupported(parse([para("p", [date("d1", "2026-10-12T00:00:00Z")])]));
  });

  test("an inline date inside a link is unsupported", () => {
    const value = [
      para("p", [
        {
          type: KEYS.link,
          id: "l",
          url: "https://example.com",
          children: [{ text: "go " }, date("d1", "2026-10-12")],
        },
      ]),
    ] as unknown as EditorValue;
    expectUnsupported(parse(value));
  });

  test("an extra attribute on the date node is unsupported", () => {
    const node = { ...(date("d1", "2026-10-12") as object), label: "Oct 12" };
    expectUnsupported(parse([para("p", [node])] as unknown as EditorValue));
  });

  test("the demo paragraph with the inline date validates", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-inline-date-line");
    expect(block).toBeDefined();
    expectOk(parse([block as EditorValue[number]]));
  });
});

describe("insertInlineDate", () => {
  test("a collapsed caret splits the text and the caret lands after the node", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select(caret([0, 0], 2));
    const id = insertInlineDate(editor, "2026-10-12");

    expect(typeof id).toBe("string");
    expect(texts(editor)).toEqual(["abcd"]);
    expect(dateNodes(editor)).toEqual([
      expect.objectContaining({ id, date: "2026-10-12", type: KEYS.date }),
    ]);
    expect(editor.selection).toEqual(caret([0, 2], 0));
  });

  test("an expanded selection is replaced by the node", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select({ anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 3 } });
    expect(insertInlineDate(editor, "2026-10-12")).not.toBeNull();
    expect(texts(editor)).toEqual(["ad"]);
    expect(dateNodes(editor)).toHaveLength(1);
  });

  test("inside a code line it returns null and changes nothing", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [{ text: "const" }] }],
      } as unknown as EditorValue[number],
    ]);
    editor.tf.select(caret([0, 0, 0], 2));
    const before = structuredClone(editor.children);
    expect(insertInlineDate(editor, "2026-10-12")).toBeNull();
    expect(editor.children).toEqual(before);
  });

  test("an invalid date or no selection returns null", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abc" }] }]);
    expect(insertInlineDate(editor, "2026-10-12")).toBeNull();
    editor.tf.select(caret([0, 0], 1));
    expect(insertInlineDate(editor, "2026-02-30")).toBeNull();
    expect(dateNodes(editor)).toHaveLength(0);
  });

  test("the command inserts one node and one undo removes it", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select(caret([0, 0], 2));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, insertTodayDate, undefined)).toBe(true);
    expect(dateNodes(editor)).toHaveLength(1);
    expect(dateNodes(editor)[0]?.date).toBe(todayStoredDate());
    expect(editor.history.undos.length).toBe(undos + 1);

    editor.tf.undo();
    expect(dateNodes(editor)).toHaveLength(0);
    expect(texts(editor)).toEqual(["abcd"]);
  });

  test("the command is refused in a code line and reports why", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [{ text: "const" }] }],
      } as unknown as EditorValue[number],
    ]);
    editor.tf.select(caret([0, 0, 0], 2));
    expect(runEditorCommand(editor, insertTodayDate, undefined)).toBe(false);
    expect(insertTodayDate.disabledReason?.(editor)).toBe("Dates are not available here.");
  });
});

describe("inline date rendering", () => {
  const value: EditorValue = [
    para("p", [
      { text: "Ship on " },
      date("d1", "2026-10-12"),
      { text: " and " },
      date("d2", "2026-02-30"),
    ]),
  ];

  function render(input: EditorValue) {
    return renderToStaticMarkup(<NotionLikeEditorStatic value={input} />);
  }

  test("the static renderer shows a time element with the absolute label", () => {
    const html = render(value);
    // React may write the attribute as dateTime. The HTML parser makes it datetime either way.
    expect(html).toMatch(/<time dateTime?="2026-10-12">Oct 12, 2026<\/time>/i);
    expect(html).toContain('data-inline-date="2026-10-12"');
    expect(html).toContain("data-inline-date-invalid");
    expect(html).toContain("Invalid date");
  });

  test("the editor and the static renderer share the chip classes", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(<EditorSurface editor={editor} readOnly placeholder="" className="editor" />);
    });
    try {
      const editorChip = host.querySelector("[data-inline-date]");
      const editorTime = host.querySelector("[data-inline-date] time");
      expect(editorTime?.getAttribute("datetime")).toBe("2026-10-12");
      expect(editorTime?.textContent).toBe("Oct 12, 2026");
      expect(host.querySelector("[data-inline-date-invalid]")?.textContent).toBe("Invalid date");

      const staticHost = document.createElement("div");
      staticHost.innerHTML = render(value);
      const staticChip = staticHost.querySelector("[data-inline-date]");
      expect(staticChip?.getAttribute("class")).toBe(editorChip?.getAttribute("class"));
      expect(staticChip?.textContent).toBe(editorChip?.textContent);
    } finally {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    }
  });
});

describe("inline date keyboard around the atom", () => {
  function atom(): EditorValue {
    return [
      para("p", [{ text: "a " }, inlineDateNode("2026-10-12", "d1"), { text: " b" }]),
    ] as EditorValue;
  }

  test("Backspace after the node removes it in one step", () => {
    const editor = createEditor(atom());
    editor.tf.select(caret([0, 2], 0));
    editor.tf.deleteBackward("character");

    expect(dateNodes(editor)).toHaveLength(0);
    expect(texts(editor)).toEqual(["a  b"]);
  });

  test("Delete before the node removes it", () => {
    const editor = createEditor(atom());
    editor.tf.select(caret([0, 0], 2));
    editor.tf.deleteForward("character");

    expect(dateNodes(editor)).toHaveLength(0);
    expect(texts(editor)).toEqual(["a  b"]);
  });

  test("the arrows cross the node within two presses", () => {
    const editor = createEditor(atom());
    editor.tf.select(caret([0, 2], 0));
    for (let press = 0; press < 2; press += 1) {
      editor.tf.move({ unit: "offset", reverse: true });
    }
    expect(editor.selection?.anchor.path).toEqual([0, 0]);

    editor.tf.select(caret([0, 0], 2));
    for (let press = 0; press < 2; press += 1) {
      editor.tf.move({ unit: "offset", reverse: false });
    }
    expect(editor.selection?.anchor.path[0]).toBe(0);
    expect(editor.selection?.anchor.path[1]).toBe(2);
  });
});

describe("inline date paste", () => {
  function paste(fragment: unknown[], selection = caret([0, 0], 0)) {
    const target = createEditor();
    target.tf.select(selection);
    target.tf.insertFragment(fragment as EditorValue);
    return target;
  }

  test("a valid date in a fragment keeps its value and gets a new id", () => {
    const source = createEditor([
      para("src", [{ text: "due " }, date("d-src", "2026-10-12"), { text: "!" }]),
    ] as EditorValue);
    source.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 2], offset: 1 } });
    const fragment = source.api.getFragment();
    const target = paste(fragment);

    const found = dateNodes(target);
    expect(found).toHaveLength(1);
    expect(found[0]?.date).toBe("2026-10-12");
    expect(found[0]?.id).not.toBe("d-src");
  });

  test("an invalid date in a fragment becomes its raw value as text", () => {
    const target = paste([para("src", [{ text: "a" }, date("bad", "2026-02-30"), { text: "b" }])]);
    expect(dateNodes(target)).toHaveLength(0);
    expect(JSON.stringify(target.children)).toContain("2026-02-30");
  });

  test("a valid date pasted into a code line becomes the formatted label", () => {
    const value = preparePastedFragment(createEditor(), [
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [
          {
            type: KEYS.codeLine,
            id: "cl",
            children: [{ text: "due " }, date("d1", "2026-10-12")],
          },
        ],
      },
    ]);

    expect(JSON.stringify(value)).not.toContain(KEYS.date);
    expect(JSON.stringify(value)).toContain('{"text":"Oct 12, 2026"}');
  });

  test("an invalid date pasted into a code line becomes its raw value", () => {
    const value = preparePastedFragment(createEditor(), [
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [date("d1", "2026-02-30")] }],
      },
    ]);
    expect(JSON.stringify(value)).not.toContain(KEYS.date);
    expect(JSON.stringify(value)).toContain("2026-02-30");
  });

  test("a foreign HTML time element becomes its visible text, not a date node", () => {
    const editor = createSlateEditor({ plugins: createEditorPlugins(), value: [] });
    editor.tf.insertFragment(
      deserializeHtmlInDom(editor, '<p>Due <time datetime="2026-10-12">Oct 12, 2026</time></p>'),
    );
    expect(dateNodes(editor)).toHaveLength(0);
    expect(JSON.stringify(editor.children)).toContain("Oct 12, 2026");
  });

  test("copying a selection with a date writes the formatted label", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [para("p", [{ text: "a " }, date("d1", "2026-10-12"), { text: " b" }])] as EditorValue,
    });
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
      );
    });
    try {
      await act(async () => {
        editor.tf.select({
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 2], offset: 2 },
        });
      });
      const written = new Map<string, string>();
      const data = {
        setData: (type: string, value: string) => {
          written.set(type, value);
        },
        getData: (type: string) => written.get(type) ?? "",
      } as unknown as DataTransfer;
      editor.tf.setFragmentData(data);
      expect(written.get("text/plain")).toBe("a Oct 12, 2026 b");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    }
  });

  test("a fragment with both an equation and a date copies both as text", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [para("p", [{ text: "a " }, date("d1", "2026-10-12"), { text: " b" }])] as EditorValue,
    });
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
      );
    });
    try {
      await act(async () => {
        editor.tf.select(caret([0, 2], 2));
        expect(insertInlineEquation(editor, "x^2")).not.toBeNull();
      });
      await act(async () => {
        editor.tf.select({
          anchor: editor.api.start([0]) ?? caret([0, 0], 0).anchor,
          focus: editor.api.end([0]) ?? caret([0, 0], 0).focus,
        });
      });
      const written = new Map<string, string>();
      const data = {
        setData: (type: string, value: string) => {
          written.set(type, value);
        },
        getData: (type: string) => written.get(type) ?? "",
      } as unknown as DataTransfer;
      editor.tf.setFragmentData(data);
      expect(written.get("text/plain")).toBe("a Oct 12, 2026 b$x^2$");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    }
  });
});
