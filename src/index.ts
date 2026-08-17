import { writeFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { isAdapterActive, syncSurface } from "./adapter/activation.ts";
import { readDshMinimalConfig } from "./adapter/config.ts";
import { extractRequestSurface, rewriteProviderRequest } from "./adapter/payload-rewrite.ts";
import { reanchorPersona } from "./adapter/prompt.ts";
import { resyncSessionState, type AdapterState } from "./adapter/state.ts";
import { MINIMAL_PROMPT } from "./dsh/official.ts";
import { registerDshCommand } from "./settings/command.ts";
import { registerStrReplaceEditorTool } from "./tools/str-replace-editor.ts";

function dumpPath(): string | undefined {
	const value = process.env.OMP_DSH_MINIMAL_DUMP;
	return value && value.length > 0 ? value : undefined;
}

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
	};

	registerStrReplaceEditorTool(pi);
	registerDshCommand(pi, state);

	pi.on("session_start", async (_event, ctx) => {
		state.anchored = false;
		state.config = readDshMinimalConfig();
		state.surface = "off";
		state.hasAssistant = false;
		state.hasTool = false;
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

	pi.on("before_provider_request", async (event, ctx) => {
		const active = refresh(pi, ctx, state);
		if (!active) return undefined;

		const assembled = extractRequestSurface(event.payload).system ?? ctx.getSystemPrompt().join("\n");
		const promoted = state.hasAssistant || state.hasTool;
		const persona = promoted ? reanchorPersona(assembled) : MINIMAL_PROMPT;
		const rewritten = rewriteProviderRequest(event.payload, { persona, rewriteTools: !promoted });

		const dump = dumpPath();
		if (dump) {
			try {
				const surface = extractRequestSurface(rewritten);
				writeFileSync(
					dump,
					`${JSON.stringify({
						active,
						promoted,
						surface: state.surface,
						...surface,
					})}\n`,
					{ encoding: "utf8", flag: "a" },
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`[omp-dsh-minimal] Failed to dump request surface: ${message}`);
			}
		}
		return rewritten;
	});
}
