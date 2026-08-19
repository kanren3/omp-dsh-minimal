import { DSH_MINIMAL_TOOLS } from "../dsh/official.ts";
import { BOOTSTRAP_TOOL_NAMES } from "./tool-set.ts";

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactChatCompletionsTools(): Record<string, unknown>[] {
	return DSH_MINIMAL_TOOLS.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: structuredClone(tool.parameters),
		},
	}));
}

function exactAnthropicTools(): Record<string, unknown>[] {
	return DSH_MINIMAL_TOOLS.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: structuredClone(tool.parameters),
	}));
}

function exactNamedParameterTools(): Record<string, unknown>[] {
	return DSH_MINIMAL_TOOLS.map((tool) => ({
		type: "function",
		name: tool.name,
		description: tool.description,
		parameters: structuredClone(tool.parameters),
	}));
}

function rewriteTools(tools: unknown): unknown {
	if (!Array.isArray(tools)) {
		return exactChatCompletionsTools();
	}
	const first = tools[0];
	if (isObject(first) && first.type === "function" && isObject(first.function)) {
		return exactChatCompletionsTools();
	}
	if (isObject(first) && "input_schema" in first) {
		return exactAnthropicTools();
	}
	if (isObject(first) && typeof first.name === "string" && "parameters" in first) {
		return exactNamedParameterTools();
	}
	return exactChatCompletionsTools();
}

/**
 * Rewrite an instruction slot (system/developer message content) in place.
 * A single-part text array is mutated so the host payload object keeps its
 * identity; bare strings are replaced on the caller's field.
 */
function rewriteInstructionContent(content: unknown, persona: string): unknown {
	if (typeof content === "string") return persona;
	if (!Array.isArray(content)) return persona;
	if (content.length === 1 && isObject(content[0]) && content[0].type === "text") {
		content[0].text = persona;
		return content;
	}
	return persona;
}

/** Rewrite the first system/developer message content in place. */
function rewriteMessages(messages: unknown, persona: string): void {
	if (!Array.isArray(messages)) return;
	for (const message of messages) {
		if (!isObject(message)) continue;
		const role = message.role;
		if (role !== "system" && role !== "developer") continue;
		message.content = rewriteInstructionContent(message.content, persona);
		return;
	}
}

export interface RewriteOptions {
	persona: string;
	rewriteTools: boolean;
}

/** Name pinned by a named tool_choice, any wire dialect; undefined when open. */
function namedToolChoiceTool(toolChoice: unknown): string | undefined {
	if (!isObject(toolChoice)) return undefined;
	if (toolChoice.type !== "function" && toolChoice.type !== "tool") return undefined;
	const fn = toolChoice.function;
	if (isObject(fn) && typeof fn.name === "string" && fn.name.length > 0) return fn.name;
	if (typeof toolChoice.name === "string" && toolChoice.name.length > 0) return toolChoice.name;
	return undefined;
}

/**
 * Bootstrap only: a named force pinning a tool outside the minimal catalog is
 * self-inconsistent (omp's encode-time guard already ran) and can 4xx on the
 * provider. Drop it, reverting to auto. Pins on the bootstrap pair survive.
 */
function rewriteToolChoice(toolChoice: unknown): unknown {
	const name = namedToolChoiceTool(toolChoice);
	if (name === undefined) return toolChoice;
	if (BOOTSTRAP_TOOL_NAMES.includes(name)) return toolChoice;
	return undefined;
}

export function looksLikeSummarizationSystem(system: string | undefined): boolean {
	return Boolean(system && /context summarization assistant/i.test(system));
}

export function looksLikeCompactionUser(text: string | undefined): boolean {
	if (!text) return false;
	return text.includes("<conversation>") && (text.includes("</conversation>") || text.includes("<previous-summary>"));
}

/** Compaction / branch-summary calls share this hook; do not rewrite them. */
export function isNonAgentProviderPayload(payload: unknown): boolean {
	const surface = extractRequestSurface(payload);
	return looksLikeSummarizationSystem(surface.system) || looksLikeCompactionUser(surface.lastUser);
}

/**
 * Rewrite the provider request in place. Returns the same object so
 * providers that consume the hook's return value still see the rewrite;
 * openai-completions-style hosts ignore the return value and rely on the
 * mutation (see deepseek-optimizer's in-place contract).
 */
export function rewriteProviderRequest(payload: unknown, options: RewriteOptions): unknown {
	if (!isObject(payload)) return payload;
	if (isNonAgentProviderPayload(payload)) return payload;
	if ("system" in payload && (typeof payload.system === "string" || Array.isArray(payload.system))) {
		payload.system = rewriteInstructionContent(payload.system, options.persona);
	}
	if ("instructions" in payload && typeof payload.instructions === "string") {
		payload.instructions = options.persona;
	}
	if ("messages" in payload) {
		rewriteMessages(payload.messages, options.persona);
	}
	if (options.rewriteTools) {
		payload.tools = rewriteTools(payload.tools);
		if (payload.tool_choice !== undefined) {
			const choice = rewriteToolChoice(payload.tool_choice);
			if (choice === undefined) delete payload.tool_choice;
			else payload.tool_choice = choice;
		}
	}
	return payload;
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
		.join("");
}

export function extractRequestSurface(payload: unknown): {
	system?: string;
	toolNames: string[];
	tools: unknown;
	lastUser?: string;
	messageRoles?: string[];
} {
	if (!isObject(payload)) return { toolNames: [], tools: undefined };
	let system: string | undefined;
	if (typeof payload.system === "string") system = payload.system;
	else if (typeof payload.instructions === "string") system = payload.instructions;
	if (system === undefined && Array.isArray(payload.messages)) {
		const first = payload.messages.find(
			(message) => isObject(message) && (message.role === "system" || message.role === "developer"),
		);
		if (isObject(first) && typeof first.content === "string") system = first.content;
	}
	let lastUser: string | undefined;
	if (Array.isArray(payload.messages)) {
		for (let index = payload.messages.length - 1; index >= 0; index--) {
			const message = payload.messages[index];
			if (!isObject(message) || message.role !== "user") continue;
			const text = messageText(message.content);
			if (text.trim()) {
				lastUser = text;
				break;
			}
		}
	}
	const tools = payload.tools;
	const toolNames: string[] = [];
	if (Array.isArray(tools)) {
		for (const tool of tools) {
			if (!isObject(tool)) continue;
			if (isObject(tool.function) && typeof tool.function.name === "string") {
				toolNames.push(tool.function.name);
			} else if (typeof tool.name === "string") {
				toolNames.push(tool.name);
			}
		}
	}
	const messageRoles: string[] = [];
	if (Array.isArray(payload.messages)) {
		for (const message of payload.messages) {
			if (isObject(message) && typeof message.role === "string") messageRoles.push(message.role);
		}
	}
	return { system, toolNames, tools, lastUser, messageRoles };
}
