import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import {
	ANCHORED_ENTRY_TYPE,
	entriesHaveAnchoredMarker,
	isAdapterPromoted,
	resyncSessionState,
} from "../src/adapter/state.ts";

function customEntry(customType: string): SessionEntry {
	return {
		type: "custom",
		customType,
		id: "m1",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
	} as SessionEntry;
}

function messageEntry(): SessionEntry {
	return {
		type: "message",
		id: "u1",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: { role: "user", content: "fix main.py" },
	} as SessionEntry;
}

function assistantEntry(id = "a1"): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: { role: "assistant", content: [{ type: "text", text: "done" }] },
	} as SessionEntry;
}

function resetBoundaryEntry(id = "r1"): SessionEntry {
	return {
		type: "reset_boundary",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
	} as SessionEntry;
}

function compactionEntry(id = "c1"): SessionEntry {
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

test("entriesHaveAnchoredMarker detects the anchored custom entry", () => {
	assert.equal(entriesHaveAnchoredMarker([]), false);
	assert.equal(entriesHaveAnchoredMarker([messageEntry()]), false);
	assert.equal(entriesHaveAnchoredMarker([customEntry("other-type")]), false);
	assert.equal(entriesHaveAnchoredMarker([customEntry(ANCHORED_ENTRY_TYPE)]), true);
	assert.equal(entriesHaveAnchoredMarker([messageEntry(), customEntry(ANCHORED_ENTRY_TYPE)]), true);
});

test("resyncSessionState restores anchored and assistant flags from entries", () => {
	const state = { anchored: false, hasAssistant: false, hasTool: false, lastBoundaryIndex: -1 };
	resyncSessionState(state, [messageEntry(), customEntry(ANCHORED_ENTRY_TYPE), assistantEntry()]);
	assert.equal(state.anchored, true);
	assert.equal(state.hasAssistant, true);
	assert.equal(state.hasTool, false);
	assert.equal(state.lastBoundaryIndex, -1);
});

test("resyncSessionState keeps live promotion flags when no new boundary appears", () => {
	const state = { anchored: true, hasAssistant: true, hasTool: true, lastBoundaryIndex: -1 };
	resyncSessionState(state, []);
	assert.equal(state.hasAssistant, true);
	assert.equal(state.hasTool, true);
	assert.equal(state.lastBoundaryIndex, -1);
});

test("resyncSessionState drops promotion flags after a new reset boundary", () => {
	const state = { anchored: true, hasAssistant: true, hasTool: true, lastBoundaryIndex: -1 };
	resyncSessionState(state, [assistantEntry(), resetBoundaryEntry()]);
	assert.equal(state.hasAssistant, false);
	assert.equal(state.hasTool, false);
	assert.equal(state.lastBoundaryIndex, 1);
});

test("resyncSessionState drops promotion flags after a new compaction boundary", () => {
	const state = { anchored: true, hasAssistant: true, hasTool: false, lastBoundaryIndex: -1 };
	resyncSessionState(state, [assistantEntry(), compactionEntry()]);
	assert.equal(state.hasAssistant, false);
	assert.equal(state.hasTool, false);
	assert.equal(state.lastBoundaryIndex, 1);
});

test("resyncSessionState drops promotion flags when the first boundary is at index 0", () => {
	const state = { anchored: true, hasAssistant: true, hasTool: true, lastBoundaryIndex: -1 };
	resyncSessionState(state, [resetBoundaryEntry()]);
	assert.equal(state.hasAssistant, false);
	assert.equal(state.hasTool, false);
	assert.equal(state.lastBoundaryIndex, 0);
});

test("resyncSessionState folds only the newest boundary", () => {
	const state = { anchored: true, hasAssistant: true, hasTool: false, lastBoundaryIndex: 0 };
	resyncSessionState(state, [resetBoundaryEntry(), assistantEntry("a1"), resetBoundaryEntry("r2")]);
	assert.equal(state.hasAssistant, false);
	assert.equal(state.hasTool, false);
	assert.equal(state.lastBoundaryIndex, 2);
});

test("resyncSessionState restores promotion flags from entries after the boundary", () => {
	const state = { anchored: true, hasAssistant: false, hasTool: false, lastBoundaryIndex: 1 };
	resyncSessionState(state, [assistantEntry(), resetBoundaryEntry(), assistantEntry("a2")]);
	assert.equal(state.hasAssistant, true);
	assert.equal(state.hasTool, false);
	assert.equal(state.lastBoundaryIndex, 1);
});

test("isAdapterPromoted: assistant or tool promotes", () => {
	assert.equal(isAdapterPromoted({ hasAssistant: false, hasTool: false }), false);
	assert.equal(isAdapterPromoted({ hasAssistant: true, hasTool: false }), true);
	assert.equal(isAdapterPromoted({ hasAssistant: false, hasTool: true }), true);
});
