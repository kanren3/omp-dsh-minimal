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
		previousToolNames: undefined,
		hasAssistant: false,
		hasTool: false,
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

function makeCtx(entries: SessionEntry[] = []): {
	ctx: never;
	notifications: Array<[string, string | undefined]>;
} {
	const notifications: Array<[string, string | undefined]> = [];
	const ctx = {
		model: { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "opencode-go" },
		sessionManager: { getEntries: () => entries },
		ui: {
			notify: (message: string, type?: string) => void notifications.push([message, type]),
		},
	};
	return { ctx: ctx as never, notifications };
}

test("formatDshStatus reports switch plus anchored state", () => {
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } })),
		"dsh: on · session not anchored",
	);
	assert.equal(
		formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: false } })),
		"dsh: off · session not anchored",
	);
	assert.equal(
		formatDshStatus(makeState({ anchored: true, hasAssistant: false, hasTool: false })),
		"dsh: on · anchored, awaiting first reply",
	);
	assert.equal(
		formatDshStatus(makeState({ anchored: true, hasAssistant: true })),
		"dsh: on · anchored → promoted",
	);
	assert.equal(
		formatDshStatus(makeState({ anchored: true, hasTool: true })),
		"dsh: on · anchored → promoted",
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
	assert.deepEqual(notifications, [["dsh: on · anchored, awaiting first reply", "info"]]);
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
	assert.deepEqual(notifications, [["dsh: off · session not anchored", "info"]]);
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
		assert.deepEqual(notifications, [["dsh: on · session not anchored", "info"]]);
		assert.equal(readFileSync(configPath, "utf8"), before);
	}
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
	assert.deepEqual(notifications, [["dsh: on · anchored, awaiting first reply", "info"]]);
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
