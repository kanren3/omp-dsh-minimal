import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import type { TaskClassification } from "./classify.ts";
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
	 * First-turn task classification, locked at the first agent request.
	 * Non-spec tasks release the session: no bootstrap, native omp surface.
	 */
	classification?: TaskClassification;
	/** Index of the newest compaction/reset boundary already folded into the promotion flags. */
	lastBoundaryIndex: number;
}

/**
 * Promoted when the assistant replied, called a tool, or the first-turn
 * classification released the session (react/weak tasks skip bootstrap).
 */
export function isAdapterPromoted(
	state: Pick<AdapterState, "hasAssistant" | "hasTool" | "classification">,
): boolean {
	return state.hasAssistant || state.hasTool || (state.classification !== undefined && state.classification !== "spec");
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
