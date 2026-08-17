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

/** Only entries after the last compaction count: compaction starts a new bootstrap epoch. */
export function scanSessionPhase(entries: readonly SessionEntry[]): PromotionScan {
	let lastCompactionIndex = -1;
	for (let index = 0; index < entries.length; index++) {
		if (entries[index]?.type === "compaction") lastCompactionIndex = index;
	}

	let hasAssistant = false;
	let hasTool = false;

	for (let index = lastCompactionIndex + 1; index < entries.length; index++) {
		const entry = entries[index];
		if (!entry || entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role === "assistant") {
			hasAssistant = true;
			const content = entry.message.content;
			if (
				Array.isArray(content) &&
				content.some((part) => part && typeof part === "object" && (part as { type?: string }).type === "toolCall")
			) {
				hasTool = true;
			}
			continue;
		}
		if (role === "toolResult") hasTool = true;
	}

	return { hasAssistant, hasTool, promoted: isPromoted(hasAssistant, hasTool) };
}
