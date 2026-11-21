import type { MergeMethod } from "@/lib/code";

const KEY = "shipyard.merge-method";
const METHODS: MergeMethod[] = ["merge", "squash", "rebase"];

/** The method that the person picked as the default for the Merge button. A per-person convenience. */
export function savedMergeMethod(): MergeMethod | null {
	try {
		const v = localStorage.getItem(KEY);
		return METHODS.find((m) => m === v) ?? null;
	} catch {
		return null;
	}
}

export function saveMergeMethod(method: MergeMethod) {
	try {
		localStorage.setItem(KEY, method);
	} catch {
		// Private window or blocked storage: the default stays the first method of the code host.
	}
}

/** The method of the Merge button: the saved default when the code host offers it, else its first. */
export function defaultMergeMethod(offered: MergeMethod[]): MergeMethod {
	const saved = savedMergeMethod();
	return saved && offered.includes(saved) ? saved : (offered[0] ?? "merge");
}
