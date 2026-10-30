// The mock of the Projects page, the push-target check, the docs-chain gate and the Legacy ticket
// links. It applies the rules of `crates/shipyard-app/src/commands/overview.rs`.
import type {
	ChainWarning,
	DeliveryNote,
	ProjectCard_Serialize,
	ProjectEntry_Serialize,
	TicketLink,
} from "./bindings";

export const seedLinks = (): TicketLink[] => [
	{ key: "feat-sync", issueKey: "ACME-3", level: "story", state: "synced", specRef: "spec:sync" },
	{ key: "feat-board", issueKey: "", level: "story", state: "proposed", specRef: "" },
];

export const seedNotes = (): DeliveryNote[] => [
	{
		path: "docs/delivery/impacts/2026-10-20-sync.md",
		title: "Sync impact",
		date: "2026-10-20",
		base: "main",
		audience: "developer",
	},
];

/** One card for each project. The first project has a remote on `example.com`. */
export function cards(list: ProjectEntry_Serialize[]): ProjectCard_Serialize[] {
	return list.map((p, i) => ({
		id: p.id,
		name: p.name,
		path: p.path,
		host: i === 0 ? "example.com" : null,
		webUrl: i === 0 ? `https://example.com/acme/${p.id}` : null,
		branch: p.state === "missing" ? null : "main",
		lastCommit: p.state === "missing" ? null : "feat: first commit",
		lastCommitTime: p.state === "missing" ? null : 1_790_000_000,
		ahead: i === 0 ? 2 : 0,
		behind: 0,
		changes: p.state === "changed" ? 3 : 0,
	}));
}

const inside = (path: string, folder: string) => path.startsWith(`${folder}/`);

/** A spec in the staged files with no test plan beside it is a warning. */
export function chainGate(changed: string[]): ChainWarning[] {
	const up = changed.filter((p) => inside(p, "docs/openspec"));
	if (up.length === 0 || changed.some((p) => inside(p, "docs/delivery/test-plans"))) return [];
	return [{ from: "specs", to: "test-plans", changed: up }];
}
