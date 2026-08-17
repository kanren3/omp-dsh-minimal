import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_DSH_MINIMAL_CONFIG,
	normalizeModelPatterns,
	readDshMinimalConfig,
	writeDshMinimalConfig,
} from "../src/adapter/config.ts";

test("normalizeModelPatterns drops empties, dedupes, and falls back to default", () => {
	assert.deepEqual(normalizeModelPatterns([" deepseek-v4-pro ", "", "foo", "foo"]), [
		"deepseek-v4-pro",
		"foo",
	]);
	assert.deepEqual(normalizeModelPatterns([]), [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns]);
	assert.deepEqual(normalizeModelPatterns("  "), [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns]);
	assert.deepEqual(normalizeModelPatterns(" gpt "), ["gpt"]);
});

test("read/write round-trips config", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-"));
	const path = join(dir, "pi-dsh-minimal.json");
	const written = writeDshMinimalConfig({ enabled: false, modelPatterns: ["gpt"] }, path);
	assert.equal(written.ok, true);
	assert.deepEqual(readDshMinimalConfig(path), { enabled: false, modelPatterns: ["gpt"] });
	const raw = JSON.parse(readFileSync(path, "utf8")) as { enabled: boolean };
	assert.equal(raw.enabled, false);
});

test("missing file creates the default file and returns defaults", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-missing-"));
	const path = join(dir, "pi-dsh-minimal.json");
	assert.deepEqual(readDshMinimalConfig(path), DEFAULT_DSH_MINIMAL_CONFIG);
	assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), DEFAULT_DSH_MINIMAL_CONFIG);
});

test("corrupt JSON returns defaults", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-corrupt-"));
	const path = join(dir, "pi-dsh-minimal.json");
	writeFileSync(path, "{not json");
	assert.deepEqual(readDshMinimalConfig(path), DEFAULT_DSH_MINIMAL_CONFIG);
});

test("non-object and non-boolean enabled fall back to defaults", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-shape-"));
	const path = join(dir, "pi-dsh-minimal.json");
	writeFileSync(path, JSON.stringify({ enabled: "yes", modelPatterns: ["x"] }));
	assert.deepEqual(readDshMinimalConfig(path), {
		enabled: DEFAULT_DSH_MINIMAL_CONFIG.enabled,
		modelPatterns: ["x"],
	});
	writeFileSync(path, JSON.stringify([1, 2, 3]));
	assert.deepEqual(readDshMinimalConfig(path), DEFAULT_DSH_MINIMAL_CONFIG);
});
