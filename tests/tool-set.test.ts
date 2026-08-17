import test from "node:test";
import assert from "node:assert/strict";
import { stripOwnedTools } from "../src/adapter/tool-set.ts";

test("stripOwnedTools only removes the editor", () => {
	assert.deepEqual(stripOwnedTools(["read", "bash", "str_replace_editor"]), ["read", "bash"]);
});

test("stripOwnedTools preserves mounted MCP tools", () => {
	assert.deepEqual(
		stripOwnedTools(["read", "bash", "edit", "write", "str_replace_editor", "mcp__gdb_attach", "mcp__idalib_decompile"]),
		["read", "bash", "edit", "write", "mcp__gdb_attach", "mcp__idalib_decompile"],
	);
});
