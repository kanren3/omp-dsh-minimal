import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { filterBootstrapPreludes, relocateDeferredPreludes } from "../src/adapter/context-filter.ts";

function customMessage(
	customType: string,
	attribution: "user" | "agent" = "agent",
	display = true,
): AgentMessage {
	return {
		role: "custom",
		customType,
		content: customType,
		display,
		attribution,
		timestamp: Date.now(),
	} as AgentMessage;
}

function userMessage(text: string): AgentMessage {
	return { role: "user", content: text, timestamp: Date.now() };
}

function assistantMessage(text: string): AgentMessage {
	return { role: "assistant", content: [{ type: "text", text }], timestamp: Date.now() } as AgentMessage;
}

test("drops agent-attributed custom preludes (mode contexts)", () => {
	const messages = [userMessage("hi"), customMessage("plan-mode-context", "agent")];
	assert.deepEqual(filterBootstrapPreludes(messages), [messages[0]]);
});

test("drops hidden user-attributed magic-keyword notices", () => {
	// Real values: orchestrate/workflow/ultrathink notices are attribution:"user"
	// but display:false — they guide tools outside the minimal catalog.
	const messages = [
		userMessage("hi"),
		customMessage("orchestrate-notice", "user", false),
		customMessage("ultrathink-notice", "user", false),
	];
	assert.deepEqual(filterBootstrapPreludes(messages), [messages[0]]);
});

test("keeps visible user-attributed custom messages (skill prompts)", () => {
	const messages = [userMessage("hi"), customMessage("skill-prompt", "user", true)];
	assert.equal(filterBootstrapPreludes(messages), undefined);
});

test("returns undefined when nothing is dropped", () => {
	const messages = [userMessage("hi")];
	assert.equal(filterBootstrapPreludes(messages), undefined);
});

test("drops mixed preludes while keeping user turns and visible skill prompts", () => {
	const userTurn = userMessage("hi");
	const skill = customMessage("skill-prompt", "user", true);
	const messages = [
		customMessage("plan-mode-context", "agent"),
		userTurn,
		customMessage("workflow-notice", "user", false),
		skill,
	];
	assert.deepEqual(filterBootstrapPreludes(messages), [userTurn, skill]);
});

test("relocateDeferredPreludes moves stale preludes ahead of the current user turn", () => {
	// Mirrors the promoted-request shape from a real dump: eager preludes sit
	// at their turn-1 prepend slot, ahead of the whole transcript.
	const todo = customMessage("eager-todo-prelude", "agent", false);
	const task = customMessage("eager-task-prelude", "agent", false);
	const first = userMessage("hi");
	const reply = assistantMessage("Hi!");
	const current = userMessage("write a rust helloworld");
	const messages = [todo, task, first, reply, current];
	assert.deepEqual(relocateDeferredPreludes(messages, [todo, task]), [first, reply, todo, task, current]);
});

test("relocateDeferredPreludes returns undefined when preludes already occupy the current-turn slot", () => {
	const todo = customMessage("eager-todo-prelude", "agent", false);
	const current = userMessage("hi");
	const messages = [todo, current];
	assert.equal(relocateDeferredPreludes(messages, [todo]), undefined);
});

test("relocateDeferredPreludes removes the stale copy without duplicating a fresh identical one", () => {
	const stale = customMessage("eager-todo-prelude", "agent", false);
	const fresh = customMessage("eager-todo-prelude", "agent", false);
	const first = userMessage("hi");
	const current = userMessage("again");
	const messages = [stale, first, fresh, current];
	assert.deepEqual(relocateDeferredPreludes(messages, [stale]), [first, fresh, current]);
});

test("relocateDeferredPreludes matches stashed preludes by content when identity is lost", () => {
	// Session reload rebuilds message objects; the stash holds old references.
	const persisted = customMessage("eager-todo-prelude", "agent", false);
	const stashed = customMessage("eager-todo-prelude", "agent", false);
	const first = userMessage("hi");
	const current = userMessage("later");
	const messages = [persisted, first, current];
	assert.deepEqual(relocateDeferredPreludes(messages, [stashed]), [first, stashed, current]);
});

test("relocateDeferredPreludes returns undefined when the stash is absent from the context", () => {
	// Post-compaction views drop custom entries; nothing left to move.
	const stale = customMessage("eager-todo-prelude", "agent", false);
	const messages = [userMessage("hi")];
	assert.equal(relocateDeferredPreludes(messages, [stale]), undefined);
});

test("relocateDeferredPreludes returns undefined without a user turn", () => {
	const stale = customMessage("eager-todo-prelude", "agent", false);
	assert.equal(relocateDeferredPreludes([stale], [stale]), undefined);
	assert.equal(relocateDeferredPreludes([userMessage("hi")], []), undefined);
});

test("relocateDeferredPreludes leaves unrelated custom messages at their position", () => {
	const skill = customMessage("skill-prompt", "user", true);
	const stale = customMessage("eager-todo-prelude", "agent", false);
	const first = userMessage("hi");
	const reply = assistantMessage("Hi!");
	const current = userMessage("later");
	const messages = [skill, stale, first, reply, current];
	assert.deepEqual(relocateDeferredPreludes(messages, [stale]), [skill, first, reply, stale, current]);
});

test("relocateDeferredPreludes moves a stashed prelude trailing the last user turn", () => {
	// The slot is [slotStart, lastUser); a match after the last user turn is
	// not in the slot and must still move.
	const first = userMessage("hi");
	const current = userMessage("later");
	const stale = customMessage("eager-todo-prelude", "agent", false);
	const messages = [first, current, stale];
	assert.deepEqual(relocateDeferredPreludes(messages, [stale]), [first, stale, current]);
});

test("relocateDeferredPreludes removes every identical stale copy and inserts one", () => {
	// Two epochs' preludes persisted without compaction: both stale copies
	// leave the head of history; exactly one lands in the slot.
	const staleA = customMessage("eager-todo-prelude", "agent", false);
	const staleB = customMessage("eager-todo-prelude", "agent", false);
	const first = userMessage("hi");
	const current = userMessage("later");
	const messages = [staleA, staleB, first, current];
	assert.deepEqual(relocateDeferredPreludes(messages, [staleA, staleB]), [first, staleA, current]);
});
