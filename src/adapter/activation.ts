import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { contextModel, modelMatchesPatterns } from "./model.ts";
import { ANCHORED_ENTRY_TYPE, type AdapterState, type ToolSurface } from "./state.ts";
import { BOOTSTRAP_TOOL_NAMES, STR_REPLACE_EDITOR_TOOL_NAME, stripOwnedTools } from "./tool-set.ts";

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

	// Only add or remove adapter-owned tools rather than replacing the full set.
	// setActiveToolsByName recalculates the xd:// mount partition from the passed
	// list; passing the full active set (including mounted names) preserves it.
	// rewriteProviderRequest controls what the LLM sees at the payload level.
	if (desired === "bootstrap") {
		// Ensure the minimal preset tools are active so direct tool calls dispatch.
		const current = pi.getActiveTools();
		const missing = BOOTSTRAP_TOOL_NAMES.filter((name) => !current.includes(name));
		if (missing.length > 0) {
			pi.setActiveTools([...current, ...missing]);
		}
	} else if (desired === "promoted") {
		// Strip our editor; the rest of the set is untouched.
		pi.setActiveTools(stripOwnedTools(pi.getActiveTools()));
	}

	if (desired === "off") {
		pi.setActiveTools(stripOwnedTools(pi.getActiveTools()));
	}

	state.surface = desired;
}
