// The mock of the chain acknowledgements, the coverage report, the Word view and the document
// search. It mirrors `chain_acks.rs`, `qa.rs` and `documents.rs` of `crates/shipyard-app`.
import type {
	ChainAck,
	ChainWarning_Serialize as ChainWarning,
	Coverage,
	DocHit,
	PageEntry,
	Paragraph,
} from "./bindings";

export type MockReview = {
	acks: ChainAck[];
	/** The paragraphs of each `.docx` file, by path. */
	docx: Record<string, Paragraph[]>;
};

export const seedReview = (): MockReview => ({
	acks: [],
	docx: {
		"docs/documents/kickoff-notes.docx": [
			{ heading: 1, text: "Kickoff notes" },
			{ heading: 0, text: "The client agreed the scope." },
		],
	},
});

const needClick = (click: boolean) => {
	if (!click) throw "this change needs the click of a person";
};

/** The acknowledgement that still covers a warning: it saw every changed file. */
export function withAcks(r: MockReview, warnings: Omit<ChainWarning, "ack">[]): ChainWarning[] {
	return warnings.map((w) => ({
		...w,
		ack:
			r.acks.find(
				(a) => a.from === w.from && a.to === w.to && w.changed.every((c) => a.changed.includes(c)),
			) ?? null,
	}));
}

export function chainAck(
	r: MockReview,
	warnings: Omit<ChainWarning, "ack">[],
	from: string,
	to: string,
	reason: string,
	click: boolean,
) {
	needClick(click);
	if (!reason.trim()) throw "a reason is needed";
	const w = warnings.find((x) => x.from === from && x.to === to);
	if (!w) throw "this link has no warning";
	r.acks = [
		...r.acks.filter((a) => !(a.from === from && a.to === to)),
		{ from, to, reason: reason.trim(), at: "2026-10-30T10:00:00Z", changed: w.changed },
	];
	return null;
}

export function chainAckWithdraw(r: MockReview, from: string, to: string, click: boolean) {
	needClick(click);
	r.acks = r.acks.filter((a) => !(a.from === from && a.to === to));
	return null;
}

export const coverage = (): Coverage => ({
	source: "coverage/lcov.info",
	percent: 82,
	covered: 163,
	total: 200,
});

export const docxList = (r: MockReview): PageEntry[] =>
	Object.keys(r.docx)
		.sort()
		.map((path) => ({ path, title: (path.split("/").pop() ?? path).replace(/\.docx$/, "") }));

export function docxRead(r: MockReview, path: string): Paragraph[] {
	const p = r.docx[path];
	if (!p) throw `${path}: no such file`;
	return p;
}

/** The first line of each page that holds the text, in any case. */
export function docSearch(files: Record<string, { text: string }>, query: string): DocHit[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return Object.entries(files)
		.filter(([p]) => p.endsWith(".md") && p.startsWith("docs/documents/"))
		.sort(([a], [b]) => a.localeCompare(b))
		.flatMap(([path, f]) => {
			const lines = f.text.split("\n");
			const i = lines.findIndex((l) => l.toLowerCase().includes(q));
			if (i < 0) return [];
			const title =
				lines
					.find((l) => l.startsWith("# "))
					?.slice(2)
					.trim() || path;
			return [{ path, title, line: i + 1, snippet: (lines[i] ?? "").trim().slice(0, 160) }];
		})
		.slice(0, 50);
}

/**
 * A rename or a delete of a file that the Specs or Knowledge mock holds: the file moves in its own
 * map. It returns `false` when no map holds the path, so the working copy takes the action.
 */
export function moveFile(
	maps: Record<string, unknown>[],
	kind: "rename" | "delete",
	path: string,
	to: string | undefined,
	click: boolean,
): boolean {
	const map = maps.find((m) => Object.keys(m).some((k) => k === path || k.startsWith(`${path}/`)));
	if (!map) return false;
	needClick(click);
	const family = Object.keys(map).filter((k) => k === path || k.startsWith(`${path}/`));
	if (kind === "delete") {
		for (const k of family) delete map[k];
		return true;
	}
	const dst = to ?? "";
	if (maps.some((m) => Object.keys(m).some((k) => k === dst || k.startsWith(`${dst}/`))))
		throw `${dst} already exists`;
	for (const k of family) {
		map[dst + k.slice(path.length)] = map[k];
		delete map[k];
	}
	return true;
}
