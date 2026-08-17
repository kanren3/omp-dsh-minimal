import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { scanSessionPhase } from "./promotion.ts";

export type ToolSurface = "off" | "bootstrap" | "promoted";

/**
 * Custom session entry written once when bootstrap engages. It persists in
 * the session file (custom entries never reach the LLM), so a /resume'd
 * session can still report/restore whether request #1 was anchored.
 */
export const ANCHORED_ENTRY_TYPE = "dsh-anchored";

export function entriesHaveAnchoredMarker(entries: readonly SessionEntry[]): boolean {
	return entries.some((entry) => entry.type === "custom" && entry.customType === ANCHORED_ENTRY_TYPE);
}

export interface AdapterState {
	/** True once this session entered bootstrap (request #1 went minimal). */
	anchored: boolean;
	config: DshMinimalConfig;
	surface: ToolSurface;
	hasAssistant: boolean;
	hasTool: boolean;
}

/**
 * Restore anchored/assistant/tool flags from persisted session entries.
 * The `dsh-anchored` custom entry persists in the session file, so a
 * /resume'd session rebuilds the same status it had before shutdown.
 */
export function resyncSessionState(
	state: Pick<AdapterState, "anchored" | "hasAssistant" | "hasTool">,
	entries: readonly SessionEntry[],
): void {
	if (!state.anchored) {
		state.anchored = entriesHaveAnchoredMarker(entries);
	}
	const scan = scanSessionPhase(entries);
	state.hasAssistant ||= scan.hasAssistant;
	state.hasTool ||= scan.hasTool;
}
