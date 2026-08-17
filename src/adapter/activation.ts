import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { contextModel, modelMatchesPatterns } from "./model.ts";
import { ANCHORED_ENTRY_TYPE, type AdapterState, type ToolSurface } from "./state.ts";
import { STR_REPLACE_EDITOR_TOOL_NAME, stripOwnedTools } from "./tool-set.ts";

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

	// Tool-set transitions never replace the active set wholesale. Replacing it
	// via setActiveTools (→ setActiveToolsByName) recalculates the xd:// mount
	// partition from the passed list, unmounting every discoverable/MCP tool
	// not explicitly in the list. Instead, we only add or remove our owned
	// str_replace_editor while passing through the full getActiveTools() list
	// (which includes mounted names), so the harness preserves the partition.
	// rewriteProviderRequest controls what the LLM actually sees at the payload
	// level, so the harness's internal tool set can stay unchanged at bootstrap.
	if (desired === "bootstrap") {
		// Entering bootstrap: ensure str_replace_editor is active alongside the
		// existing set. rewriteProviderRequest filters the payload to just
		// [bash, str_replace_editor], so the LLM never sees the extras.
		const current = pi.getActiveTools();
		if (!current.includes(STR_REPLACE_EDITOR_TOOL_NAME)) {
			pi.setActiveTools([...current, STR_REPLACE_EDITOR_TOOL_NAME]);
		}
	} else if (desired === "promoted") {
		// Leaving bootstrap (→ promoted) or off → promoted: strip our editor.
		// The rest of the set is untouched, so the xd:// partition survives.
		pi.setActiveTools(stripOwnedTools(pi.getActiveTools()));
	}

	if (desired === "off") {
		pi.setActiveTools(stripOwnedTools(pi.getActiveTools()));
	}

	state.surface = desired;
}
