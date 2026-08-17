import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_DSH_MINIMAL_CONFIG } from "../src/adapter/config.ts";
import type { AdapterState } from "../src/adapter/state.ts";
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

function makeCtx(): { ctx: never; notifications: Array<[string, string | undefined]> } {
	const notifications: Array<[string, string | undefined]> = [];
	const ctx = {
		model: { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "opencode-go" },
		ui: {
			notify: (message: string, type?: string) => void notifications.push([message, type]),
		},
	};
	return { ctx: ctx as never, notifications };
}

test("formatDshStatus reports only on/off", () => {
	assert.equal(formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: true } })), "dsh: on");
	assert.equal(formatDshStatus(makeState({ config: { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: false } })), "dsh: off");
});

test("handler on writes config and notifies dsh: on", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-cmd-on-"));
	const configPath = join(dir, "pi-dsh-minimal.json");
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx();
	registerDshCommand(pi, state, configPath);
	await handler("on", ctx);
	assert.equal((JSON.parse(readFileSync(configPath, "utf8")) as { enabled: boolean }).enabled, true);
	assert.deepEqual(notifications, [["dsh: on", "info"]]);
});

test("handler off writes config and notifies dsh: off", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-cmd-off-"));
	const configPath = join(dir, "pi-dsh-minimal.json");
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx();
	registerDshCommand(pi, state, configPath);
	await handler("off", ctx);
	assert.equal((JSON.parse(readFileSync(configPath, "utf8")) as { enabled: boolean }).enabled, false);
	assert.deepEqual(notifications, [["dsh: off", "info"]]);
});

test("bare and status notify status without writing", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-cmd-status-"));
	const configPath = join(dir, "pi-dsh-minimal.json");
	writeFileSync(configPath, `${JSON.stringify({ enabled: true, modelPatterns: ["deepseek-v4-pro"] })}\n`);
	const before = readFileSync(configPath, "utf8");

	for (const args of ["", "status"]) {
		const state = makeState();
		const { pi, handler } = makePi();
		const { ctx, notifications } = makeCtx();
		registerDshCommand(pi, state, configPath);
		await handler(args, ctx);
		assert.deepEqual(notifications, [["dsh: on", "info"]]);
		assert.equal(readFileSync(configPath, "utf8"), before);
	}
});

test("unknown argument notifies the usage line", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-cmd-usage-"));
	const configPath = join(dir, "pi-dsh-minimal.json");
	const state = makeState();
	const { pi, handler } = makePi();
	const { ctx, notifications } = makeCtx();
	registerDshCommand(pi, state, configPath);
	await handler("bogus", ctx);
	assert.deepEqual(notifications, [["Usage: /dsh, /dsh status, /dsh on|off", "warning"]]);
});
