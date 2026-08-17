import test from "node:test";
import assert from "node:assert/strict";
import { modelMatchesPatterns, normalizeModelToken } from "../src/adapter/model.ts";

test("normalizeModelToken collapses separators and lowercases", () => {
	assert.equal(normalizeModelToken("DeepSeek V4 Pro"), "deepseekv4pro");
	assert.equal(normalizeModelToken("deepseek-v4-pro"), "deepseekv4pro");
	assert.equal(normalizeModelToken("deepseek/v4.pro"), "deepseekv4pro");
	assert.equal(normalizeModelToken("deepseek_v4_pro"), "deepseekv4pro");
});

test("default DeepSeek V4 Pro pattern hits official ids and names", () => {
	const pro = (model: Parameters<typeof modelMatchesPatterns>[0]) => modelMatchesPatterns(model, ["deepseek-v4-pro"]);
	assert.equal(pro({ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (New)", provider: "opencode-go" }), true);
	assert.equal(pro({ id: "deepseek-v4-pro-0813", provider: "deepseek" }), true);
	assert.equal(pro({ name: "DeepSeek V4 Pro" }), true);
	assert.equal(pro({ id: "deepseek-v4-flash" }), false);
	assert.equal(pro({ id: "gpt-5.6-luna" }), false);
});

test("custom patterns match substrings after normalization", () => {
	assert.equal(modelMatchesPatterns({ id: "acme-deepseek-v4-pro-exp" }, ["deepseek-v4-pro"]), true);
	assert.equal(modelMatchesPatterns({ id: "claude-opus" }, ["deepseek-v4-pro"]), false);
});
