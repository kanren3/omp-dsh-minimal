import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";

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
	previousToolNames?: string[];
	hasAssistant: boolean;
	hasTool: boolean;
}
