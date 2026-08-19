import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { isAdapterActive, syncSurface } from "./adapter/activation.ts";
import { readDshMinimalConfig } from "./adapter/config.ts";
import { partitionBootstrapPreludes } from "./adapter/context-filter.ts";
import { extractRequestSurface, rewriteProviderRequest } from "./adapter/payload-rewrite.ts";
import { reanchorPersona } from "./adapter/prompt.ts";
import { isAdapterPromoted, resyncSessionState, type AdapterState } from "./adapter/state.ts";
import { MINIMAL_PROMPT } from "./dsh/official.ts";
import { registerDshCommand } from "./settings/command.ts";
import { registerStrReplaceEditorTool } from "./tools/str-replace-editor.ts";

function refresh(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): boolean {
	resyncSessionState(state, ctx.sessionManager.getEntries());

	const active = isAdapterActive(ctx, state.config);
	syncSurface(pi, state, active, isAdapterPromoted(state));
	return active;
}

export default function dshMinimal(pi: ExtensionAPI): void {
	const state: AdapterState = {
		anchored: false,
		config: readDshMinimalConfig(),
		surface: "off",
		hasAssistant: false,
		hasTool: false,
		pendingPreludes: [],
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
		state.pendingPreludes = [];
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
	state.pendingPreludes = [];
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
		const before = isAdapterPromoted(state);
		state.hasAssistant = true;
		if (
			Array.isArray(m.content) &&
			m.content.some((p) => p !== null && typeof p === "object" && "type" in p && p.type === "toolCall")
		) {
			state.hasTool = true;
		}
		if (isAdapterPromoted(state) !== before) refresh(pi, ctx, state);
	});

	pi.on("tool_call", async (_event, ctx) => {
		state.hasTool = true;
		refresh(pi, ctx, state);
	});

	// AgentMessage layer, before wire encoding: customType is still intact
	// here, so the prelude partition matches by type instead of content
	// fingerprint (which would drift when omp rewords its prompt templates).
	pi.on("context", async (event, ctx) => {
		resyncSessionState(state, ctx.sessionManager.getEntries());
		const promoted = isAdapterPromoted(state);
		let messages = event.messages;

		if (promoted) {
			if (state.pendingPreludes.length > 0) {
				// omp builds eager preludes only for the first user message;
				// bootstrap dropped them, so re-inject near-field once the
				// full tool set is back — otherwise the model never sees the
				// todo/task guidance again this session.
				messages = [...messages, ...state.pendingPreludes];
				state.pendingPreludes = [];
			}
		} else {
			const { kept, dropped } = partitionBootstrapPreludes(messages);
			if (dropped.length > 0) {
				state.pendingPreludes = dropped;
				messages = kept;
			}
		}

		if (messages === event.messages) return undefined;
		return { messages };
	});

	pi.on("before_provider_request", async (event, ctx) => {
		const active = refresh(pi, ctx, state);
		if (!active) return undefined;

		const assembled = extractRequestSurface(event.payload).system ?? ctx.getSystemPrompt().join("\n");
		const promoted = isAdapterPromoted(state);
		const persona = promoted ? reanchorPersona(assembled) : MINIMAL_PROMPT;
		const rewritten = rewriteProviderRequest(event.payload, { persona, rewriteTools: !promoted });

		return rewritten;
	});
}
