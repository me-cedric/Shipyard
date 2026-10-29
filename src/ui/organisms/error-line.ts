/** One error of an editor: the message and, when known, its 1-based line. */
export type EditorError = { message: string; line?: number | null };

/** The line that a parser message names ("line 4", "Line: 4", "file.c4:4:2"). */
export function errorLine(message: string): number | null {
	const m = /\bline[\s:]+(\d+)/i.exec(message) ?? /:(\d+):\d+/.exec(message);
	return m?.[1] ? Number(m[1]) : null;
}

/** An error from a library. The line comes from the error, then from the message. */
export function toEditorError(e: unknown, line?: number | null): EditorError {
	const message = e instanceof Error ? e.message : String(e);
	return { message, line: line ?? (e as { line?: number } | null)?.line ?? errorLine(message) };
}
