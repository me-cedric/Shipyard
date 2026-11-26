import { useEffect, useRef } from "react";

// One form at a time: a link asks for it, the view that it opens takes it.
let pending: string | null = null;
let pendingKind: string | null = null;

/** Asks the next view to open its form: a Get started step opens the form, not only the page. */
export const askForm = (form: string, kind?: string) => {
	pending = form;
	pendingKind = kind ?? null;
};

/** The product that the person picked before the link, once: the form opens on it. */
export const takeFormKind = () => {
	const k = pendingKind;
	pendingKind = null;
	return k ?? undefined;
};

/** Runs `open` once, after a link asked for `form`, as soon as the view is `ready`. */
export function useFormIntent(form: string, open: () => void, ready = true) {
	const latest = useRef(open);
	latest.current = open;
	useEffect(() => {
		if (!ready || pending !== form) return;
		pending = null;
		latest.current();
	}, [form, ready]);
}

/** `useFormIntent` for a form named `prefix` + `rest`, such as `member:ada`: `open` gets `rest`. */
export function useFormIntentFor(prefix: string, open: (rest: string) => void, ready = true) {
	const latest = useRef(open);
	latest.current = open;
	useEffect(() => {
		if (!ready || !pending?.startsWith(prefix)) return;
		const rest = pending.slice(prefix.length);
		pending = null;
		latest.current(rest);
	}, [prefix, ready]);
}
