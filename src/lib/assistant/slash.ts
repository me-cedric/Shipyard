// The slash commands of the composer (Legacy `composer-menu.tsx`: the prompts of the current
// screen). A command inserts its prompt in the draft. The person reads it and sends it.

export type SlashId =
	| "explain"
	| "fix"
	| "review"
	| "summarize"
	| "plan"
	| "tests"
	| "commit"
	| "spec"
	| "triage";

const COMMON: SlashId[] = ["explain", "fix", "review", "summarize", "plan"];
/** The commands that a space adds in front of the common ones, by path prefix. */
const BY_VIEW: [string, SlashId[]][] = [
	["/code", ["tests", "commit"]],
	["/specs", ["spec"]],
	["/factory", ["triage"]],
];

/** The text after the `/` when the draft is only a command, else null. */
export function slashQuery(draft: string): string | null {
	return /^\/(\S*)$/.exec(draft)?.[1] ?? null;
}

/** The commands of the view that start with the query. */
export function slashFor(view: string, query: string): SlashId[] {
	const own = BY_VIEW.find(([prefix]) => view.startsWith(prefix))?.[1] ?? [];
	return [...own, ...COMMON].filter((id) => id.startsWith(query.toLowerCase()));
}

/** The `@` word at the end of the draft: where it starts and what follows the `@`. */
export function mentionAt(draft: string): { start: number; query: string } | null {
	const m = /(^|\s)@(\S*)$/.exec(draft);
	return m ? { start: m.index + (m[1]?.length ?? 0), query: m[2] ?? "" } : null;
}
