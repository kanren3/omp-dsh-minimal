import test from "node:test";
import assert from "node:assert/strict";
import { classifyTask, extractFirstUserText } from "../src/adapter/classify.ts";

test("classifyTask: clear react keywords pick the react band", () => {
	assert.equal(classifyTask("帮我从零开发一个网页游戏"), "react");
	assert.equal(classifyTask("create a new project and build it"), "react");
});

test("classifyTask: clear spec keywords pick the spec band", () => {
	assert.equal(classifyTask("修复这个崩溃问题并排查报错"), "spec");
	assert.equal(classifyTask("fix the broken refactor and debug the crash"), "spec");
});

test("classifyTask: keyword counts decide ties between the bands", () => {
	assert.equal(classifyTask("重构这个模块并优化性能"), "spec");
	assert.equal(classifyTask("开发一个页面并创建一个按钮，顺带修复一个 bug"), "react");
});

test("classifyTask: ambiguous or unmatched text falls to weak", () => {
	assert.equal(classifyTask("帮我看看这个项目"), "weak");
	assert.equal(classifyTask(""), "weak");
	assert.equal(classifyTask("介绍一下这个仓库的结构"), "weak");
});

test("extractFirstUserText reads a string-content user message", () => {
	const payload = {
		messages: [
			{ role: "system", content: "You are Pi." },
			{ role: "user", content: "修复登录报错" },
		],
	};
	assert.equal(extractFirstUserText(payload), "修复登录报错");
});

test("extractFirstUserText joins array text parts", () => {
	const payload = {
		messages: [{ role: "user", content: [{ type: "text", text: "写一个" }, { type: "text", text: "CLI 工具" }] }],
	};
	assert.equal(extractFirstUserText(payload), "写一个CLI 工具");
});

test("extractFirstUserText skips empty user messages", () => {
	const payload = {
		messages: [
			{ role: "user", content: "" },
			{ role: "user", content: [{ type: "text", text: "  " }] },
			{ role: "user", content: "调试这个脚本" },
		],
	};
	assert.equal(extractFirstUserText(payload), "调试这个脚本");
});

test("extractFirstUserText returns empty when no user message exists", () => {
	assert.equal(extractFirstUserText({ messages: [{ role: "system", content: "x" }] }), "");
	assert.equal(extractFirstUserText({}), "");
	assert.equal(extractFirstUserText(null), "");
	assert.equal(extractFirstUserText("nope"), "");
	assert.equal(extractFirstUserText({ messages: "nope" }), "");
});
