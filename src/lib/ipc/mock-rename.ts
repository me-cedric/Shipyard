import type { LinkFile } from "./bindings";

type Files = Record<string, unknown>;

/** A mock file is a string or an object with a `text`. */
const textOf = (v: unknown): string | null =>
	typeof v === "string"
		? v
		: typeof (v as { text?: unknown })?.text === "string"
			? (v as { text: string }).text
			: null;

/** Mock only: the text files of the mock maps that name `from`, with the line changes for `to`. */
export function linkChanges(maps: Files[], from: string, to: string): LinkFile[] {
	return maps.flatMap((m) =>
		Object.entries(m).flatMap(([path, v]) => {
			const text = textOf(v);
			if (path === from || !text?.includes(from)) return [];
			const lines = text
				.split("\n")
				.flatMap((before, i) =>
					before.includes(from)
						? [{ line: i + 1, before, after: before.replaceAll(from, to) }]
						: [],
				);
			return [{ path, lines }];
		}),
	);
}

/** Writes the changes of `linkChanges` into the maps. */
export function rewriteLinks(maps: Files[], from: string, to: string) {
	for (const m of maps)
		for (const [path, v] of Object.entries(m)) {
			const text = textOf(v);
			if (!text?.includes(from)) continue;
			const next = text.replaceAll(from, to);
			if (typeof v === "string") m[path] = next;
			else (v as { text: string }).text = next;
		}
}
