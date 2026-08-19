import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_DSH_MINIMAL_CONFIG } from "../src/adapter/config.ts";
import { ANCHORED_ENTRY_TYPE, type AdapterState } from "../src/adapter/state.ts";
import { formatDshStatus, registerDshCommand } from "../src/settings/command.ts";

function makeState(overrides: Partial<AdapterState> = {}): AdapterState {
	return {
		anchored: false,
		config: { ...DEFAULT_DSH_MINIMAL_CONFIG },
		surface: "off",
		hasAssistant: false,
		hasTool: false,
		lastBoundaryIndex: -1,
		...overrides,
	};
}

type Handler = (args: string, ctx: never) => Promise<void>;

function makePi(): { pi: ExtensionAPI; handler: Handler; setToolsCalls: string[][]; appended: string[] } {
	const setToolsCalls: string[][] = [];
	const appended: string[] = [];
	let captured: Handler | undefined;
	const pi = {
		registerCommand: (_name: string, options: { handler: Handler }) => {
			captured = options.handler;
		},
		getActiveTools: () => ["read", "bash", "edit", "write"],
		setActiveTools: async (names: string[]) => void setToolsCalls.push(names),
		appendEntry: (customType: string) => void appended.push(customType),
	} as unknown as ExtensionAPI;
	return {
		pi,
		handler: (args: string, ctx: never) => captured!(args, ctx),
		setToolsCalls,
		appended,
	};
}

function anchoredEntry(): SessionEntry {
	return {
		type: "custom",
		customType: ANCHORED_ENTRY_TYPE,
		id: "m1",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
	} as SessionEntry;
}

function makeCtx(
	entries: SessionEntry[] = [],
	model: { id?: string; name?: string; provider?: string } | null = {
		id: "deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		provider: "opencode-go",
	},
): {
	ctx: never;
	notifications: Array<[string, string | undefined]>;
} {
	const notifications: Array<[string, string | undefined]> = [];
	const ctx = {
		model,
		sessionManager: { getEntries: () => entries },
		ui: {
			notify: (message: string, type?: string) => void notifications.push([message, type]),
		},
	};
	return { ctx: ctx as never, notifications };
}

test("formatDshStatus reports switch plus promotion status", () => {
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } }), true),
		"dsh: on · awaiting promotion",
	);
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: false } }), true),
		"dsh: off",
	);
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } }), false, {
			id: "claude-sonnet",
		}),
		"dsh: on · current model not matched",
	);
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } }), false, null),
		"dsh: on · no current model",
	);
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } }), false, {}),
		"dsh: on · no current model",
	);
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } }), false, { id: 42 }),
		"dsh: on · no current model",
	);
	assert.equal(
		formatDshStatus(makeState({ hasAssistant: true }), true),
		"dsh: on · promoted",
	);
	assert.equal(
		formatDshStatus(makeState({ hasTool: true }), true),
		"dsh: on · promoted",
	);
});

test("formatDshStatus reports classification and release", () => {
	assert.equal(
		formatDshStatus(makeState({ classification: "spec" }), true),
		"dsh: on · awaiting promotion · spec",
	);
	assert.equal(
		formatDshStatus(makeState({ classification: "spec", hasAssistant: true }), true),
		"dsh: on · promoted · spec",
	);
	assert.equal(
		formatDshStatus(makeState({ classification: "react" }), true),
		"dsh: on · released (react)",
	);
	assert.equal(
		formatDshStatus(makeState({ classification: "weak" }), true),
		"dsh: on · released (weak)",
	);
});

test("handler on writes config and notifies anchored awaiting", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-on-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx();
	registerDshCommand(pi, state, configPath);
	await handler("on", ctx);
	assert.equal((JSON.parse(readFileSync(configPath, "utf8")) as { enabled: boolean }).enabled, true);
	assert.deepEqual(notifications, [["dsh: on · awaiting promotion", "info"]]);
});

test("handler off writes config and notifies dsh: off", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-off-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx();
	registerDshCommand(pi, state, configPath);
	await handler("off", ctx);
	assert.equal((JSON.parse(readFileSync(configPath, "utf8")) as { enabled: boolean }).enabled, false);
	assert.deepEqual(notifications, [["dsh: off", "info"]]);
});

test("bare and status notify status without writing", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-status-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	writeFileSync(configPath, `${JSON.stringify({ enabled: true, modelPatterns: ["deepseek-v4-pro"] })}\n`);
	const before = readFileSync(configPath, "utf8");

	for (const args of ["", "status"]) {
		const state = makeState();
		const { pi, handler } = makePi();
		const { ctx, notifications } = makeCtx();
		registerDshCommand(pi, state, configPath);
		await handler(args, ctx);
		assert.deepEqual(notifications, [["dsh: on · awaiting promotion", "info"]]);
		assert.equal(readFileSync(configPath, "utf8"), before);
	}
});

test("status on a non-matching model reports enabled but inactive", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-model-mismatch-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	writeFileSync(configPath, `${JSON.stringify({ enabled: true, modelPatterns: ["deepseek-v4-pro"] })}\n`);
	const state = makeState();
	const { pi, handler, setToolsCalls, appended } = makePi();
	const { ctx, notifications } = makeCtx([], { id: "claude-sonnet", name: "Claude", provider: "anthropic" });
	registerDshCommand(pi, state, configPath);
	await handler("status", ctx);
	assert.deepEqual(notifications, [["dsh: on · current model not matched", "info"]]);
	assert.deepEqual(setToolsCalls, []);
	assert.deepEqual(appended, []);
});

test("handler on on a non-matching model writes config and reports inactive", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-on-mismatch-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	const state = makeState();
	const { pi, handler, appended } = makePi();
	const { ctx, notifications } = makeCtx([], { id: "claude-sonnet", name: "Claude", provider: "anthropic" });
	registerDshCommand(pi, state, configPath);
	await handler("on", ctx);
	assert.equal((JSON.parse(readFileSync(configPath, "utf8")) as { enabled: boolean }).enabled, true);
	assert.deepEqual(notifications, [["dsh: on · current model not matched", "info"]]);
	assert.deepEqual(appended, []);
});

test("status with no current model reports enabled but inactive", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-no-model-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	writeFileSync(configPath, `${JSON.stringify({ enabled: true, modelPatterns: ["deepseek-v4-pro"] })}\n`);
	const state = makeState();
	const { pi, handler, setToolsCalls, appended } = makePi();
	const { ctx, notifications } = makeCtx([], null);
	registerDshCommand(pi, state, configPath);
	await handler("status", ctx);
	assert.deepEqual(notifications, [["dsh: on · no current model", "info"]]);
	assert.deepEqual(setToolsCalls, []);
	assert.deepEqual(appended, []);
});

test("handler on with no current model writes config and reports inactive", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-on-no-model-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	const state = makeState();
	const { pi, handler, appended } = makePi();
	const { ctx, notifications } = makeCtx([], null);
	registerDshCommand(pi, state, configPath);
	await handler("on", ctx);
	assert.equal((JSON.parse(readFileSync(configPath, "utf8")) as { enabled: boolean }).enabled, true);
	assert.deepEqual(notifications, [["dsh: on · no current model", "info"]]);
	assert.deepEqual(appended, []);
});

test("status on a resumed session reads the persisted anchored marker", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-resume-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	writeFileSync(configPath, `${JSON.stringify({ enabled: true, modelPatterns: ["deepseek-v4-pro"] })}\n`);
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx([anchoredEntry()]);
	registerDshCommand(pi, state, configPath);
	await handler("status", ctx);
	assert.equal(state.anchored, true);
	assert.deepEqual(notifications, [["dsh: on · awaiting promotion", "info"]]);
});

test("unknown argument notifies the usage line", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omp-dsh-minimal-cmd-usage-"));
	const configPath = join(dir, "omp-dsh-minimal.json");
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx();
	registerDshCommand(pi, state, configPath);
	await handler("bogus", ctx);
	assert.deepEqual(notifications, [["Usage: /dsh, /dsh status, /dsh on|off", "warning"]]);
});
