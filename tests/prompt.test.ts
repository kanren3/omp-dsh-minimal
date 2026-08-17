import test from "node:test";
import assert from "node:assert/strict";
import { OMP_IDENTITY, reanchorPersona } from "../src/adapter/prompt.ts";
import { MINIMAL_PROMPT } from "../src/dsh/official.ts";

test("already-anchored passthrough is unchanged", () => {
	assert.equal(reanchorPersona(MINIMAL_PROMPT), MINIMAL_PROMPT);
	const withSuffix = `${MINIMAL_PROMPT}\n\nAvailable tools:\n- bash`;
	assert.equal(reanchorPersona(withSuffix), withSuffix);
});

test("omp identity is swapped out for the official persona", () => {
	const assembled = `${OMP_IDENTITY}\n\nAvailable tools:\n- bash: Run a command\n\n<hermes-memory>keep me</hermes-memory>`;
	const reanchored = reanchorPersona(assembled);
	assert.ok(reanchored.startsWith(MINIMAL_PROMPT));
	assert.equal(reanchored.includes("load-bearing changes"), false);
	assert.match(reanchored, /Available tools:/);
	assert.match(reanchored, /<hermes-memory>keep me<\/hermes-memory>/);
});

test("empty system becomes the official one-liner", () => {
	assert.equal(reanchorPersona(""), MINIMAL_PROMPT);
	assert.equal(reanchorPersona("   \n"), MINIMAL_PROMPT);
});

test("no-identity text gets the official line prepended", () => {
	const reanchored = reanchorPersona("Available tools:\n- read");
	assert.equal(reanchored, `${MINIMAL_PROMPT}\n\nAvailable tools:\n- read`);
});
