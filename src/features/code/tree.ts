import type { FileChange } from "@/lib/code";

export type TreeRow =
	| { kind: "folder"; path: string; name: string; depth: number; files: string[] }
	| { kind: "file"; path: string; name: string; depth: number; file: FileChange };

type Node = { dirs: Map<string, Node>; files: FileChange[] };

const collect = (n: Node): string[] => [
	...n.files.map((f) => f.path),
	...[...n.dirs.values()].flatMap(collect),
];

/** The changed files as folder rows and file rows, folders first, each level sorted by name. */
export function treeRows(files: FileChange[]): TreeRow[] {
	const root: Node = { dirs: new Map(), files: [] };
	for (const f of files) {
		let node = root;
		const parts = f.path.split("/");
		for (const dir of parts.slice(0, -1)) {
			let next = node.dirs.get(dir);
			if (!next) {
				next = { dirs: new Map(), files: [] };
				node.dirs.set(dir, next);
			}
			node = next;
		}
		node.files.push(f);
	}
	const rows: TreeRow[] = [];
	const walk = (node: Node, prefix: string, depth: number) => {
		for (const [name, child] of [...node.dirs].sort(([a], [b]) => a.localeCompare(b))) {
			rows.push({ kind: "folder", path: `${prefix}${name}`, name, depth, files: collect(child) });
			walk(child, `${prefix}${name}/`, depth + 1);
		}
		for (const file of [...node.files].sort((a, b) => a.path.localeCompare(b.path)))
			rows.push({
				kind: "file",
				path: file.path,
				// A renamed file shows `old → new`; its row sits under the new path.
				name: `${file.old_path ? `${file.old_path} → ` : ""}${file.path.split("/").at(-1)}`,
				depth,
				file,
			});
	};
	walk(root, "", 0);
	return rows;
}

/** One changed file of the flat list: where its changes are. */
export type FlatRow = {
	path: string;
	file: FileChange;
	staged: boolean;
	unstaged: boolean;
	conflict: boolean;
};

/** The changed files as one flat list, one row per path, sorted by path. A file with a staged and an unstaged change is one row. */
export function flatRows(c: {
	staged: FileChange[];
	unstaged: FileChange[];
	untracked: FileChange[];
	conflicted: FileChange[];
}): FlatRow[] {
	const rows = new Map<string, FlatRow>();
	const add = (file: FileChange, where: "staged" | "unstaged" | "conflict") => {
		const row = rows.get(file.path) ?? {
			path: file.path,
			file,
			staged: false,
			unstaged: false,
			conflict: false,
		};
		row[where] = true;
		rows.set(file.path, row);
	};
	for (const f of c.conflicted) add(f, "conflict");
	for (const f of c.staged) add(f, "staged");
	for (const f of [...c.unstaged, ...c.untracked]) add(f, "unstaged");
	return [...rows.values()].sort((a, b) => a.path.localeCompare(b.path));
}
