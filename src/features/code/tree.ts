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
				name: file.path.split("/").at(-1) ?? file.path,
				depth,
				file,
			});
	};
	walk(root, "", 0);
	return rows;
}
