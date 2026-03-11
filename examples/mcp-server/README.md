# MCP Server Example

Demonstrates running consensus-tools as an MCP server that exposes consensus tools to LLM agents.

```ts
import { LocalBoard, createStorage } from "@consensus-tools/core";
import { McpServerAdapter } from "@consensus-tools/mcp";

const config = { /* ... */ };
const storage = createStorage(config);
await storage.init();

const board = new LocalBoard(storage, config);
const mcp = new McpServerAdapter({ board, agentId: "my-agent" });

// Register tools with your MCP server SDK
const tools = mcp.getToolDefinitions();

// Handle tool calls
async function handleToolCall(name: string, args: Record<string, unknown>) {
  return mcp.callTool(name, args);
}
```
