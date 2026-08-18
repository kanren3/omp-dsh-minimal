import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { isAdapterActive, syncSurface } from "../adapter/activation.ts";
import { readDshMinimalConfig, writeDshMinimalConfig } from "../adapter/config.ts";
import { resyncSessionState, type AdapterState } from "../adapter/state.ts";

const DSH_COMMAND_COMPLETIONS = ["on", "off", "status"] as const;
const DSH_USAGE = "Usage: /dsh, /dsh status, /dsh on|off";

/** Bare `/dsh` output: master switch, current-model activation, and promotion status. */
export function formatDshStatus(
	state: AdapterState,
	active: boolean,
	model: { provider?: unknown; id?: unknown; name?: unknown } | null = null,
): string {
	if (!state.config.enabled) return "dsh: off";
	if (!active) {
		// A model with only non-string fields behaves as absent in contextModel.
		const hasModel = model != null && [model.provider, model.id, model.name].some(
			(value) => typeof value === "string" && value.length > 0,
		);
		return hasModel ? "dsh: on · current model not matched" : "dsh: on · no current model";
	}
	const promoted = state.hasAssistant || state.hasTool;
	return `dsh: on · ${promoted ? "promoted" : "awaiting promotion"}`;
}

export function registerDshCommand(pi: ExtensionAPI, state: AdapterState, configPath?: string): void {
	pi.registerCommand("dsh", {
		description: "DeepSeek Harness adapter: enable, disable, or show status",
		getArgumentCompletions: (prefix) => {
			const trimmed = prefix.trim().toLowerCase();
			return DSH_COMMAND_COMPLETIONS.filter((item) => item.startsWith(trimmed)).map((value) => ({
				label: value,
				value,
			}));
		},
		handler: async (args, ctx) => {
			state.config = readDshMinimalConfig(configPath);
			resyncSessionState(state, ctx.sessionManager.getEntries());
			const head = args.trim().toLowerCase();

			if (head === "on" || head === "off") {
				const nextConfig = { ...state.config, enabled: head === "on" };
				const writeResult = writeDshMinimalConfig(nextConfig, configPath);
				if (!writeResult.ok) {
					ctx.ui.notify(`Failed to save dsh settings: ${writeResult.error}`, "error");
					return;
				}
				state.config = nextConfig;
				const active = isAdapterActive(ctx, state.config);
				syncSurface(pi, state, active, state.hasAssistant || state.hasTool);
				ctx.ui.notify(formatDshStatus(state, active, ctx.model), "info");
				return;
			}
			if (head === "status" || head === "") {
				ctx.ui.notify(formatDshStatus(state, isAdapterActive(ctx, state.config), ctx.model), "info");
				return;
			}
			ctx.ui.notify(DSH_USAGE, "warning");
		},
	});
}
