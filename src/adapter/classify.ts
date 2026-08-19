/**
 * First-turn task classification, ported from dsh-router-standard
 * `preset/router-standard/router-core.mjs` (keyword counts, same regexes).
 *
 * Spec tasks anchor the RL minimal interface; react/weak tasks pass the
 * native omp request through untouched (no bootstrap). The transition band
 * is never selected: ambiguous text falls to `weak`, which here means
 * "do not anchor" — omp's own persona is the weak internal-routing persona.
 */

export type TaskClassification = "spec" | "react" | "weak";

const REACT_RE = /(开发|创建|写一个|生成|从零|做一个|游戏|网页|网站|构建|新项目|搭建|实现|做出|上线|落地|脚本|工具|应用|build|create|develop|generate|implement|make a|new project)/gi;
const SPEC_RE = /(修复|修一下|调试|重构|维护|排查|报错|出错|崩溃|优化|审查|review|fix|debug|refactor|maintain|repair|broken|break|为什么|异常|故障|迁移|升级|兼容)/gi;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
		.join("");
}

/**
 * Classify a task text into one of the two stable behavior bands; ambiguous
 * or unmatched text returns `weak` (model decides per task).
 */
export function classifyTask(text: string): TaskClassification {
	const react = [...text.matchAll(REACT_RE)].length;
	const spec = [...text.matchAll(SPEC_RE)].length;
	if (react > spec) return "react";
	if (spec > react) return "spec";
	return "weak";
}

/** Text of the first non-empty user message in a provider payload. */
export function extractFirstUserText(payload: unknown): string {
	if (!isObject(payload) || !Array.isArray(payload.messages)) return "";
	for (const message of payload.messages) {
		if (!isObject(message) || message.role !== "user") continue;
		const text = messageText(message.content);
		if (text.trim()) return text;
	}
	return "";
}
