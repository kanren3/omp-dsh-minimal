import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { partitionBootstrapPreludes } from "../src/adapter/context-filter.ts";

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

test("partition splits both injected preludes by customType", () => {
	const { kept, dropped } = partitionBootstrapPreludes([userMessage, todoPrelude, taskPrelude, otherCustom]);
	assert.deepEqual(kept, [userMessage, otherCustom]);
	assert.deepEqual(dropped, [todoPrelude, taskPrelude]);
});

test("partition keeps non-prelude custom messages and user turns", () => {
	const messages = [userMessage, otherCustom];
	const { kept, dropped } = partitionBootstrapPreludes(messages);
	assert.deepEqual(kept, messages);
	assert.deepEqual(dropped, []);
});

test("partition without preludes returns no dropped", () => {
	const messages = [userMessage];
	const { kept, dropped } = partitionBootstrapPreludes(messages);
	assert.deepEqual(kept, messages);
	assert.deepEqual(dropped, []);
});

test("partition keeps arbitrary custom messages intact", () => {
	const messages = [userMessage, otherCustom, todoPrelude];
	const { kept, dropped } = partitionBootstrapPreludes(messages);
	assert.deepEqual(kept, [userMessage, otherCustom]);
	assert.deepEqual(dropped, [todoPrelude]);
});
