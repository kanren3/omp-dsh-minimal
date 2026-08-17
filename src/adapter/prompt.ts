import { MINIMAL_PROMPT } from "../dsh/official.ts";

export const OMP_IDENTITY = "Helpful, trusted assistant for load-bearing changes in Oh My Pi coding harness.";

/**
 * Official persona first; drop omp's role identity line when present so the
 * model keeps one identity.
 */
export function reanchorPersona(system: string): string {
	const text = system.replace(/^\uFEFF/, "").trimStart();
	if (text.startsWith(MINIMAL_PROMPT)) return system;
	if (text.includes(OMP_IDENTITY)) return MINIMAL_PROMPT + text.replace(OMP_IDENTITY, "");
	if (text.length === 0) return MINIMAL_PROMPT;
	return `${MINIMAL_PROMPT}\n\n${text}`;
}
