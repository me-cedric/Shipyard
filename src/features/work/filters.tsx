import { useI18n } from "@/lib/i18n";
import type { WorkItem } from "@/lib/sync";
import { Select } from "@/ui/atoms/select";
import { FilterBar } from "@/ui/molecules/filter-bar";

export const ALL = "all";
/** The value of "no assignee". It cannot be a tracker account: `@@` is no part of one. */
export const NONE = "@@none";

export type Filters = {
	text: string;
	status: string;
	assignee: string;
	label: string;
	/** `claimed` or `free`. */
	run: string;
};

export const NO_FILTER: Filters = { text: "", status: ALL, assignee: ALL, label: ALL, run: ALL };

const has = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());

/** The mirror is on this machine, so the filter runs here and no tracker is called (REQ-001). */
export function applyFilters(items: WorkItem[], f: Filters): WorkItem[] {
	return items.filter(
		(i) =>
			(f.text === "" || has(i.key, f.text) || has(i.title, f.text)) &&
			(f.status === ALL || i.status === f.status) &&
			(f.assignee === ALL ||
				(f.assignee === NONE ? i.assignee === null : i.assignee === f.assignee)) &&
			(f.label === ALL || i.labels.includes(f.label)) &&
			(f.run === ALL || (f.run === "claimed") === i.claimed),
	);
}

const distinct = (xs: (string | null)[]) =>
	[...new Set(xs.filter((x): x is string => x !== null))].sort((a, b) => a.localeCompare(b));

/** The search box and one select for each part of the filter that `fields` names. */
export function ItemFilters({
	items,
	value,
	onChange,
	fields,
}: {
	items: WorkItem[];
	value: Filters;
	onChange: (next: Filters) => void;
	fields: ("status" | "assignee" | "label" | "run")[];
}) {
	const { t } = useI18n();
	const w = t.work.backlog;
	const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
	const select = (
		field: (typeof fields)[number],
		label: string,
		all: string,
		options: { value: string; label: string }[],
	) =>
		fields.includes(field) ? (
			<Select
				label={label}
				value={value[field]}
				onValueChange={(v) => set({ [field]: v })}
				items={[{ value: ALL, label: all }, ...options]}
			/>
		) : null;
	return (
		<>
			<FilterBar
				query={value.text}
				onQueryChange={(text) => set({ text })}
				filters={[]}
				active={[]}
				onToggle={() => {}}
			/>
			{select(
				"status",
				t.sync.backlog.status,
				t.sync.backlog.allStatuses,
				distinct(items.map((i) => i.status)).map((s) => ({ value: s, label: s })),
			)}
			{select("assignee", w.assignee, w.allAssignees, [
				{ value: NONE, label: t.sync.backlog.unassigned },
				...distinct(items.map((i) => i.assignee)).map((a) => ({ value: a, label: a })),
			])}
			{select(
				"label",
				w.label,
				w.allLabels,
				distinct(items.flatMap((i) => i.labels)).map((l) => ({ value: l, label: l })),
			)}
			{select("run", w.run, w.allRuns, [
				{ value: "claimed", label: t.sync.backlog.claimed },
				{ value: "free", label: w.free },
			])}
		</>
	);
}
