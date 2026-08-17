/** Built-in bash tool name. */
export const BASH_TOOL_NAME = "bash";
/** Adapter-owned str_replace_editor tool name. */
export const STR_REPLACE_EDITOR_TOOL_NAME = "str_replace_editor";
/** Tools the DSH minimal preset exposes to the LLM during bootstrap. */
export const BOOTSTRAP_TOOL_NAMES = [BASH_TOOL_NAME, STR_REPLACE_EDITOR_TOOL_NAME];
/** Tools registered by this adapter (excluded when the adapter is inactive). */
export const ADAPTER_OWNED_TOOL_NAMES = [STR_REPLACE_EDITOR_TOOL_NAME];

/** Remove adapter-owned tools from a tool name list. */
export function stripOwnedTools(toolNames: string[], ownedTools: string[] = ADAPTER_OWNED_TOOL_NAMES): string[] {
	return toolNames.filter((toolName) => !ownedTools.includes(toolName));
}
