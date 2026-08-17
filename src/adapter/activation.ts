import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { contextModel, modelMatchesPatterns } from "./model.ts";
import { ANCHORED_ENTRY_TYPE, type AdapterState, type ToolSurface } from "./state.ts";
import { ADAPTER_TOOL_NAMES, DEFAULT_TOOL_NAMES, restoreTools, stripOwnedTools } from "./tool-set.ts";

export function isAdapterActive(
	ctx: { model?: { provider?: unknown; id?: unknown; name?: unknown } | null },
	config: DshMinimalConfig,
): boolean {
	return config.enabled && modelMatchesPatterns(contextModel(ctx), config.modelPatterns);
}

export function desiredSurface(active: boolean, promoted: boolean): ToolSurface {
	if (!active) return "off";
	return promoted ? "promoted" : "bootstrap";
}

export function syncSurface(pi: ExtensionAPI, state: AdapterState, active: boolean, promoted: boolean): void {
	const desired = desiredSurface(active, promoted);

	if (desired === "bootstrap" && !state.anchored) {
		// The marker must not depend on a surface transition: session_start
		// resets anchored but not surface, so an in-process /new from a
		// bootstrap session must still persist the marker.
		state.anchored = true;
		pi.appendEntry(ANCHORED_ENTRY_TYPE);
	}

	if (desired === state.surface) {
		if (desired === "off") {
			pi.setActiveTools(stripOwnedTools(pi.getActiveTools()));
		}
		return;
	}

	if (desired === "bootstrap") {
		if (state.surface !== "bootstrap") {
			state.previousToolNames = stripOwnedTools(pi.getActiveTools());
		}
		pi.setActiveTools([...ADAPTER_TOOL_NAMES]);
	} else if (state.surface === "bootstrap") {
		const previousToolNames =
			state.previousToolNames && state.previousToolNames.length > 0 ? state.previousToolNames : DEFAULT_TOOL_NAMES;
		pi.setActiveTools(restoreTools(previousToolNames, pi.getActiveTools()));
		state.previousToolNames = undefined;
	}

	if (desired === "off") {
		pi.setActiveTools(stripOwnedTools(pi.getActiveTools()));
	}

	state.surface = desired;
}
