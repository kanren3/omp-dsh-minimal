import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { isPromoted, latestBoundaryIndex, scanSessionPhase } from "../src/adapter/promotion.ts";

function user(id: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: { role: "user", content: text },
	} as SessionEntry;
}

function assistant(id: string, withTool = false): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: {
			role: "assistant",
			content: withTool
				? [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } }]
				: [{ type: "text", text: "done" }],
		},
	} as SessionEntry;
}

function toolResult(id: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: { role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "ok" }] },
	} as SessionEntry;
}

function compact(id: string): SessionEntry {
	return {
		type: "compaction",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		summary: "summary",
		firstKeptEntryId: id,
		tokensBefore: 100,
	} as SessionEntry;
}

test("empty session is unpromoted", () => {
	const scan = scanSessionPhase([]);
	assert.equal(scan.promoted, false);
	assert.equal(scan.hasAssistant, false);
	assert.equal(scan.hasTool, false);
});

test("first user message alone does not promote", () => {
	const scan = scanSessionPhase([user("u1", "fix main.py")]);
	assert.equal(scan.promoted, false);
});

test("an assistant message promotes", () => {
	const scan = scanSessionPhase([user("u1", "fix main.py"), assistant("a1")]);
	assert.equal(scan.promoted, true);
	assert.equal(scan.hasAssistant, true);
	assert.equal(scan.hasTool, false);
});

test("a tool result promotes", () => {
	const scan = scanSessionPhase([user("u1", "fix"), assistant("a1", true), toolResult("t1")]);
	assert.equal(scan.promoted, true);
	assert.equal(scan.hasTool, true);
});

test("an assistant tool call sets hasTool", () => {
	const scan = scanSessionPhase([user("u1", "fix"), assistant("a1", true)]);
	assert.equal(scan.hasAssistant, true);
	assert.equal(scan.hasTool, true);
});

test("compaction starts a new epoch", () => {
	const scan = scanSessionPhase([user("u1", "old"), assistant("a1"), compact("c1"), user("u2", "continue")]);
	assert.equal(scan.promoted, false);
	assert.equal(scan.hasAssistant, false);
	assert.equal(scan.hasTool, false);
});

test("isPromoted is either-signal", () => {
	assert.equal(isPromoted(true, false), true);
	assert.equal(isPromoted(false, true), true);
	assert.equal(isPromoted(false, false), false);
});

function resetBoundary(id: string): SessionEntry {
	return {
		type: "reset_boundary",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
	} as SessionEntry;
}

function branchSummary(id: string): SessionEntry {
	return {
		type: "branch_summary",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		fromId: "a1",
		summary: "summarized",
	} as SessionEntry;
}

test("/clear (reset_boundary) starts a new epoch", () => {
	const scan = scanSessionPhase([user("u1", "old"), assistant("a1"), resetBoundary("r1"), user("u2", "continue")]);
	assert.equal(scan.promoted, false);
	assert.equal(scan.hasAssistant, false);
});

test("branch_summary does not cut the promotion window", () => {
	const scan = scanSessionPhase([user("u1", "old"), assistant("a1"), branchSummary("b1"), user("u2", "continue")]);
	assert.equal(scan.promoted, true);
});

test("latestBoundaryIndex is -1 when no boundary exists", () => {
	assert.equal(latestBoundaryIndex([]), -1);
	assert.equal(latestBoundaryIndex([user("u1", "fix"), assistant("a1")]), -1);
});

test("latestBoundaryIndex returns the last compaction or reset boundary", () => {
	assert.equal(latestBoundaryIndex([compact("c1"), resetBoundary("r1")]), 1);
	assert.equal(latestBoundaryIndex([resetBoundary("r1"), compact("c2"), branchSummary("b1")]), 1);
});

test("latestBoundaryIndex ignores branch_summary entries", () => {
	assert.equal(latestBoundaryIndex([branchSummary("b1"), assistant("a1")]), -1);
});
