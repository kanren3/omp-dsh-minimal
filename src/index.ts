import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { isAdapterActive, syncSurface } from "./adapter/activation.ts";
import { readDshMinimalConfig } from "./adapter/config.ts";
import { filterBootstrapPreludes } from "./adapter/context-filter.ts";
import {
	applyDeferredToolChoice,
	bootstrapDroppedToolChoice,
	extractRequestSurface,
	rewriteProviderRequest,
} from "./adapter/payload-rewrite.ts";
import { reanchorPersona } from "./adapter/prompt.ts";
import { resyncSessionState, type AdapterState } from "./adapter/state.ts";
import { MINIMAL_PROMPT } from "./dsh/official.ts";
import { registerDshCommand } from "./settings/command.ts";
import { registerStrReplaceEditorTool } from "./tools/str-replace-editor.ts";

function refresh(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): boolean {
	resyncSessionState(state, ctx.sessionManager.getEntries());

	const active = isAdapterActive(ctx, state.config);
	syncSurface(pi, state, active, state.hasAssistant || state.hasTool);
	return active;
}

export default function dshMinimal(pi: ExtensionAPI): void {
	const state: AdapterState = {
		anchored: false,
		config: readDshMinimalConfig(),
		surface: "off",
		hasAssistant: false,
		hasTool: false,
		deferredToolChoice: undefined,
		lastBoundaryIndex: -1,
	};

	registerStrReplaceEditorTool(pi);
	registerDshCommand(pi, state);

	pi.on("session_start", async (_event, ctx) => {
		state.anchored = false;
		state.config = readDshMinimalConfig();
		state.surface = "off";
		state.hasAssistant = false;
		state.hasTool = false;
		state.deferredToolChoice = undefined;
		state.lastBoundaryIndex = -1;
		refresh(pi, ctx, state);
	});

// /new, /resume, /fork, and session switches fire session_switch (not
// session_start). Reset unconditionally; resyncSessionState restores
// anchored from the new session's entries when a marker persists.
pi.on("session_switch", async (_event, ctx) => {
	state.anchored = false;
	state.config = readDshMinimalConfig();
	state.surface = "off";
	state.hasAssistant = false;
	state.hasTool = false;
	state.deferredToolChoice = undefined;
	state.lastBoundaryIndex = -1;
	refresh(pi, ctx, state);
});

	pi.on("session_compact", async (_event, ctx) => {
		state.hasAssistant = false;
		state.hasTool = false;
		refresh(pi, ctx, state);
	});

	pi.on("message_end", async (event, ctx) => {
		const m = (event as { message?: { role?: string; content?: unknown } }).message;
		if (!m || m.role !== "assistant") return;
		const before = state.hasAssistant || state.hasTool;
		state.hasAssistant = true;
		if (
			Array.isArray(m.content) &&
			m.content.some((p) => p && typeof p === "object" && (p as { type?: string }).type === "toolCall")
		) {
			state.hasTool = true;
		}
		if ((state.hasAssistant || state.hasTool) !== before) refresh(pi, ctx, state);
	});

	pi.on("tool_call", async (_event, ctx) => {
		state.hasTool = true;
		refresh(pi, ctx, state);
	});

	// Bootstrap only: drop omp-injected custom preludes that point at tools
	// outside the minimal catalog. The context event fires before wire
	// encoding, so custom role and attribution are still intact.
	pi.on("context", async (event, ctx) => {
		if (!isAdapterActive(ctx, state.config)) return undefined;
		if (state.hasAssistant || state.hasTool) return undefined;
		const messages = filterBootstrapPreludes(event.messages);
		if (messages === undefined) return undefined;
		return { messages };
	});

	pi.on("before_provider_request", async (event, ctx) => {
		const active = refresh(pi, ctx, state);
		if (!active) return undefined;

		const promoted = state.hasAssistant || state.hasTool;
		const payload = event.payload as Record<string, unknown>;
		const payloadIsObject = payload !== null && typeof payload === "object";

		if (!promoted && payloadIsObject) {
			// Bootstrap round: cache a pin dropped by the minimal catalog and
			// apply it on the first promoted request, where its tool exists.
			const dropped = bootstrapDroppedToolChoice(payload.tool_choice);
			if (dropped !== undefined) state.deferredToolChoice = structuredClone(dropped);
		}

		const assembled = extractRequestSurface(event.payload).system ?? ctx.getSystemPrompt().join("\n");
		const persona = promoted ? reanchorPersona(assembled) : MINIMAL_PROMPT;
		const rewritten = rewriteProviderRequest(event.payload, { persona, rewriteTools: !promoted });

		if (promoted && payloadIsObject) {
			applyDeferredToolChoice(payload, state.deferredToolChoice);
			state.deferredToolChoice = undefined;
		}

		return rewritten;
	});
}
