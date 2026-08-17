import test from "node:test";
import assert from "node:assert/strict";
import { restoreTools, stripOwnedTools } from "../src/adapter/tool-set.ts";

test("restoreTools drops str_replace_editor and keeps previous Pi tools", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write", "web_search"], ["bash", "str_replace_editor", "custom"]),
		["read", "bash", "edit", "write", "web_search", "custom"],
	);
});

test("restoreTools keeps a replacement set from another extension", () => {
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["read"]), ["read"]);
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["read", "bash"]), ["read", "bash"]);
});

test("restoreTools on a pure bootstrap set restores the snapshot", () => {
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["bash", "str_replace_editor"]), [
		"read",
		"bash",
		"edit",
		"write",
	]);
});

test("restoreTools merges a new non-bash tool into the snapshot", () => {
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["bash", "str_replace_editor", "web_search"]), [
		"read",
		"bash",
		"edit",
		"write",
		"web_search",
	]);
});

test("stripOwnedTools only removes the editor", () => {
	assert.deepEqual(stripOwnedTools(["read", "bash", "str_replace_editor"]), ["read", "bash"]);
});
