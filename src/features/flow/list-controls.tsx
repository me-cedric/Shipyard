import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { connectTarget } from "@/features/onboarding/checklist";
import { connectionKeys } from "@/features/settings/connections/keys";
import { NameDialog } from "@/features/specs/name-dialog";
import { TicketDialog } from "@/features/specs/ticket-dialog";
import { ALL, type Filters, NONE } from "@/features/work/filters";
import { useGuard } from "@/features/work/guard";
import { useOpenSetting } from "@/lib/errors";
import { format, useI18n } from "@/lib/i18n";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { RightButton, useRights } from "@/lib/rights";
import { askForm, useFormIntent } from "@/lib/shell";
import { useSpecsActions } from "@/lib/specs";
import { useBacklogActions, type WorkItem } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import type { MenuButtonItem } from "@/ui/molecules/menu-button";
import { Terms } from "@/ui/molecules/term";
import { MenuPill } from "./menu-pill";
import { statusesOf } from "./ticket-facts";

/** The address of the page of a feature, found by the ref of one of its parts. */
export const useGoFeature = () => {
	const navigate = useNavigate();
	return (ref: string, section?: "brief" | "ticket") =>
		void navigate({
			to: "/flow/feature/$featureId",
			params: { featureId: ref },
			search: section === "ticket" ? { ticket: true } : section ? { section } : {},
		});
};

const distinct = (xs: (string | null)[]) =>
	[...new Set(xs.filter((x): x is string => x !== null))].sort((a, b) => a.localeCompare(b));

/**
 * The controls of Flow / List that are not about one row. `bar` is the row above the list: the
 * filter pills (Owner, Label, Agent) and Bring a ticket by its key. `menu` gives the items of the
 * More menu: Import, From a ticket, New change, Connect an issue tracker and the status filter.
 * `empty` is what shows in place of an empty list. `on` is false on the other views of Flow.
 */
export function useListControls({
	on,
	items,
	loading,
	loadError,
	filters,
	onFilters,
}: {
	on: boolean;
	items: WorkItem[];
	loading: boolean;
	loadError: unknown;
	filters: Filters;
	onFilters: (next: Filters) => void;
}): { bar: ReactNode; menu: MenuButtonItem[]; status: string; empty: ReactNode } {
	const { t } = useI18n();
	const b = t.flow.look.board;
	const w = t.work.backlog;
	const go = useGoFeature();
	const act = useSpecsActions();
	const qc = useQueryClient();
	const { gate } = useRights();
	const { planImport, confirmImport, adopt } = useBacklogActions();
	const { failure, busy, run } = useGuard();
	const openSetting = useOpenSetting();
	const [planned, setPlanned] = useState<number | null>(null);
	const [key, setKey] = useState("");
	const [creating, setCreating] = useState(false);
	const [fromTicket, setFromTicket] = useState(false);
	useFormIntent("change", () => setCreating(true), on);
	// Get started asks to assign: the first ticket without an assignee opens on its page, with its assignee field.
	useFormIntent(
		"assign",
		() => {
			const item = items.find((i) => !i.assignee);
			if (item) go(`wi:${item.key}`, "brief");
		},
		on && !loading,
	);
	// The same cache as Settings / Project. A project without a linked issue tracker has nothing to import.
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data;
	const connections = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const noTracker = !!settings && !settings.file?.connections?.tracker;
	const startImport = () => run(async () => setPlanned(await planImport()));
	const connect = () => {
		const to = connectTarget(
			"tracker",
			connections?.some((c) => c.group === "tracker"),
		);
		if (to.form) askForm(to.form);
		openSetting(to.hash ? `${to.to}#${to.hash}` : to.to);
	};
	const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
	/** One filter pill: the chosen value is in its label and has the mark in its list. */
	const pill = (
		field: "assignee" | "label" | "run",
		text: string,
		all: string,
		options: { value: string; label: string }[],
	) => {
		const now = options.find((o) => o.value === filters[field])?.label ?? b.all;
		return (
			<MenuPill
				label={format(text, { value: now })}
				value={filters[field]}
				items={[{ value: ALL, label: all }, ...options].map((o) => ({
					id: o.value,
					label: o.label,
					value: o.value,
					onSelect: () => set({ [field]: o.value }),
				}))}
			/>
		);
	};
	const menu: MenuButtonItem[] = on
		? [
				noTracker
					? { id: "connect", label: t.glossary.connectTracker, onSelect: connect }
					: {
							id: "import",
							label: t.sync.backlog.import,
							...gate("work.edit"),
							onSelect: () => void startImport(),
						},
				{ id: "from-ticket", label: t.specs.fromTicket, onSelect: () => setFromTicket(true) },
				{
					id: "new-change",
					label: t.specs.newChange,
					...gate("specs.edit"),
					onSelect: () => setCreating(true),
				},
				// The status filter of the tickets: one choice for each status.
				...[
					{ status: ALL, label: t.sync.backlog.allStatuses },
					...statusesOf(items).map((s) => ({ status: s.status, label: s.status })),
				].map((s) => ({
					id: `status:${s.status}`,
					label: s.label,
					value: s.status,
					onSelect: () => set({ status: s.status }),
				})),
			]
		: [];
	const bar = (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: a group of menu buttons, not a form fieldset. */}
			<div
				role="group"
				aria-label={b.filters}
				className="flex shrink-0 flex-wrap items-center gap-2.5"
			>
				{pill("assignee", b.owner, w.allAssignees, [
					{ value: NONE, label: t.sync.backlog.unassigned },
					...distinct(items.map((i) => i.assignee)).map((a) => ({ value: a, label: a })),
				])}
				{pill(
					"label",
					b.label,
					w.allLabels,
					distinct(items.flatMap((i) => i.labels)).map((l) => ({ value: l, label: l })),
				)}
				{pill("run", b.agent, w.allRuns, [
					{ value: "claimed", label: t.sync.backlog.claimed },
					{ value: "free", label: w.free },
				])}
				<span className="flex-1" />
				{planned === null ? null : (
					<>
						<p role="status">{format(t.sync.backlog.openTickets, { count: planned })}</p>
						<RightButton
							right="work.edit"
							variant="primary"
							busy={busy}
							onClick={() =>
								void run(async () => {
									await confirmImport();
									await qc.invalidateQueries({ queryKey: ["features"] });
									setPlanned(null);
								})
							}
						>
							{t.sync.backlog.confirm}
						</RightButton>
						<Button variant="ghost" onClick={() => setPlanned(null)}>
							{t.sync.backlog.cancel}
						</Button>
					</>
				)}
				<form
					className="flex items-center gap-2.5"
					onSubmit={(e) => {
						e.preventDefault();
						if (!key.trim()) return;
						void run(async () => {
							const k = key.trim();
							await adopt(k).catch((e: unknown) => {
								// The backend says "not found: <key>": a person reads a plain sentence.
								const said = toFailure(e).details;
								throw /^not found/i.test(said) ? new Error(format(b.noTicket, { key: k })) : e;
							});
							await qc.invalidateQueries({ queryKey: ["features"] });
							setKey("");
						});
					}}
				>
					<Input
						label={t.flow.bring}
						value={key}
						onChange={(e) => setKey(e.target.value)}
						className="w-65"
					/>
					<RightButton
						type="submit"
						right="work.edit"
						disabled={!key.trim()}
						className="disabled:opacity-100"
					>
						{b.bring}
					</RightButton>
				</form>
			</div>
			<ErrorNotice error={failure} className="w-full" />
			{fromTicket ? (
				<TicketDialog
					onOpen={(c) => {
						setFromTicket(false);
						void qc.invalidateQueries({ queryKey: ["features"] });
						go(`change:${c.id}`, "brief");
					}}
					onClose={() => setFromTicket(false)}
				/>
			) : null}
			{creating ? (
				<NameDialog
					title={t.specs.newChange}
					label={t.specs.changeId}
					onCreate={async (id) => {
						const c = await act.createChange(id);
						await qc.invalidateQueries({ queryKey: ["features"] });
						go(`change:${c.id}`, "brief");
					}}
					onClose={() => setCreating(false)}
				/>
			) : null}
		</>
	);
	// The empty states of the backlog show only in place of an empty list: they never push it down.
	const empty = loadError ? (
		<ErrorNotice error={loadError} className="justify-center" />
	) : noTracker ? (
		<EmptyState
			title={<Terms>{t.glossary.noTracker}</Terms>}
			icon={<LinkIcon size={28} />}
			action={{ label: t.glossary.connectTracker, icon: <LinkIcon size={14} />, onClick: connect }}
		/>
	) : !loading && items.length === 0 && planned === null ? (
		<EmptyState
			title={t.empty.tickets}
			action={{
				label: t.sync.backlog.import,
				icon: <PlusIcon size={14} />,
				onClick: () => void startImport(),
				busy,
			}}
		/>
	) : (
		<EmptyState title={t.flow.empty} />
	);
	return { bar, menu, status: filters.status, empty };
}
