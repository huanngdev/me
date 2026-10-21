/*
 * Smoke test for the hosted MCP endpoint. Speaks JSON-RPC over Streamable HTTP with plain fetch.
 *
 * Usage: bun run mcp:smoke [url]   (default http://localhost:3000/mcp)
 * Exits 1 if any step fails.
 */

const DEFAULT_URL = "http://localhost:3000/mcp";
const url = process.argv[2] ?? DEFAULT_URL;
const PROTOCOL_VERSION = "2025-06-18";
const EXPECTED_TOOLS = [
  "get_component_docs",
  "get_component_source",
  "get_install_command",
  "search_components",
];

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

type ToolResult = {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

let nextId = 1;
let sessionId: string | undefined;
let protocolVersion: string | undefined;
let failures = 0;

function parseSse(text: string): JsonRpcMessage[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length).trim()) as JsonRpcMessage);
}

async function rpc(
  method: string,
  params?: unknown,
  notification = false,
): Promise<{ status: number; message?: JsonRpcMessage }> {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params !== undefined) {
    body.params = params;
  }
  let id: number | undefined;
  if (!notification) {
    id = nextId++;
    body.id = id;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (protocolVersion !== undefined) {
    headers["mcp-protocol-version"] = protocolVersion;
  }
  if (sessionId !== undefined) {
    headers["mcp-session-id"] = sessionId;
  }

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const issuedSession = response.headers.get("mcp-session-id");
  if (issuedSession !== null) {
    sessionId = issuedSession;
  }
  if (notification) {
    return { status: response.status };
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const messages: JsonRpcMessage[] = contentType.includes("text/event-stream")
    ? parseSse(text)
    : [JSON.parse(text) as JsonRpcMessage];
  return { status: response.status, message: messages.find((message) => message.id === id) };
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** The result of a successful JSON-RPC call. Throws on a JSON-RPC error. */
function resultOf(message: JsonRpcMessage | undefined): unknown {
  expect(message !== undefined, "no JSON-RPC response");
  if (message.error !== undefined) {
    throw new Error(`JSON-RPC error ${message.error.code}: ${message.error.message}`);
  }
  return message.result;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { message } = await rpc("tools/call", { name, arguments: args });
  return resultOf(message) as ToolResult;
}

async function step(label: string, run: () => Promise<string | undefined>): Promise<void> {
  try {
    const detail = await run();
    console.log(`✓ ${label}${detail === undefined ? "" : ` (${detail})`}`);
  } catch (error) {
    failures += 1;
    console.log(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`MCP smoke test: ${url}`);

await step("initialize", async () => {
  const { message } = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "mcp-smoke", version: "1.0.0" },
  });
  const result = resultOf(message) as { protocolVersion?: string; serverInfo?: { name: string } };
  expect(typeof result.protocolVersion === "string", "result has no protocolVersion");
  protocolVersion = result.protocolVersion;
  return `protocol ${result.protocolVersion}, server ${result.serverInfo?.name ?? "unknown"}`;
});

await step("notifications/initialized", async () => {
  const { status } = await rpc("notifications/initialized", undefined, true);
  expect(status === 200 || status === 202, `unexpected HTTP status ${status}`);
  return `HTTP ${status}`;
});

await step("tools/list", async () => {
  const { message } = await rpc("tools/list", {});
  const result = resultOf(message) as { tools: { name: string }[] };
  const names = result.tools.map((tool) => tool.name).sort();
  expect(
    JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
    `expected ${EXPECTED_TOOLS.join(", ")}; got ${names.join(", ")}`,
  );
  return names.join(", ");
});

await step("search_components {query: ocean}", async () => {
  const result = await callTool("search_components", { query: "ocean" });
  expect(!result.isError, result.content[0]?.text ?? "isError");
  const items = (result.structuredContent?.items ?? []) as { name: string }[];
  expect(items[0]?.name === "ascii-ocean", `first item is ${items[0]?.name ?? "none"}`);
  return `first: ${items[0]?.name}`;
});

await step("get_component_docs {name: ascii-ocean}", async () => {
  const result = await callTool("get_component_docs", { name: "ascii-ocean" });
  expect(!result.isError, result.content[0]?.text ?? "isError");
  const text = result.content[0]?.text ?? "";
  expect(text.includes("## Props"), "markdown has no ## Props section");
  return `${text.length} chars`;
});

await step("get_component_source {name: notion-like-editor} lists files", async () => {
  const result = await callTool("get_component_source", { name: "notion-like-editor" });
  expect(!result.isError, result.content[0]?.text ?? "isError");
  const files = (result.structuredContent?.files ?? []) as { file: string; lines: number }[];
  expect(files.length > 0, "no files listed");
  return `${files.length} files`;
});

await step("get_component_source one page of the first file (maxLines 50)", async () => {
  const listing = await callTool("get_component_source", { name: "notion-like-editor" });
  const files = (listing.structuredContent?.files ?? []) as { file: string }[];
  const first = files[0];
  expect(first !== undefined, "no first file");
  const result = await callTool("get_component_source", {
    name: "notion-like-editor",
    file: first.file,
    startLine: 1,
    maxLines: 50,
  });
  expect(!result.isError, result.content[0]?.text ?? "isError");
  const page = result.structuredContent as { content: string; hasMore: boolean } | undefined;
  expect(page !== undefined, "no structured page");
  const lineCount = page.content.split("\n").length;
  expect(lineCount <= 50, `page has ${lineCount} lines`);
  expect(page.hasMore === true, "hasMore is not true");
  return `${first.file}, ${lineCount} lines, hasMore`;
});

await step("get_install_command {names: [ascii-ocean]}", async () => {
  const result = await callTool("get_install_command", {
    names: ["ascii-ocean"],
    packageManager: "npm",
  });
  expect(!result.isError, result.content[0]?.text ?? "isError");
  const command = result.structuredContent?.command;
  expect(
    command === "npx shadcn@latest add https://www.huanngdev.site/r/ascii-ocean.json",
    `command is ${String(command)}`,
  );
  return String(command);
});

await step("error case: get_component_docs {name: nope} returns isError", async () => {
  const result = await callTool("get_component_docs", { name: "nope" });
  expect(result.isError === true, "isError is not true");
  return result.content[0]?.text;
});

console.log(failures === 0 ? "All checks passed." : `${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
