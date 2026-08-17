import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { ANCHORED_ENTRY_TYPE, entriesHaveAnchoredMarker } from "../src/adapter/state.ts";

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

test("entriesHaveAnchoredMarker detects the anchored custom entry", () => {
	assert.equal(entriesHaveAnchoredMarker([]), false);
	assert.equal(entriesHaveAnchoredMarker([messageEntry()]), false);
	assert.equal(entriesHaveAnchoredMarker([customEntry("other-type")]), false);
	assert.equal(entriesHaveAnchoredMarker([customEntry(ANCHORED_ENTRY_TYPE)]), true);
	assert.equal(entriesHaveAnchoredMarker([messageEntry(), customEntry(ANCHORED_ENTRY_TYPE)]), true);
});
