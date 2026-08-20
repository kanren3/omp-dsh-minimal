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

/** Identity key for matching a stashed prelude against a later context view. */
function preludeKey(message: AgentMessage): string {
	const customType = "customType" in message && typeof message.customType === "string" ? message.customType : "";
	const content = "content" in message ? message.content : undefined;
	return `${message.role}:${customType}:${JSON.stringify(content)}`;
}

/**
 * Promoted-phase counterpart to {@link filterBootstrapPreludes}. Preludes
 * dropped from the bootstrap request persist in the transcript and resurface
 * on the next request at their original position — prepended to turn #1,
 * where the model reads them as a past turn's directives and discounts them.
 * Relocate the stashed copies to the native prelude slot (the contiguous run
 * of custom messages right before the last user turn), so they land on the
 * turn where the full tool set first becomes visible. A fresh identical copy
 * already occupying the slot makes the stale one redundant: it is removed
 * without inserting a duplicate. Returns `undefined` when nothing moves,
 * matching the context event's no-change contract.
 */
export function relocateDeferredPreludes(
	messages: AgentMessage[],
	deferred: readonly AgentMessage[],
): AgentMessage[] | undefined {
	if (deferred.length === 0) return undefined;

	let lastUser = -1;
	for (let index = messages.length - 1; index >= 0; index--) {
		if (messages[index]?.role === "user") {
			lastUser = index;
			break;
		}
	}
	if (lastUser < 0) return undefined;

	let slotStart = lastUser;
	while (slotStart > 0 && messages[slotStart - 1]?.role === "custom") slotStart--;
	const slotKeys = new Set(messages.slice(slotStart, lastUser).map(preludeKey));

	// Remove every stashed copy outside the current-turn slot: with duplicate
	// identical directives in history, first-match lookup would leave later
	// copies behind at their stale position. Content-key matching also covers
	// session reloads that rebuilt the message objects.
	const wanted = new Set(deferred.map(preludeKey));
	const remove = new Set<number>();
	const found = new Set<string>();
	for (let index = 0; index < messages.length; index++) {
		if (index >= slotStart && index < lastUser) continue; // current-turn slot stays
		const key = preludeKey(messages[index]!);
		if (wanted.has(key)) {
			remove.add(index);
			found.add(key);
		}
	}

	// Insert one copy per relocated directive, in stash order, unless a fresh
	// identical copy already occupies the slot. Insertion requires a removal
	// match: a stash absent from the context (post-compaction) is not injected.
	const insert: AgentMessage[] = [];
	for (const prelude of deferred) {
		const key = preludeKey(prelude);
		if (!found.has(key) || slotKeys.has(key)) continue;
		insert.push(prelude);
		slotKeys.add(key);
	}
	if (remove.size === 0 && insert.length === 0) return undefined;

	const out: AgentMessage[] = [];
	for (let index = 0; index < messages.length; index++) {
		if (remove.has(index)) continue;
		if (index === lastUser) out.push(...insert);
		out.push(messages[index]!);
	}
	return out;
}
