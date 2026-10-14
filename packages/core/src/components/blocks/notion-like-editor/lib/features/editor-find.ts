import { ElementApi, TextApi, type Point, type SlateEditor, type TElement } from "platejs";

type FindOptions = { matchCase: boolean };
export type FindMatch = { anchor: Point; focus: Point };
export type FindResult = { matches: FindMatch[]; truncated: boolean };

export const FIND_QUERY_MAX = 200;
export const FIND_MATCH_MAX = 1000;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Cuts to a code-unit limit without leaving the high half of a surrogate pair at the end.
export function truncateUnits(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }

  const last = text.charCodeAt(max - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? max - 1 : max;
  return text.slice(0, end);
}

export function normalizeFindQuery(raw: string): string {
  return truncateUnits(raw.normalize("NFC"), FIND_QUERY_MAX);
}

function foldText(text: string, matchCase: boolean): string {
  const normalized = text.normalize("NFC");
  return matchCase ? normalized : normalized.toLowerCase();
}

type Leaf = { path: number[]; text: string };

// Text leaves of one block in document order. A void inline ends the run, and its content is skipped.
function blockRuns(editor: SlateEditor, block: TElement, blockPath: number[]): Leaf[][] {
  const runs: Leaf[][] = [];
  let run: Leaf[] = [];
  const visit = (element: TElement, path: number[]): void => {
    element.children.forEach((child, index) => {
      const childPath = [...path, index];
      if (TextApi.isText(child)) {
        run.push({ path: childPath, text: child.text });
        return;
      }

      if (editor.api.isVoid(child)) {
        if (run.length > 0) {
          runs.push(run);
        }
        run = [];
        return;
      }

      visit(child, childPath);
    });
  };

  visit(block, blockPath);
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

// A text block is the lowest block element whose children are only text and inline elements.
function textBlocks(editor: SlateEditor): [TElement, number[]][] {
  const found: [TElement, number[]][] = [];
  const visit = (nodes: TElement["children"], parentPath: number[]): void => {
    nodes.forEach((node, index) => {
      if (!ElementApi.isElement(node) || editor.api.isVoid(node)) {
        return;
      }

      const path = [...parentPath, index];
      const inlineOnly = node.children.every(
        (child) =>
          TextApi.isText(child) || (ElementApi.isElement(child) && editor.api.isInline(child)),
      );
      if (inlineOnly) {
        found.push([node, path]);
        return;
      }

      visit(node.children, path);
    });
  };

  visit(editor.children, []);
  return found;
}

type FoldedRun = {
  folded: string;
  // For each folded code unit, the index of the grapheme it came from.
  owner: number[];
  // Original offsets of each grapheme inside the run text.
  spans: { start: number; end: number }[];
};

function foldRun(text: string, matchCase: boolean): FoldedRun {
  let folded = "";
  const owner: number[] = [];
  const spans: { start: number; end: number }[] = [];
  for (const { segment, index } of graphemes.segment(text)) {
    const id = spans.length;
    spans.push({ start: index, end: index + segment.length });
    const part = foldText(segment, matchCase);
    folded += part;
    for (let unit = 0; unit < part.length; unit += 1) {
      owner.push(id);
    }
  }
  return { folded, owner, spans };
}

// Converts a run offset to a leaf point. A start on a boundary lands in the later leaf,
// an end on a boundary lands in the earlier leaf.
function pointAt(
  run: Leaf[],
  starts: number[],
  offset: number,
  edge: "start" | "end",
): Point | undefined {
  for (let index = 0; index < run.length; index += 1) {
    const leaf = run[index];
    const begin = starts[index];
    if (leaf === undefined || begin === undefined) {
      continue;
    }

    const end = begin + leaf.text.length;
    const inside =
      edge === "start" ? begin <= offset && offset < end : begin < offset && offset <= end;
    if (inside) {
      return { path: leaf.path, offset: offset - begin };
    }
  }
  return undefined;
}

function searchRun(run: Leaf[], target: string, matchCase: boolean): FindMatch[] {
  const text = run.map((leaf) => leaf.text).join("");
  const starts: number[] = [];
  let offset = 0;
  for (const leaf of run) {
    starts.push(offset);
    offset += leaf.text.length;
  }

  const { folded, owner, spans } = foldRun(text, matchCase);
  const found: FindMatch[] = [];
  let from = 0;
  while (from <= folded.length - target.length) {
    const hit = folded.indexOf(target, from);
    if (hit < 0) {
      break;
    }

    const last = hit + target.length - 1;
    const startsGrapheme = hit === 0 || owner[hit - 1] !== owner[hit];
    const endsGrapheme = last === folded.length - 1 || owner[last + 1] !== owner[last];
    if (!startsGrapheme || !endsGrapheme) {
      from = hit + 1;
      continue;
    }

    const first = spans[owner[hit] ?? -1];
    const final = spans[owner[last] ?? -1];
    const anchor = first === undefined ? undefined : pointAt(run, starts, first.start, "start");
    const focus = final === undefined ? undefined : pointAt(run, starts, final.end, "end");
    if (anchor !== undefined && focus !== undefined) {
      found.push({ anchor, focus });
    }
    from = last + 1;
  }
  return found;
}

export function findMatches(editor: SlateEditor, query: string, options: FindOptions): FindResult {
  const needle = normalizeFindQuery(query);
  if (needle.length === 0) {
    return { matches: [], truncated: false };
  }

  const target = foldText(needle, options.matchCase);
  const matches: FindMatch[] = [];
  for (const [block, blockPath] of textBlocks(editor)) {
    for (const run of blockRuns(editor, block, blockPath)) {
      for (const found of searchRun(run, target, options.matchCase)) {
        if (matches.length === FIND_MATCH_MAX) {
          return { matches, truncated: true };
        }
        matches.push(found);
      }
    }
  }
  return { matches, truncated: false };
}
