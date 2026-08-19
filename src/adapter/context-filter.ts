import type { AgentMessage } from "@oh-my-pi/pi-agent-core";

/**
 * Bootstrap-only prelude filter. omp injects guidance as custom messages —
 * magic-keyword notices, mode contexts — that point at tools outside the
 * minimal catalog and would pollute the first request. A custom message
 * is real user input only when it is user-attributed and visible (e.g. a
 * /skill prompt); hidden notices share `attribution: "user"` but carry
 * `display: false`. Returns `undefined` when nothing is dropped, matching
 * the context event's no-change contract.
 */
export function filterBootstrapPreludes(messages: AgentMessage[]): AgentMessage[] | undefined {
	const kept: AgentMessage[] = [];
	for (const message of messages) {
		// Drop omp-injected custom preludes: non-user-attributed (mode
		// contexts) or user-attributed but hidden (magic-keyword notices).
		if (message.role === "custom" && (message.attribution !== "user" || message.display === false)) continue;
		kept.push(message);
	}
	return kept.length === messages.length ? undefined : kept;
}
