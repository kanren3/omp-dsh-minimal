import type { AgentMessage } from "@oh-my-pi/pi-agent-core";

/**
 * Custom messages omp injects as first-turn preludes, pointing the model at
 * tools outside the bootstrap catalog. Partitioned by `customType` on the
 * `context` event — the AgentMessage layer that still carries the type —
 * instead of by content fingerprint on the wire.
 */
const BOOTSTRAP_DROPPED_CUSTOM_TYPES: Record<string, true> = {
	"eager-todo-prelude": true,
	"eager-task-prelude": true,
};

export interface PreludePartition {
	kept: AgentMessage[];
	dropped: AgentMessage[];
}

/**
 * Split bootstrap-only injected preludes from the message list. The dropped
 * preludes are cached and re-injected near-field after promotion: omp builds
 * eager preludes only for the first user message (`prependMessages`, never
 * the shared queue) and does not rebuild them, so filtering the first
 * request alone would erase the todo/task guidance for the whole session.
 */
export function partitionBootstrapPreludes(messages: AgentMessage[]): PreludePartition {
	const kept: AgentMessage[] = [];
	const dropped: AgentMessage[] = [];
	for (const message of messages) {
		if (message.role === "custom" && BOOTSTRAP_DROPPED_CUSTOM_TYPES[message.customType] === true) {
			dropped.push(message);
		} else {
			kept.push(message);
		}
	}
	return { kept, dropped };
}
