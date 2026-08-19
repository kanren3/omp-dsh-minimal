import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { filterBootstrapPreludes } from "../src/adapter/context-filter.ts";

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
