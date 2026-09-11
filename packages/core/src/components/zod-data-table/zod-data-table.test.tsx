import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";

import {
  formatZodDataTableValue,
  humanizeColumnKey,
  ZodDataTable,
  type ZodDataTableColumns,
} from "./zod-data-table";

const userSchema = z.object({
  firstName: z.string(),
  email: z.email().meta({ title: "Email address" }),
  active: z.boolean(),
  profile: z.object({ role: z.string() }),
  tags: z.array(z.string()),
  createdAt: z.date(),
  note: z.string().nullable(),
});

type User = z.output<typeof userSchema>;

const user: User = {
  firstName: "Ada",
  email: "ada@example.com",
  active: true,
  profile: { role: "Engineer" },
  tags: ["typescript", "react"],
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
  note: null,
};

describe("ZodDataTable", () => {
  test("humanizes schema keys", () => {
    expect(humanizeColumnKey("firstName")).toBe("First Name");
    expect(humanizeColumnKey("last_seen-at")).toBe("Last Seen At");
  });

  test("formats supported values consistently", () => {
    expect(formatZodDataTableValue(null)).toBe("—");
    expect(formatZodDataTableValue(true)).toBe("true");
    expect(formatZodDataTableValue(new Date("2026-09-10T00:00:00.000Z"))).toBe(
      "2026-09-10T00:00:00.000Z",
    );
    expect(formatZodDataTableValue(["a", "b"])).toBe('["a","b"]');
    expect(formatZodDataTableValue({ role: "Engineer" })).toBe('{"role":"Engineer"}');
  });

  test("keeps schema order and reads metadata titles", () => {
    const html = renderToStaticMarkup(<ZodDataTable schema={userSchema} data={[user]} />);

    expect(html.indexOf("First Name")).toBeLessThan(html.indexOf("Email address"));
    expect(html.indexOf("Email address")).toBeLessThan(html.indexOf("Active"));
    expect(html).toContain("[&quot;typescript&quot;,&quot;react&quot;]");
    expect(html).toContain("{&quot;role&quot;:&quot;Engineer&quot;}");
    expect(html).toContain("2026-09-10T00:00:00.000Z");
    expect(html).toContain("—");
  });

  test("applies typed column overrides and hides fields", () => {
    const columns = {
      email: {
        header: "Contact",
        cell: ({ value, row, rowIndex }) => `${rowIndex}:${row.firstName}:${value}`,
      },
      active: { hidden: true },
    } satisfies ZodDataTableColumns<User>;
    const html = renderToStaticMarkup(
      <ZodDataTable schema={userSchema} data={[user]} columns={columns} />,
    );

    expect(html).toContain("Contact");
    expect(html).toContain("0:Ada:ada@example.com");
    expect(html).not.toContain(">Active<");
  });

  test("renders empty data and all-hidden states", () => {
    const emptyHtml = renderToStaticMarkup(
      <ZodDataTable schema={userSchema} data={[]} emptyMessage="Nothing here." />,
    );
    const hiddenHtml = renderToStaticMarkup(
      <ZodDataTable
        schema={z.object({ id: z.string() })}
        data={[]}
        columns={{ id: { hidden: true } }}
      />,
    );

    expect(emptyHtml).toContain("Nothing here.");
    expect(hiddenHtml).toContain("No columns to display.");
  });

  test("rejects column keys that are not in the schema", () => {
    const invalidColumns: ZodDataTableColumns<User> = {
      // @ts-expect-error Unknown schema fields are not valid column overrides.
      missing: {},
    };

    expect(invalidColumns).toBeDefined();
  });
});
