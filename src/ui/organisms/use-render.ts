import { useEffect, useRef, useState } from "react";
import { type EditorError, toEditorError } from "./error-line";

/**
 * Render a source text after a short pause. A failure reports its error and keeps the last good
 * result. A success clears the error. An old run never replaces a newer one.
 */
export function useRender<T>(
	source: string,
	render: (source: string) => Promise<T>,
	onError?: (error: EditorError | null) => void,
	delay = 250,
): T | null {
	const [value, setValue] = useState<T | null>(null);
	const run = useRef(0);
	const latest = useRef({ render, onError });
	latest.current = { render, onError };
	useEffect(() => {
		const id = ++run.current;
		const timer = setTimeout(async () => {
			try {
				const v = await latest.current.render(source);
				if (id !== run.current) return;
				setValue(() => v);
				latest.current.onError?.(null);
			} catch (e) {
				if (id === run.current) latest.current.onError?.(toEditorError(e));
			}
		}, delay);
		return () => {
			clearTimeout(timer);
			run.current++;
		};
	}, [source, delay]);
	return value;
}

/** The text of an error that carries its line. */
export class LineError extends Error {
	constructor(
		message: string,
		readonly line?: number | null,
	) {
		super(message);
	}
}
