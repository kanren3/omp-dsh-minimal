import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { desiredSurface, isAdapterActive, syncSurface } from "../src/adapter/activation.ts";
import { DEFAULT_DSH_MINIMAL_CONFIG } from "../src/adapter/config.ts";
import { ANCHORED_ENTRY_TYPE, type AdapterState } from "../src/adapter/state.ts";

function ctx(id: string, name?: string) {
	return { model: { provider: "opencode-go", id, name } };
}

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

interface PiStub {
	pi: ExtensionAPI;
	activeTools: string[];
	setToolsCalls: string[][];
	appended: string[];
}

function makePi(activeTools: string[]): PiStub {
	const stub: PiStub = { pi: undefined as unknown as ExtensionAPI, activeTools: [...activeTools], setToolsCalls: [], appended: [] };
	stub.pi = {
		getActiveTools: () => [...stub.activeTools],
		setActiveTools: async (names: string[]) => {
			stub.setToolsCalls.push(names);
			stub.activeTools = [...names];
		},
		appendEntry: (customType: string) => void stub.appended.push(customType),
	} as unknown as ExtensionAPI;
	return stub;
}

test("isAdapterActive is true only when enabled and matching", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG };
	assert.equal(isAdapterActive(ctx("deepseek-v4-pro", "DeepSeek V4 Pro (New)"), config), true);
	assert.equal(isAdapterActive(ctx("deepseek-v4-flash"), config), true);
	assert.equal(isAdapterActive(ctx("gpt-5.6-luna"), config), false);
	assert.equal(isAdapterActive(ctx("deepseek-v4-pro"), { ...config, enabled: false }), false);
	assert.equal(isAdapterActive(ctx("my-ds-pro"), { ...config, modelPatterns: ["my-ds-pro"] }), true);
});

test("desiredSurface maps active + promoted", () => {
	assert.equal(desiredSurface(true, false), "bootstrap");
	assert.equal(desiredSurface(true, true), "promoted");
	assert.equal(desiredSurface(false, false), "off");
	assert.equal(desiredSurface(false, true), "off");
});

test("off -> bootstrap snapshots tools, appends the marker, and sets the two-tool list", () => {
	const { pi, setToolsCalls, appended } = makePi(["read", "bash", "edit", "write"]);
	const state = makeState();
	syncSurface(pi, state, true, false);
	assert.equal(state.anchored, true);
	assert.deepEqual(appended, [ANCHORED_ENTRY_TYPE]);
	assert.deepEqual(state.previousToolNames, ["read", "bash", "edit", "write"]);
	assert.deepEqual(setToolsCalls, [["bash", "str_replace_editor"]]);
	assert.equal(state.surface, "bootstrap");
});

test("bootstrap -> promoted restores the snapshot and strips the editor", () => {
	const { pi, setToolsCalls } = makePi(["bash", "str_replace_editor"]);
	const state = makeState({
		anchored: true,
		surface: "bootstrap",
		previousToolNames: ["read", "bash", "edit", "write"],
	});
	syncSurface(pi, state, true, true);
	assert.deepEqual(setToolsCalls, [["read", "bash", "edit", "write"]]);
	assert.equal(state.previousToolNames, undefined);
	assert.equal(state.surface, "promoted");
});

test("promoted -> off strips owned tools", () => {
	const { pi, setToolsCalls } = makePi(["read", "bash", "edit", "write", "str_replace_editor"]);
	const state = makeState({ anchored: true, surface: "promoted" });
	syncSurface(pi, state, false, true);
	assert.deepEqual(setToolsCalls, [["read", "bash", "edit", "write"]]);
	assert.equal(state.surface, "off");
});

test("off -> promoted strips the auto-activated editor", () => {
	const { pi, setToolsCalls } = makePi(["read", "bash", "edit", "write", "str_replace_editor"]);
	const state = makeState({ anchored: true });
	syncSurface(pi, state, true, true);
	assert.deepEqual(setToolsCalls, [["read", "bash", "edit", "write"]]);
	assert.equal(state.surface, "promoted");
});
