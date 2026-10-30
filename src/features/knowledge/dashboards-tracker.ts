import { useI18n } from "@/lib/i18n";
import type { TileData } from "@/lib/knowledge";
import { useWorkItems, type WorkItem } from "@/lib/sync";
import { memberName, useTeam, useWorkContext } from "@/lib/work";

/** The most rows that a tile shows, as the Rust store. */
const TILE_ROWS = 50;

export const isTrackerTile = (kind: string) => kind.startsWith("tracker-");

/** Templates of tiles for one role. The first dashboard of a project holds every tile. */
export const TEMPLATES = {
	pm: ["tracker-open", "tracker-status", "tracker-assignee", "estimates", "questions", "work"],
	architect: ["specs", "impact", "quality", "questions"],
	developer: ["tracker-assignee", "tracker-status", "runs", "quality"],
	qa: ["quality", "tracker-status", "runs", "specs"],
} as const;

/** Three tiles to a row, four columns wide and three rows high. */
export const layout = (kinds: readonly string[]) =>
	kinds.map((kind, i) => ({
		id: kind,
		kind,
		x: (i % 3) * 4,
		y: Math.floor(i / 3) * 3,
		w: 4,
		h: 3,
	}));

function count(items: WorkItem[], key: (i: WorkItem) => string) {
	const by = new Map<string, number>();
	for (const i of items) by.set(key(i), (by.get(key(i)) ?? 0) + 1);
	const rows = [...by]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([l, n]) => [l, String(n)]);
	return { rows: rows.slice(0, TILE_ROWS), cut: rows.length > TILE_ROWS };
}

/**
 * The rows of a tracker tile, from the mirror of the tracker: open items by type, items by
 * status, open items by assignee. With `person`, only the items of that member count. No
 * request leaves the machine. Without a tracker the tile is off.
 */
export function useTrackerTile(kind: string, person: string | null | undefined): TileData {
	const k = useI18n().t.knowledge.dashboards;
	const ctx = useWorkContext().data;
	const members = useTeam().data?.team.members ?? [];
	const items = useWorkItems({}).data ?? [];
	if (ctx && !ctx.tracker) return { kind, columns: [], rows: [], cut: false, off: "tracker" };
	const mine = person ? items.filter((i) => i.member === person) : items;
	const open = mine.filter((i) => i.category !== "done");
	const [label, data] =
		kind === "tracker-status"
			? [k.col.status, count(mine, (i) => i.status)]
			: kind === "tracker-assignee"
				? [
						k.col.assignee,
						count(open, (i) =>
							i.member ? memberName(members, i.member) : (i.assignee ?? k.unassigned),
						),
					]
				: [k.col.type, count(open, (i) => i.kind)];
	return { kind, columns: [label, k.col.count], rows: data.rows, cut: data.cut, off: null };
}
