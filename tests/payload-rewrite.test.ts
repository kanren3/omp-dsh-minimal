import test from "node:test";
import assert from "node:assert/strict";
import {
	applyDeferredToolChoice,
	bootstrapDroppedToolChoice,
	extractRequestSurface,
	rewriteProviderRequest,
} from "../src/adapter/payload-rewrite.ts";
import {
	DSH_BASH_PARAMETERS,
	DSH_STR_REPLACE_EDITOR_PARAMETERS,
	MINIMAL_BASH_DESCRIPTION,
	MINIMAL_PROMPT,
	STR_REPLACE_EDITOR_DESCRIPTION,
} from "../src/dsh/official.ts";

const rewriteMinimalProviderRequest = (payload: unknown) =>
	rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });

test("rewriteMinimalProviderRequest replaces chat-completions tools and system message", () => {
	const rewritten = rewriteMinimalProviderRequest({
		model: "deepseek-v4-pro",
		messages: [
			{ role: "system", content: "You are Pi, a coding agent with many tools." },
			{ role: "user", content: "hi" },
		],
		tools: [
			{
				type: "function",
				function: {
					name: "read",
					description: "Read a file",
					parameters: { type: "object", properties: {} },
					strict: false,
				},
			},
		],
	});
	const surface = extractRequestSurface(rewritten);
	assert.equal(surface.system, MINIMAL_PROMPT);
	assert.deepEqual(surface.toolNames, ["bash", "str_replace_editor"]);
	assert.deepEqual(surface.tools, [
		{
			type: "function",
			function: {
				name: "bash",
				description: MINIMAL_BASH_DESCRIPTION,
				parameters: DSH_BASH_PARAMETERS,
			},
		},
		{
			type: "function",
			function: {
				name: "str_replace_editor",
				description: STR_REPLACE_EDITOR_DESCRIPTION,
				parameters: DSH_STR_REPLACE_EDITOR_PARAMETERS,
			},
		},
	]);
	assert.equal(JSON.stringify(surface.tools).includes("strict"), false);
	assert.equal(JSON.stringify(surface.tools).includes("additionalProperties"), false);
});

test("mutates the payload in place so hosts ignoring the hook return still see changes", () => {
	const systemPart = { type: "text", text: "Pi default prompt" };
	const systemMessage = { role: "system", content: [systemPart] };
	const userMessage = { role: "user", content: "hi" };
	const payload = {
		messages: [systemMessage, userMessage],
		tools: [{ type: "function", function: { name: "read" } }],
	};
	const rewritten = rewriteMinimalProviderRequest(payload);

	assert.equal(rewritten, payload);
	assert.equal(payload.messages[0], systemMessage);
	assert.equal(systemMessage.content[0], systemPart);
	assert.equal(systemPart.text, MINIMAL_PROMPT);
	assert.equal(payload.messages[1], userMessage);
});

test("mutates the Responses-format instructions field in place", () => {
	const payload = { instructions: "Pi default prompt", input: [{ role: "user", content: "hi" }] };
	const rewritten = rewriteMinimalProviderRequest(payload);

	assert.equal(rewritten, payload);
	assert.equal(payload.instructions, MINIMAL_PROMPT);
});

// Reasoning models on OpenAI-compatible endpoints carry the instruction as a
// `developer` message instead of `system`; rewriteMessages must treat it the
// same way (first-match, in place).
test("mutates the first developer message in place", () => {
	const systemPart = { type: "text", text: "Pi default prompt" };
	const devMessage = { role: "developer", content: [systemPart] };
	const userMessage = { role: "user", content: "hi" };
	const payload = { messages: [devMessage, userMessage] };
	const rewritten = rewriteMinimalProviderRequest(payload);

	assert.equal(rewritten, payload);
	assert.equal(payload.messages[0], devMessage);
	assert.equal(systemPart.text, MINIMAL_PROMPT);
});

// A multi-part content array (e.g. Anthropic system blocks: billing header +
// instruction) cannot keep its identity by mutating a single text part, so
// the whole slot is replaced with the persona string.
test("replaces a multi-part system array with the persona string", () => {
	const payload = {
		system: [
			{ type: "text", text: "billing header" },
			{ type: "text", text: "Pi default prompt" },
		],
	};
	const rewritten = rewriteMinimalProviderRequest(payload);

	assert.equal(rewritten, payload);
	assert.equal(payload.system, MINIMAL_PROMPT);
});

// Only the first system/developer message is rewritten; a second one is left
// untouched so the host's mid-conversation system turns survive intact.
test("rewrites only the first system or developer message", () => {
	const firstPart = { type: "text", text: "Pi default prompt" };
	const secondPart = { type: "text", text: "keep me" };
	const payload = {
		messages: [
			{ role: "system", content: [firstPart] },
			{ role: "system", content: [secondPart] },
		],
	};
	const rewritten = rewriteMinimalProviderRequest(payload);

	assert.equal(firstPart.text, MINIMAL_PROMPT);
	assert.equal(secondPart.text, "keep me");
	assert.equal(rewritten, payload);
});

test("bootstrap drops a named pin outside the minimal catalog", () => {
	const payload = {
		tool_choice: { type: "function", name: "todo" },
		tools: [{ type: "function", function: { name: "read" } }],
	};
	rewriteMinimalProviderRequest(payload);
	assert.equal("tool_choice" in payload, false);
});

test("bootstrap keeps open choices and pins on the bootstrap pair", () => {
	const openPayload = { tool_choice: "auto", tools: [{ type: "function", function: { name: "read" } }] };
	rewriteMinimalProviderRequest(openPayload);
	assert.equal(openPayload.tool_choice, "auto");

	const bashPayload = { tool_choice: { type: "function", name: "bash" }, tools: [] };
	rewriteMinimalProviderRequest(bashPayload);

	// OpenAI Completions wire format: { type: "function", function: { name } }
	const nestedBash = { tool_choice: { type: "function", function: { name: "bash" } }, tools: [] };
	rewriteMinimalProviderRequest(nestedBash);
	assert.deepEqual(nestedBash.tool_choice, { type: "function", function: { name: "bash" } });
});

test("bootstrapDroppedToolChoice returns the outside-catalog pin", () => {
	const pin = { type: "function", name: "todo" };
	assert.deepEqual(bootstrapDroppedToolChoice(pin), pin);
});

test("bootstrapDroppedToolChoice ignores open choices and catalog pins", () => {
	assert.equal(bootstrapDroppedToolChoice({ type: "function", name: "bash" }), undefined);
	assert.equal(bootstrapDroppedToolChoice("auto"), undefined);
	assert.equal(bootstrapDroppedToolChoice(undefined), undefined);
});

test("applyDeferredToolChoice applies a pin when the request has none", () => {
	const payload: Record<string, unknown> = { tools: [] };
	const pin = { type: "function", name: "todo" };
	assert.equal(applyDeferredToolChoice(payload, pin), true);
	assert.deepEqual(payload.tool_choice, pin);
});

test("applyDeferredToolChoice leaves an existing tool_choice untouched", () => {
	const payload: Record<string, unknown> = { tool_choice: "auto" };
	assert.equal(applyDeferredToolChoice(payload, { type: "function", name: "todo" }), false);
	assert.equal(payload.tool_choice, "auto");
});

test("bootstrap drop then promoted apply round-trips the pin", () => {
	const bootstrap = {
		system: "Pi default prompt",
		tool_choice: { type: "function", name: "todo" },
		tools: [{ type: "function", function: { name: "read" } }],
	};
	const deferred = bootstrapDroppedToolChoice(bootstrap.tool_choice);
	rewriteMinimalProviderRequest(bootstrap);
	assert.equal("tool_choice" in bootstrap, false);

	const promoted: Record<string, unknown> = { system: "Pi default prompt" };
	assert.equal(applyDeferredToolChoice(promoted, deferred), true);
	assert.deepEqual(promoted.tool_choice, { type: "function", name: "todo" });
});

test("rewriteMinimalProviderRequest maps Anthropic-style tool schemas", () => {
	const rewritten = rewriteMinimalProviderRequest({
		system: "Pi default prompt",
		tools: [{ name: "read", description: "x", input_schema: { type: "object" } }],
	});
	assert.equal((rewritten as { system: string }).system, MINIMAL_PROMPT);
	const tools = (rewritten as { tools: Array<{ name: string; input_schema: unknown }> }).tools;
	assert.deepEqual(
		tools.map((tool) => tool.name),
		["bash", "str_replace_editor"],
	);
	assert.deepEqual(tools[0]?.input_schema, DSH_BASH_PARAMETERS);
});

test("does not rewrite compaction summarization payloads", () => {
	const payload = {
		system: "You are a context summarization assistant. Your task is to read a conversation.",
		messages: [
			{
				role: "user",
				content: "<conversation>\nold turn\n</conversation>\n\nSummarize.",
			},
		],
		tools: [{ type: "function", function: { name: "read" } }],
	};
	const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
	assert.equal(rewritten, payload);
	assert.equal((rewritten as { system: string }).system.includes("context summarization assistant"), true);
});

test("does not rewrite a compaction user turn even without the summarization system string", () => {
	const payload = {
		messages: [
			{
				role: "user",
				content: "<conversation>\nhi\n</conversation>\n<previous-summary>\nprior\n</previous-summary>",
			},
		],
	};
	const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
	assert.equal(rewritten, payload);
});

test("promoted Pro can keep AGENTS.md after the official persona", () => {
	const persona = `${MINIMAL_PROMPT}\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n<project_instructions path="/proj/AGENTS.md">\nUse bun.\n</project_instructions>\n\n</project_context>\n`;
	const rewritten = rewriteProviderRequest(
		{
			system: "Pi default prompt",
			tools: [{ type: "function", function: { name: "read", parameters: { type: "object" } } }],
		},
		{ persona, rewriteTools: false },
	);
	const surface = extractRequestSurface(rewritten);
	assert.ok(surface.system?.startsWith(MINIMAL_PROMPT));
	assert.match(surface.system ?? "", /<project_instructions path="\/proj\/AGENTS\.md">/);
	assert.deepEqual(surface.toolNames, ["read"]);
});

test("promoted Pro rewrites persona but leaves Pi tools", () => {
	const rewritten = rewriteProviderRequest(
		{
			system: "Pi default prompt",
			tools: [
				{ type: "function", function: { name: "read", parameters: { type: "object" } } },
				{ type: "function", function: { name: "bash", parameters: { type: "object" } } },
			],
		},
		{ persona: MINIMAL_PROMPT, rewriteTools: false },
	);
	const surface = extractRequestSurface(rewritten);
	assert.equal(surface.system, MINIMAL_PROMPT);
	assert.deepEqual(surface.toolNames, ["read", "bash"]);
});
