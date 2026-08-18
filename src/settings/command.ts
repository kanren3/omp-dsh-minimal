import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { isAdapterActive, syncSurface } from "../adapter/activation.ts";
import { readDshMinimalConfig, writeDshMinimalConfig } from "../adapter/config.ts";
import { resyncSessionState, type AdapterState } from "../adapter/state.ts";

const DSH_COMMAND_COMPLETIONS = ["on", "off", "status"] as const;
const DSH_USAGE = "Usage: /dsh, /dsh status, /dsh on|off";

/** Bare `/dsh` output: master switch plus promotion status. */
export function formatDshStatus(state: AdapterState): string {
	if (!state.config.enabled) return "dsh: off";
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
				syncSurface(pi, state, isAdapterActive(ctx, state.config), state.hasAssistant || state.hasTool);
				ctx.ui.notify(formatDshStatus(state), "info");
				return;
			}
			if (head === "status" || head === "") {
				ctx.ui.notify(formatDshStatus(state), "info");
				return;
			}
			ctx.ui.notify(DSH_USAGE, "warning");
		},
	});
}
