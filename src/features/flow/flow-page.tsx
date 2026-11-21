import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAgentsSwitch } from "@/features/factory/agents-toggle";
import {
	EXTRA_COLUMNS,
	type ExtraColumn,
	type HistoryRow,
	RunHistory,
} from "@/features/factory/runs/run-history";
import { useMyItems } from "@/features/home/stats";
import { runnerKeys } from "@/features/settings/connections/keys";
import { NoProject } from "@/features/shell/no-project";
import { hiddenSection } from "@/features/shell/places";
import { tabIcon } from "@/features/shell/spaces";
import { ALL, applyFilters, type Filters, NO_FILTER } from "@/features/work/filters";
import { useGuard } from "@/features/work/guard";
import { useOpenSetting } from "@/lib/errors";
import { ENDED, useRunActions, useRuns } from "@/lib/factory";
import { historyRuns } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, confirmDialog, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize as Feature, RunState } from "@/lib/ipc/bindings";
import { copyText } from "@/lib/menus";
import { useNotifications } from "@/lib/notifications";
import { useActiveProject } from "@/lib/projects";
import { foldWords } from "@/lib/refs";
import { useRights, useRightsView } from "@/lib/rights";
import { runHref, useFormIntent, useShell } from "@/lib/shell";
import { useViewState } from "@/lib/shell/view-state";
import { useWorkItems } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { CpuChipIcon, PlusIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import type { MenuItem } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import type { MenuButtonItem } from "@/ui/molecules/menu-button";
import { PageHeader } from "@/ui/molecules/page-header";
import { Terms } from "@/ui/molecules/term";
import { featureKey, needsPerson, STAGES, useFeatures, useOpenFeature } from "./feature";
import { FeatureCard, FeatureRow } from "./feature-card";
import { useGoFeature, useListControls } from "./list-controls";
import { DOTS, MenuPill } from "./menu-pill";
import { runMatcher } from "./run-match";
import { statusesOf, TicketFacts, useEstimateDays } from "./ticket-facts";

/** The ends that the filter of Done offers, in the order of the design. */
const ENDS: RunState[] = ["Merged", "Done", "Failed", "Cancelled"];

type Filter = "all" | "needs" | "mine";
/** The text and the filter live in the address, so Back and a reload keep them. */
type FlowSearch = { q?: string; filter?: "needs" | "mine" };

/** What a card or a row can do besides open: the actions of the board, the runs and the backlog of before. */
function useFeatureMenu(go: (job: () => Promise<unknown>) => void) {
	const { t } = useI18n();
	const m = t.flow.menu;
	const { gate } = useRights();
	const { openRef } = useShell();
	const open = useOpenFeature();
	const navigate = useNavigate();
	const { push } = useNotifications();
	const runs = useRunActions();
	const work = useWorkActions();
	const goFeature = useGoFeature();
	const items = useWorkItems({}).data ?? [];
	const statuses = useMemo(() => statusesOf(items), [items]);
	return (f: Feature): MenuItem[] => {
		const key = f.ticket?.replace(/^wi:/, "");
		const run = f.run?.replace(/^run:/, "");
		const live = f.runState != null && !ENDED.includes(f.runState);
		const start = gate("runs.start");
		const edit = gate("work.edit");
		const now = items.find((i) => i.key === key)?.status;
		const out: MenuItem[] = [{ id: "open", label: m.open, onSelect: () => open(f) }];
		if (key && !live)
			out.push({
				id: "start",
				label: m.startRun,
				...start,
				// The new run opens, as Start again on a card of Runs did.
				onSelect: () => go(async () => navigate(runHref(await runs.start(key)))),
			});
		if (run && live)
			out.push({
				id: "stop",
				label: m.stopRun,
				...start,
				// Tell the person, with a way to the history (as Stop on a card of Runs did).
				onSelect: () =>
					go(async () => {
						// Stop kills the run: ask first, as the confirmation on a card of Runs did.
						if (
							!(await confirmDialog(
								format(t.factory.machine.confirmStop, { name: key ?? f.title }),
							))
						)
							return;
						await runs.cancel(run);
						void push({
							id: `run-stopped:${run}`,
							kind: "info",
							title: format(t.factory.runsList.stopped, { key: key ?? f.title }),
							action: {
								label: t.factory.runsList.history,
								run: () => void navigate({ to: "/flow/done" }),
							},
						});
					}),
			});
		// Assign, priority and estimate are fields of the ticket page.
		if (key)
			out.push({
				id: "edit",
				label: m.edit,
				onSelect: () => goFeature(f.ticket ?? "", "ticket"),
			});
		if (f.pr) {
			const pr = f.pr;
			out.push({ id: "pr", label: m.openPullRequest, onSelect: () => openRef(pr) });
		}
		if (key)
			for (const [i, s] of statuses.filter((x) => x.status !== now).entries())
				out.push({
					id: `move:${s.status}`,
					label: format(m.moveTo, { status: s.status }),
					separated: i === 0,
					...edit,
					onSelect: () => go(() => work.transition(key, s.status)),
				});
		const ref = f.ticket ?? f.change ?? f.run ?? f.pr;
		if (ref)
			out.push({
				id: "copy-ref",
				label: m.copyRef,
				separated: !key,
				onSelect: () => void copyText(ref),
			});
		const change = f.change;
		if (change && change !== ref)
			out.push({
				id: "copy-change-ref",
				label: m.copyChangeRef,
				onSelect: () => void copyText(change),
			});
		return out;
	};
}

/**
 * The page of the views `flow`, `list` and `done`: the title row (the filter, the view switch, New
 * and More), then the view. `spec:app-redesign#REQ-010`.
 */
function FlowPage({ view }: { view: "flow" | "list" | "done" }) {
	const { t } = useI18n();
	const l = t.factory.runsList;
	const b = t.flow.look.board;
	const navigate = useNavigate();
	const qc = useQueryClient();
	const search: FlowSearch = useSearch({ strict: false });
	const filter: Filter = search.filter ?? "all";
	const [text, setText] = useState(search.q ?? "");
	// Find a feature, in More, opens the search field of Flow and List. A text keeps it open.
	const [finding, setFinding] = useState(false);
	const [end, setEnd] = useState<RunState | "all">("all");
	const [columns, setColumns] = useViewState<ExtraColumn[]>("done:columns", []);
	const set = (patch: FlowSearch, replace = false) =>
		void navigate({ search: (prev: FlowSearch) => ({ ...prev, ...patch }), replace } as never);
	const find = (q: string) => {
		setText(q);
		set({ q: q || undefined }, true);
	};
	const features = useFeatures();
	const runs = useRuns();
	const openSetting = useOpenSetting();
	const open = useOpenFeature();
	// The same cache as Settings / Connections. While it loads, the page shows no notice.
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const act = useRunActions();
	const agents = useAgentsSwitch();
	const mine = useMyItems();
	const { failure, run: guard } = useGuard();
	// Get started asks to start a run: the ticket field is on New feature.
	useFormIntent("run", () => void navigate({ to: "/flow/new" }));
	const go = (job: () => Promise<unknown>) =>
		void guard(async () => {
			try {
				await job();
			} finally {
				await qc.invalidateQueries({ queryKey: ["features"] });
			}
		});
	const menuOf = useFeatureMenu(go);
	// The filters of the tickets (owner, label, agent, status) filter the feature rows of the list.
	const [filters, setFilters] = useViewState<Filters>("filters:backlog", NO_FILTER);
	const tickets = useWorkItems({});
	const list = useListControls({
		on: view === "list",
		items: tickets.data ?? [],
		loading: tickets.isLoading,
		loadError: tickets.error,
		filters,
		onFilters: setFilters,
	});
	const days = useEstimateDays();
	const itemOf = useMemo(
		() => new Map((tickets.data ?? []).map((i) => [i.key, i])),
		[tickets.data],
	);
	// A ticket with a run that has not ended cannot start another one.
	const running = useMemo(
		() => new Set((runs.data ?? []).filter((r) => !ENDED.includes(r.state)).map((r) => r.key)),
		[runs.data],
	);
	const mineKeys = useMemo(() => new Set(mine.map((i) => i.key)), [mine]);
	const shown = useMemo(() => {
		const q = foldWords(text);
		const ticketFilter =
			view === "list" &&
			(["status", "assignee", "label", "run"] as const).some((k) => filters[k] !== ALL);
		const passes = (f: Feature) => {
			if (!ticketFilter) return true;
			const item = itemOf.get(f.ticket?.replace(/^wi:/, "") ?? "");
			return !!item && applyFilters([item], { ...filters, text: "" }).length > 0;
		};
		const rows = (features.data ?? []).filter(
			(f) =>
				passes(f) &&
				(q.length === 0 ||
					q.every((w) =>
						foldWords(`${f.title} ${f.ticket ?? ""}`)
							.join(" ")
							.includes(w),
					)) &&
				(filter === "all" ||
					(filter === "needs"
						? needsPerson(f)
						: mineKeys.has(f.ticket?.replace(/^wi:/, "") ?? ""))),
		);
		// The List puts the rows that need a person first (picture 012); the sort is stable.
		return view === "list" ? rows.sort((a, b) => +needsPerson(b) - +needsPerson(a)) : rows;
	}, [features.data, text, filter, mineKeys, view, filters, itemOf]);
	const ended = useMemo(() => historyRuns(runs.data ?? []), [runs.data]);
	const history = useMemo(
		() => ended.filter(runMatcher(text, filter, mineKeys)),
		[ended, text, filter, mineKeys],
	);
	const active = useActiveProject().data;
	// The write controls wait for the rights, so a viewer never sees one on for a moment.
	const rights = useRightsView();
	// New and Add an idea open `/flow/new`, which shows with the List (`spec:app-redesign#REQ-006`).
	const noList = hiddenSection(useRights().level, "flow", "list");
	const Icon = tabIcon("flow", view);
	if (active === undefined)
		return <Loading title={t.ui.place.flow} icon={Icon && <Icon size={16} />} />;
	if (active === null)
		return <NoProject title={t.ui.place.flow} icon={Icon && <Icon size={16} />} />;
	if (rights.isPending)
		return <Loading title={t.ui.place.flow} icon={Icon && <Icon size={16} />} />;
	/** Done: each ended run, then each finished feature that has no run in the history. */
	const doneRows = (): HistoryRow[] => {
		const byRun = new Map((features.data ?? []).map((f) => [f.run, f]));
		const listed = new Set(ended.map((r) => r.reference));
		const out: HistoryRow[] = history.map((r) => {
			const f = byRun.get(r.reference);
			// The person of the ticket, else the agent of the last step that ran.
			const step = [...r.steps].reverse().find((s) => s.state !== "pending");
			return {
				id: r.id,
				title: r.title,
				ticket: r.key,
				end: r.state,
				who: f?.who ?? (step ? { name: step.id, agent: true } : null),
				run: r,
				menu: f ? menuOf(f) : undefined,
				onOpen: () => void navigate(runHref(r.id)),
				onAgain:
					r.state === "Failed" && !running.has(r.key)
						? () => go(async () => navigate(runHref(await act.start(r.key))))
						: undefined,
			};
		});
		for (const f of shown)
			if (f.stage === "ready" && !(f.run && listed.has(f.run)))
				out.push({
					id: featureKey(f),
					title: f.title,
					ticket: f.ticket?.replace(/^wi:/, ""),
					end: "Done",
					who: f.who,
					menu: menuOf(f),
					onOpen: () => open(f),
				});
		return out.filter((r) => end === "all" || r.end === end);
	};
	const extra: Record<ExtraColumn, string> = {
		workflow: l.workflow,
		steps: l.steps,
		ended: l.ended,
		pr: l.pullRequest,
	};
	// The controls that the design does not show: each one is an item of More.
	const more: MenuButtonItem[] = [
		...(view === "done" ? [] : [{ id: "find", label: b.find, onSelect: () => setFinding(true) }]),
		...(noList
			? []
			: [
					{
						id: "start",
						label: b.fromTicket,
						onSelect: () => void navigate({ to: "/flow/new" }),
					},
				]),
		...list.menu,
		...(view === "done"
			? EXTRA_COLUMNS.map((c) => ({
					id: `column:${c}`,
					label: extra[c],
					checked: columns.includes(c),
					onSelect: () =>
						setColumns(columns.includes(c) ? columns.filter((x) => x !== c) : [...columns, c]),
				}))
			: []),
		...(agents.kill === undefined
			? []
			: [
					{
						id: "agents",
						label: t.factory.agentsOn,
						checked: !agents.kill,
						onSelect: () => agents.set(!!agents.kill),
					},
				]),
	];
	return (
		// `PageHeader` has no slot at the left of the view switch: the title takes the free width, so
		// that the filter (its `chips`) sits next to the switch.
		<div className="flex flex-1 flex-col [&_[data-page-header]_h1]:grow-[999]">
			<PageHeader
				title={t.ui.place.flow}
				chips={
					// The Segmented atom gives each item a fixed width: chips in a group fit their labels.
					// biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form fieldset.
					<div
						role="group"
						aria-label={t.flow.filter}
						className="flex items-center rounded-md bg-n-4 p-1"
					>
						{(["all", "needs", "mine"] as const).map((v) => (
							<Chip
								key={v}
								selected={filter === v}
								className={cn(
									"rounded-sm",
									filter === v
										? "bg-surface-1 text-n-12 shadow-1"
										: "bg-transparent text-n-10 hover:text-n-12",
								)}
								onClick={() => set({ filter: v === "all" ? undefined : v })}
							>
								{t.flow.filters[v]}
							</Chip>
						))}
					</div>
				}
				action={
					<>
						{noList ? null : (
							<Button variant="primary" onClick={() => void navigate({ to: "/flow/new" })}>
								<PlusIcon size={16} />
								{b.new}
							</Button>
						)}
						<MenuPill
							label={t.ui.more}
							icon={DOTS}
							items={more}
							value={view === "list" ? list.status : undefined}
						/>
					</>
				}
			/>
			<div className="flex flex-1 flex-col gap-6 px-4 pb-10">
				{view === "done" ? (
					<div className="flex shrink-0 flex-wrap items-center gap-4">
						<Input
							label={b.findDone}
							type="search"
							className="w-105 max-w-full"
							value={text}
							onChange={(e) => find(e.target.value)}
						/>
						<span className="flex-1" />
						{/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form fieldset. */}
						<div role="group" aria-label={b.endState} className="flex flex-wrap gap-2">
							{(["all", ...ENDS] as const).map((e) => (
								<Chip
									key={e}
									selected={end === e}
									className={end === e ? undefined : "bg-surface-2"}
									onClick={() => setEnd(e)}
								>
									{e === "all" ? t.flow.filters.all : t.factory.state[e]}
								</Chip>
							))}
						</div>
					</div>
				) : finding || text ? (
					<Input
						label={b.find}
						type="search"
						autoFocus
						className="w-105 max-w-full shrink-0"
						value={text}
						onChange={(e) => find(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== "Escape") return;
							find("");
							setFinding(false);
						}}
					/>
				) : null}
				<ErrorNotice error={failure ?? agents.failure} className="w-full" />
				{/* A failed load shows its sentence, not empty columns. */}
				<ErrorNotice
					error={features.error ?? runs.error}
					className="w-full"
					onDone={() => void Promise.all([features.refetch(), runs.refetch()])}
				/>
				{view === "flow" && (runs.data ?? []).length === 0 && runners ? (
					runners.every((r) => r.state !== "detected") ? (
						<EmptyState
							title={<Terms>{t.glossary.noRunner}</Terms>}
							icon={<CpuChipIcon size={28} />}
							action={{
								label: t.glossary.setUpRunner,
								onClick: () => openSetting("/setup/computer#connections-runner"),
							}}
						/>
					) : (features.data ?? []).length === 0 && !features.error ? (
						<EmptyState
							title={t.empty.runs}
							action={{ label: b.fromTicket, onClick: () => void navigate({ to: "/flow/new" }) }}
						/>
					) : null
				) : null}
				{view === "flow" ? (
					<div className="shrink-0 overflow-x-auto p-0.5">
						<div className="grid min-w-[65rem] grid-cols-5 items-start gap-3.5">
							{STAGES.map((stage) => {
								const cards = shown.filter((f) => f.stage === stage);
								const label = t.flow.stages[stage];
								return (
									<section
										key={stage}
										aria-label={label}
										className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-n-4 p-3"
									>
										<h2 className="flex items-center gap-2 px-2 pt-1.5 pb-2 text-15 font-semibold text-n-12">
											{label}
											<span className="font-medium text-n-11">{cards.length}</span>
										</h2>
										<ul className="flex flex-col gap-2.5 empty:hidden">
											{cards.map((f) => (
												<li key={featureKey(f)}>
													<FeatureCard feature={f} menu={menuOf(f)} />
												</li>
											))}
										</ul>
										{stage === "idea" && !noList ? (
											<button
												type="button"
												className="min-h-control rounded-field border border-dashed border-n-8 font-medium text-n-10 hover:text-n-12"
												onClick={() => void navigate({ to: "/flow/new", search: { kind: "idea" } })}
											>
												{t.flow.addIdea}
											</button>
										) : null}
									</section>
								);
							})}
						</div>
					</div>
				) : view === "list" ? (
					<>
						{list.bar}
						{shown.length === 0 ? (
							list.empty
						) : (
							<Card className="shrink-0 overflow-hidden py-2">
								<ul aria-label={t.flow.features}>
									{shown.map((f) => {
										const key = f.ticket?.replace(/^wi:/, "") ?? "";
										const item = itemOf.get(key);
										return (
											<li key={featureKey(f)} className="border-n-6 not-first:border-t">
												<FeatureRow
													feature={f}
													menu={menuOf(f)}
													facts={
														item ? <TicketFacts item={item} days={days.get(key)} /> : undefined
													}
												/>
											</li>
										);
									})}
								</ul>
							</Card>
						)}
					</>
				) : (
					<RunHistory
						rows={doneRows()}
						columns={columns}
						onBoard={() => void navigate({ to: "/flow/flow" })}
					/>
				)}
			</div>
		</div>
	);
}

export const FlowBoard = () => <FlowPage view="flow" />;
export const FlowList = () => <FlowPage view="list" />;
export const FlowDone = () => <FlowPage view="done" />;
