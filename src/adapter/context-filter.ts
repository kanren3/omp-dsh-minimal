import type { AgentMessage } from "@oh-my-pi/pi-agent-core";

/**
 * Custom messages omp injects as first-turn preludes, pointing the model at
 * tools outside the bootstrap catalog. Filtered by `customType` on the
 * `context` event — the AgentMessage layer that still carries the type —
 * instead of by content fingerprint on the wire.
 */
const BOOTSTRAP_DROPPED_CUSTOM_TYPES: Record<string, true> = {
	"eager-todo-prelude": true,
	"eager-task-prelude": true,
};

/** Bootstrap-only: drop injected prelude messages; promoted requests keep them. */
export function filterBootstrapPreludes(messages: AgentMessage[], promoted: boolean): AgentMessage[] {
	if (promoted) return messages;
	let changed = false;
	const filtered = messages.filter((message) => {
		if (message.role !== "custom") return true;
		if (BOOTSTRAP_DROPPED_CUSTOM_TYPES[message.customType] !== true) return true;
		changed = true;
		return false;
	});
	return changed ? filtered : messages;
}
