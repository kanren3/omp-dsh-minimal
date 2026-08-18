import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";

export interface PromotionScan {
	hasAssistant: boolean;
	hasTool: boolean;
	promoted: boolean;
}

/** Promotion fires on either the first assistant message or the first tool result. */
export function isPromoted(hasAssistant: boolean, hasTool: boolean): boolean {
	return hasAssistant || hasTool;
}

/** Index of the latest compaction or reset_boundary entry, or -1 when none. */
export function latestBoundaryIndex(entries: readonly SessionEntry[]): number {
	let latest = -1;
	for (let index = 0; index < entries.length; index++) {
		const type = entries[index]?.type;
		if (type === "compaction" || type === "reset_boundary") latest = index;
	}
	return latest;
}

/** Entries after the last context boundary count: compaction and `/clear` each start a new bootstrap epoch. */
export function scanSessionPhase(entries: readonly SessionEntry[]): PromotionScan {
	const lastBoundaryIndex = latestBoundaryIndex(entries);

	let hasAssistant = false;
	let hasTool = false;

	for (let index = lastBoundaryIndex + 1; index < entries.length; index++) {
		const entry = entries[index];
		if (!entry || entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role === "assistant") {
			hasAssistant = true;
			const content = entry.message.content;
			if (
				Array.isArray(content) &&
				content.some((part) => part !== null && typeof part === "object" && "type" in part && part.type === "toolCall")
			) {
				hasTool = true;
			}
			continue;
		}
		if (role === "toolResult") hasTool = true;
	}

	return { hasAssistant, hasTool, promoted: isPromoted(hasAssistant, hasTool) };
}
