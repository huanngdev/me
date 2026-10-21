import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getInstallCommand, getItemDocs, getItemSource, searchItems } from "./catalog";

/*
 * MCP tool registration. The catalog functions do the work and return plain objects; this file only
 * maps tool inputs to them and results back to MCP content. Every tool is read-only.
 */

export const INSTRUCTIONS =
  "Browse and install UI components and page blocks from huanngdev's shadcn registry (React, Tailwind CSS v4, shadcn/ui). Workflow: search_components to find an item, get_component_docs to read its usage and props, then get_install_command and run the returned command in the user's project root. Use get_component_source only when you need to read the code before installing. All tools are read-only; this server never changes the user's files.";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: false,
  idempotentHint: true,
} as const;

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

function ok(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function fail(error: string): CallToolResult {
  return { content: [{ type: "text", text: error }], isError: true };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "search_components",
    {
      title: "Search components",
      description:
        "Find components and blocks in huanngdev's registry by name or purpose. Returns each item's name, type, one-line description, docs URL and dependencies. Leave query empty to list everything (there are about a dozen items). Describe what the user wants in plain words (e.g. 'animated background', 'data table'); if nothing matches, every item is returned.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "Words to match against names, descriptions and keywords, e.g. 'table' or 'animated background'",
          ),
        type: z
          .enum(["component", "block", "all"])
          .default("all")
          .describe("Limit results to components, blocks, or both"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Maximum number of items to return (1-50)"),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of matching items to skip, for paging through results"),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => ok(searchItems(args)),
  );

  server.registerTool(
    "get_component_docs",
    {
      title: "Get component docs",
      description:
        "Read the documentation for one item: install summary, usage example, extra examples, props table and TypeScript types, as Markdown. Call this before writing code that uses the component.",
      inputSchema: z.object({
        name: z.string().describe("Item name from search_components, e.g. 'ascii-ocean'"),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ name }) => {
      const result = getItemDocs(name);
      if (!result.ok) {
        return fail(result.error);
      }
      return {
        content: [{ type: "text", text: result.markdown }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_component_source",
    {
      title: "Get component source",
      description:
        "Read the source files of one item. Without `file` it lists the files and their line counts; with `file` it returns that file in pages of lines. Large items (notion-like-editor) span many pages, so read only the files you need.",
      inputSchema: z.object({
        name: z.string().describe("Item name from search_components, e.g. 'ascii-ocean'"),
        file: z
          .string()
          .optional()
          .describe(
            "File path as listed by this tool without `file`, e.g. 'components/ascii-ocean/engine.ts'",
          ),
        startLine: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("First line to return, 1-based. Use nextStartLine from the previous page"),
        maxLines: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(400)
          .describe("Maximum number of lines to return in this page (1-1000)"),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ name, file, startLine, maxLines }) => {
      const result =
        file === undefined
          ? getItemSource({ name })
          : getItemSource({ name, file, startLine, maxLines });
      if (!result.ok) {
        return fail(result.error);
      }
      return ok(result);
    },
  );

  server.registerTool(
    "get_install_command",
    {
      title: "Get install command",
      description:
        "Get the exact shadcn CLI command that adds one or more items to the user's project, plus what it installs and any prerequisites. `commands` has the command for every package manager: pick the one matching the user's lockfile (pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lock or bun.lockb → bun, otherwise npm) and run it from the project root. The namespace form also needs the returned components.json snippet.",
      inputSchema: z.object({
        names: z
          .array(z.string())
          .min(1)
          .max(10)
          .describe("Item names from search_components, 1 to 10 of them"),
        packageManager: z
          .enum(PACKAGE_MANAGERS)
          .describe(
            "Required. Look at the user's project root first: pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lock or bun.lockb → bun, package-lock.json or no lockfile → npm",
          ),
        form: z
          .enum(["url", "namespace"])
          .default("url")
          .describe(
            "'url' installs from the registry JSON URL. 'namespace' uses the @huanngdev registry name and needs the components.json snippet",
          ),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const result = getInstallCommand(args);
      if (!result.ok) {
        return fail(result.error);
      }
      return ok(result);
    },
  );
}
