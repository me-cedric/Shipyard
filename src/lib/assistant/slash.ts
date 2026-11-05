// The slash and `@` words of the composer. The commands come from the runner (`assistantSlashCommands`).

/** The text after the `/` when the draft is only a command, else null. */
export function slashQuery(draft: string): string | null {
	return /^\/(\S*)$/.exec(draft)?.[1] ?? null;
}

/** The `@` word at the end of the draft: where it starts and what follows the `@`. */
export function mentionAt(draft: string): { start: number; query: string } | null {
	const m = /(^|\s)@(\S*)$/.exec(draft);
	return m ? { start: m.index + (m[1]?.length ?? 0), query: m[2] ?? "" } : null;
}
