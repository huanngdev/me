export type TreemapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WeightedItem = {
  index: number;
  area: number;
};

const EMPTY_RECT: TreemapRect = { x: 0, y: 0, width: 0, height: 0 };

export function toPercentages(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((value) => (Math.max(value, 0) / total) * 100);
}

export function squarify(values: number[], width: number, height: number): TreemapRect[] {
  const rects = values.map(() => ({ ...EMPTY_RECT }));
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0);
  if (total <= 0 || width <= 0 || height <= 0) return rects;

  const scale = (width * height) / total;
  const items: WeightedItem[] = values
    .map((value, index) => ({ index, area: Math.max(value, 0) * scale }))
    .filter((item) => item.area > 0)
    .sort((a, b) => b.area - a.area);

  let frame = { x: 0, y: 0, width, height };
  let row: WeightedItem[] = [];
  let cursor = 0;

  while (cursor < items.length) {
    const item = items[cursor];
    if (!item) break;

    if (row.length === 0) {
      row.push(item);
      cursor += 1;
      continue;
    }

    const side = Math.min(frame.width, frame.height);
    const currentWorst = worstAspectRatio(
      row.map((entry) => entry.area),
      side,
    );
    const nextWorst = worstAspectRatio([...row.map((entry) => entry.area), item.area], side);

    if (nextWorst <= currentWorst) {
      row.push(item);
      cursor += 1;
      continue;
    }

    frame = placeRow(row, frame, rects);
    row = [];
  }

  if (row.length > 0) placeRow(row, frame, rects);

  return rects;
}

function worstAspectRatio(areas: number[], side: number): number {
  const rowArea = areas.reduce((sum, area) => sum + area, 0);
  if (rowArea <= 0 || side <= 0) return Number.POSITIVE_INFINITY;

  const thickness = rowArea / side;
  let worst = 1;

  for (const area of areas) {
    const length = area / thickness;
    if (length <= 0) return Number.POSITIVE_INFINITY;
    worst = Math.max(worst, thickness / length, length / thickness);
  }

  return worst;
}

function placeRow(row: WeightedItem[], frame: TreemapRect, rects: TreemapRect[]): TreemapRect {
  const rowArea = row.reduce((sum, item) => sum + item.area, 0);
  const horizontal = frame.width >= frame.height;
  const side = horizontal ? frame.height : frame.width;
  const thickness = rowArea / side;
  let offset = 0;

  for (const item of row) {
    const length = item.area / thickness;
    rects[item.index] = horizontal
      ? { x: frame.x, y: frame.y + offset, width: thickness, height: length }
      : { x: frame.x + offset, y: frame.y, width: length, height: thickness };
    offset += length;
  }

  return horizontal
    ? {
        x: frame.x + thickness,
        y: frame.y,
        width: Math.max(frame.width - thickness, 0),
        height: frame.height,
      }
    : {
        x: frame.x,
        y: frame.y + thickness,
        width: frame.width,
        height: Math.max(frame.height - thickness, 0),
      };
}
