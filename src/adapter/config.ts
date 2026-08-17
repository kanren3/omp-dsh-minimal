import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";

export interface DshMinimalConfig {
	enabled: boolean;
	modelPatterns: string[];
}

export const DSH_MINIMAL_CONFIG_BASENAME = "omp-dsh-minimal.json";

export const DEFAULT_MODEL_PATTERNS = ["deepseek-v4-pro", "deepseek-v4-flash"];

export const DEFAULT_DSH_MINIMAL_CONFIG: DshMinimalConfig = {
	enabled: true,
	modelPatterns: [...DEFAULT_MODEL_PATTERNS],
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeModelPatterns(value: unknown): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? [trimmed] : [...DEFAULT_MODEL_PATTERNS];
	}
	if (!Array.isArray(value)) return [...DEFAULT_MODEL_PATTERNS];
	const patterns = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return patterns.length > 0 ? [...new Set(patterns)] : [...DEFAULT_MODEL_PATTERNS];
}

export function getDshMinimalConfigPath(agentDir: string = getAgentDir()): string {
	return join(agentDir, DSH_MINIMAL_CONFIG_BASENAME);
}

export function readDshMinimalConfig(configPath: string = getDshMinimalConfigPath()): DshMinimalConfig {
	if (!existsSync(configPath)) {
		writeDshMinimalConfig(DEFAULT_DSH_MINIMAL_CONFIG, configPath);
		return cloneConfig(DEFAULT_DSH_MINIMAL_CONFIG);
	}

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
		if (!isObject(parsed)) return cloneConfig(DEFAULT_DSH_MINIMAL_CONFIG);
		return {
			enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_DSH_MINIMAL_CONFIG.enabled,
			modelPatterns: normalizeModelPatterns(parsed.modelPatterns),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[omp-dsh-minimal] Failed to read ${configPath}: ${message}`);
		return cloneConfig(DEFAULT_DSH_MINIMAL_CONFIG);
	}
}

export function writeDshMinimalConfig(
	config: DshMinimalConfig,
	configPath: string = getDshMinimalConfigPath(),
): { ok: true } | { ok: false; error: string } {
	// Write to a sibling temp file then rename: a crash mid-write can no longer
	// leave a truncated config that the reader silently reverts to defaults.
	const tmpPath = `${configPath}.tmp`;
	try {
		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		renameSync(tmpPath, configPath);
		return { ok: true };
	} catch (error) {
		try {
			if (existsSync(tmpPath)) unlinkSync(tmpPath);
		} catch {
			// best-effort cleanup; surface the original error instead
		}
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[omp-dsh-minimal] Failed to write ${configPath}: ${message}`);
		return { ok: false, error: message };
	}
}

export function cloneConfig(config: DshMinimalConfig): DshMinimalConfig {
	return {
		...config,
		modelPatterns: [...config.modelPatterns],
	};
}
