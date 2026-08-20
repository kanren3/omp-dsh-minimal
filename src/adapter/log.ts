import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";

export interface RequestDumpEntry {
	timestamp: string;
	phase: "pre" | "post";
	surface: string;
	promoted: boolean;
	model?: string;
	payload: unknown;
}

/** Path to the request dump file inside the omp agent directory. */
function dumpPath(): string {
	return join(getAgentDir(), "omp-dsh-minimal-requests.json");
}

/**
 * Append the full provider request payload to a JSON array file. Called
 * before and after dsh-minimal rewrites it so the complete delta — including
 * instructions, tools, input history, and every field — is observable.
 * No-op unless `enabled` is true (gated by the `dumpRequests` config key).
 * structuredClone isolates the snapshot from later in-place mutation.
 */
export function dumpRequest(
	payload: unknown,
	phase: "pre" | "post",
	surface: string,
	promoted: boolean,
	model: string | undefined,
	enabled: boolean,
): void {
	if (!enabled) return;
	try {
		const entry: RequestDumpEntry = {
			timestamp: new Date().toISOString(),
			phase,
			surface,
			promoted,
			model,
			payload: structuredClone(payload),
		};
		const path = dumpPath();
		mkdirSync(dirname(path), { recursive: true });
		let entries: RequestDumpEntry[] = [];
		if (existsSync(path)) {
			try {
				const raw = readFileSync(path, "utf-8");
				const parsed: unknown = raw.trim().length > 0 ? JSON.parse(raw) : [];
				if (Array.isArray(parsed)) entries = parsed as RequestDumpEntry[];
			} catch {
				// corrupt file: start fresh rather than lose new dumps
			}
		}
		entries.push(entry);
		writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[omp-dsh-minimal] request dump write failed: ${message}`);
	}
}
