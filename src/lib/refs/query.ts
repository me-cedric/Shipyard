import { useSyncExternalStore } from "react";

/** The text of the search that opened the current view. The open document marks its words. */
let current = "";
const listeners = new Set<() => void>();

export function setHitQuery(q: string) {
	if (q === current) return;
	current = q;
	for (const l of listeners) l();
}

export function useHitQuery() {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => current,
	);
}

/** The words of a text, folded for the match: lower case, no accents. Same rule as the index. */
export const foldWords = (text: string) =>
	text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

/** Splits a snippet from the index into plain and matched parts. The markers are control characters. */
export function snippetParts(snippet: string): { text: string; hit: boolean }[] {
	return snippet
		.split("\u0002")
		.flatMap((chunk, i) => {
			const [hit, rest] = i === 0 ? ["", chunk] : chunk.split("\u0003");
			return [
				{ text: hit ?? "", hit: true },
				{ text: rest ?? "", hit: false },
			];
		})
		.filter((p) => p.text);
}
