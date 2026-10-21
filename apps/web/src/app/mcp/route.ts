import { createMcpHandler } from "mcp-handler";

import { INSTRUCTIONS, registerTools } from "@/lib/mcp/server";

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "huanngdev", version: "0.1.0" },
  instructions: INSTRUCTIONS,
});

export { handler as GET, handler as POST };
