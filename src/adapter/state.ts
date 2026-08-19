import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { latestBoundaryIndex, scanSessionPhase } from "./promotion.ts";

export type ToolSurface = "off" | "bootstrap" | "promoted";

/** Custom entry written once when bootstrap engages. Persists in the session file. */
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
	/**
	 * Bootstrap preludes (todo/task guidance) filtered out of the first
	 * request, re-injected near-field once the session is promoted. omp
	 * builds them only for the first user message and never rebuilds them.
	 */
	pendingPreludes: AgentMessage[];
	/** Index of the newest compaction/reset boundary already folded into the promotion flags. */
	lastBoundaryIndex: number;
}

/**
 * Promoted when the assistant replied or called a tool. Compaction and
 * `/clear` each start a new bootstrap epoch (flags reset by resync).
 */
export function isAdapterPromoted(
	state: Pick<AdapterState, "hasAssistant" | "hasTool">,
): boolean {
	return state.hasAssistant || state.hasTool;
}

/**
 * Restore anchored/assistant/tool flags from persisted session entries.
 * Promotion flags from before a newly observed compaction or `/clear` boundary
 * are dropped first, so an old epoch cannot promote the next request.
 */
export function resyncSessionState(
	state: Pick<AdapterState, "anchored" | "hasAssistant" | "hasTool" | "lastBoundaryIndex">,
	entries: readonly SessionEntry[],
): void {
	if (!state.anchored) {
		state.anchored = entriesHaveAnchoredMarker(entries);
	}
	const boundaryIndex = latestBoundaryIndex(entries);
	if (boundaryIndex > state.lastBoundaryIndex) {
		state.hasAssistant = false;
		state.hasTool = false;
	}
	state.lastBoundaryIndex = boundaryIndex;
	const scan = scanSessionPhase(entries);
	state.hasAssistant ||= scan.hasAssistant;
	state.hasTool ||= scan.hasTool;
}
