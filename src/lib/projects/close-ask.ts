import { useSyncExternalStore } from "react";

export type CloseAnswer = "cancel" | "stop" | "keep";
type Ask = { count: number; keys: string[]; answer: (a: CloseAnswer) => void };

let current: Ask | null = null;
const listeners = new Set<() => void>();
const set = (a: Ask | null) => {
	current = a;
	for (const l of listeners) l();
};

/** The question of a project close while agents work (`spec:shell-setup-rights#REQ-012`). One question shows at a time. */
export function askProjectClose(keys: string[]): Promise<CloseAnswer> {
	return new Promise((resolve) => {
		current?.answer("cancel");
		set({
			count: keys.length,
			keys,
			answer: (a) => {
				if (current?.answer === ask.answer) set(null);
				resolve(a);
			},
		});
		const ask = current as Ask;
	});
}

/** The open question, or null. */
export const useProjectCloseAsk = () =>
	useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => current,
	);

/** Cancels the open question, when the shell goes away. */
export const dropProjectCloseAsk = () => current?.answer("cancel");
