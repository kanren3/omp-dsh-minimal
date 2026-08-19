import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { filterBootstrapPreludes } from "../src/adapter/context-filter.ts";

function customMessage(customType: string): AgentMessage {
	return {
		role: "custom",
		customType,
		content: customType,
		display: false,
		timestamp: Date.now(),
	} as AgentMessage;
}

const todoPrelude = customMessage("eager-todo-prelude");
const taskPrelude = customMessage("eager-task-prelude");
const otherCustom = customMessage("orchestrate-notice");
const userMessage: AgentMessage = {
	role: "user",
	content: "hi",
	timestamp: Date.now(),
};

test("bootstrap drops both injected preludes by customType", () => {
	const filtered = filterBootstrapPreludes([userMessage, todoPrelude, taskPrelude, otherCustom], false);
	assert.deepEqual(filtered, [userMessage, otherCustom]);
});

test("bootstrap keeps non-prelude custom messages and user turns", () => {
	const filtered = filterBootstrapPreludes([userMessage, otherCustom], false);
	assert.deepEqual(filtered, [userMessage, otherCustom]);
});

test("promoted keeps the preludes for the full tool set", () => {
	const messages = [userMessage, todoPrelude, taskPrelude];
	const filtered = filterBootstrapPreludes(messages, true);
	assert.deepEqual(filtered, messages);
});

test("no change returns the original array reference", () => {
	const messages = [userMessage, otherCustom];
	assert.equal(filterBootstrapPreludes(messages, false), messages);
	assert.equal(filterBootstrapPreludes(messages, true), messages);
});
