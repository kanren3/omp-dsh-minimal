import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-"));
	const path = join(dir, "omp-dsh-minimal.json");
	const written = writeDshMinimalConfig({ enabled: false, dumpRequests: false, modelPatterns: ["gpt"] }, path);
	assert.equal(written.ok, true);
	assert.deepEqual(readDshMinimalConfig(path), { enabled: false, dumpRequests: false, modelPatterns: ["gpt"] });
	const raw = JSON.parse(readFileSync(path, "utf8")) as { enabled: boolean };
	assert.equal(raw.enabled, false);
});

test("missing file creates the default file and returns defaults", () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-missing-"));
	const path = join(dir, "omp-dsh-minimal.json");
	assert.deepEqual(readDshMinimalConfig(path), DEFAULT_DSH_MINIMAL_CONFIG);
	assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), DEFAULT_DSH_MINIMAL_CONFIG);
});

test("corrupt JSON returns defaults", () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-corrupt-"));
	const path = join(dir, "omp-dsh-minimal.json");
	writeFileSync(path, "{not json");
	assert.deepEqual(readDshMinimalConfig(path), DEFAULT_DSH_MINIMAL_CONFIG);
});

test("non-object and non-boolean enabled fall back to defaults", () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-shape-"));
	const path = join(dir, "omp-dsh-minimal.json");
	writeFileSync(path, JSON.stringify({ enabled: "yes", modelPatterns: ["x"] }));
	assert.deepEqual(readDshMinimalConfig(path), {
		enabled: DEFAULT_DSH_MINIMAL_CONFIG.enabled,
		dumpRequests: DEFAULT_DSH_MINIMAL_CONFIG.dumpRequests,
		modelPatterns: ["x"],
	});
	writeFileSync(path, JSON.stringify([1, 2, 3]));
	assert.deepEqual(readDshMinimalConfig(path), DEFAULT_DSH_MINIMAL_CONFIG);
});

test("atomic write overwrites in place without leaving a temp file", () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-atomic-"));
	const path = join(dir, "omp-dsh-minimal.json");
	writeDshMinimalConfig({ enabled: false, dumpRequests: false, modelPatterns: ["a"] }, path);
	writeDshMinimalConfig({ enabled: true, dumpRequests: false, modelPatterns: ["b"] }, path);
	assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { enabled: true, dumpRequests: false, modelPatterns: ["b"] });
	assert.equal(existsSync(`${path}.tmp`), false);
});

test("a failed write preserves the previous config", () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-fail-"));
	const path = join(dir, "omp-dsh-minimal.json");
	writeDshMinimalConfig({ enabled: false, dumpRequests: false, modelPatterns: ["keep"] }, path);
	const result = writeDshMinimalConfig({ enabled: true, dumpRequests: true, modelPatterns: ["new"] }, dir);
	assert.equal(result.ok, false);
	assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { enabled: false, dumpRequests: false, modelPatterns: ["keep"] });
	assert.equal(existsSync(`${dir}.tmp`), false);
});

test("dumpRequests missing or non-boolean falls back to default", () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-config-dump-"));
	const path = join(dir, "omp-dsh-minimal.json");
	writeFileSync(path, JSON.stringify({ enabled: true, modelPatterns: ["x"] }));
	assert.equal(readDshMinimalConfig(path).dumpRequests, DEFAULT_DSH_MINIMAL_CONFIG.dumpRequests);
	writeFileSync(path, JSON.stringify({ enabled: true, dumpRequests: "yes", modelPatterns: ["x"] }));
	assert.equal(readDshMinimalConfig(path).dumpRequests, DEFAULT_DSH_MINIMAL_CONFIG.dumpRequests);
	writeFileSync(path, JSON.stringify({ enabled: true, dumpRequests: true, modelPatterns: ["x"] }));
	assert.equal(readDshMinimalConfig(path).dumpRequests, true);
});
