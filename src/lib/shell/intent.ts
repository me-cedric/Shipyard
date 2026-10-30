import { useEffect, useRef } from "react";

// One form at a time: a link asks for it, the view that it opens takes it.
let pending: string | null = null;

/** Asks the next view to open its form: a Get started step opens the form, not only the page. */
export const askForm = (form: string) => {
	pending = form;
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
