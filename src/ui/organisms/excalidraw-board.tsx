import { lazy, Suspense, useEffect, useMemo } from "react";
import { Skeleton } from "../atoms/skeleton";
import { type EditorError, toEditorError } from "./error-line";
import { useDark } from "./use-dark";

const Canvas = lazy(() => import("./excalidraw-canvas"));

/**
 * An Excalidraw board. It edits and emits the JSON text through `onChange`.
 * A text that does not parse shows no canvas, reports its error and never calls `onChange`.
 * The canvas reads `text` once: remount it with a `key` to load another file.
 */
export function ExcalidrawBoard({
	text,
	label,
	onChange,
	onError,
}: {
	text: string;
	/** The accessible name of the canvas. */
	label: string;
	onChange: (json: string) => void;
	onError?: (error: EditorError | null) => void;
}) {
	const dark = useDark();
	const error = useMemo(() => {
		try {
			if (text.trim()) JSON.parse(text);
			return null;
		} catch (e) {
			return toEditorError(e);
		}
	}, [text]);
	useEffect(() => onError?.(error), [error, onError]);
	if (error) return null;
	return (
		<Suspense fallback={<Skeleton className="h-96" />}>
			<Canvas text={text} dark={dark} label={label} onChange={onChange} />
		</Suspense>
	);
}
