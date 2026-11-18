import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { RunHistory } from "@/features/factory/runs/run-history";
import { TicketPicker } from "@/features/factory/ticket-picker";
import { useMyItems } from "@/features/home/stats";
import { runnerKeys } from "@/features/settings/connections/keys";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { ALL, applyFilters, type Filters, NO_FILTER } from "@/features/work/filters";
import { useGuard } from "@/features/work/guard";
import { useOpenSetting } from "@/lib/errors";
import { ENDED, useRunActions, useRuns } from "@/lib/factory";
import { historyRuns } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { AppFailure, commands, confirmDialog, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { copyText } from "@/lib/menus";
import { useNotifications } from "@/lib/notifications";
import { useActiveProject } from "@/lib/projects";
import { foldWords } from "@/lib/refs";
import { RightButton, useRights, useRightsView } from "@/lib/rights";
import { runHref, useFormIntent, useShell } from "@/lib/shell";
import { useViewState } from "@/lib/shell/view-state";
import { useWorkItems } from "@/lib/sync";
import { useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { CpuChipIcon, PlayIcon, PlusIcon } from "@/ui/icons";
import type { MenuItem } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { Terms } from "@/ui/molecules/term";
import { featureKey, needsPerson, STAGES, useFeatures, useOpenFeature } from "./feature";
import { FeatureCard, FeatureRow } from "./feature-card";
import { ListControls, useGoFeature } from "./list-controls";
import { runMatcher } from "./run-match";
import { statusesOf, TicketFacts, useEstimateDays } from "./ticket-facts";

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
		// Assign, priority and estimate are fields of the ticket, in the Brief of its page.
		if (key)
			out.push({
				id: "edit",
				label: m.edit,
				onSelect: () => goFeature(f.ticket ?? "", "brief"),
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
 * The page of the views `flow`, `list` and `done`: one bar (search, filter, kill switch, start a
 * run, New), then the view. `spec:app-redesign#REQ-010`.
 */
function FlowPage({ view }: { view: "flow" | "list" | "done" }) {
	const { t } = useI18n();
	const l = t.factory.runsList;
	const navigate = useNavigate();
	const qc = useQueryClient();
	const search: FlowSearch = useSearch({ strict: false });
	const filter: Filter = search.filter ?? "all";
	const [text, setText] = useState(search.q ?? "");
	const set = (patch: FlowSearch, replace = false) =>
		void navigate({ search: (prev: FlowSearch) => ({ ...prev, ...patch }), replace } as never);
	const features = useFeatures();
	const runs = useRuns();
	const openSetting = useOpenSetting();
	// The same cache as Settings / Connections. While it loads, the page shows no notice.
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const act = useRunActions();
	const mine = useMyItems();
	const { failure, run: guard } = useGuard();
	const [key, setKey] = useState("");
	const field = useRef<HTMLInputElement>(null);
	useFormIntent("run", () => field.current?.focus());
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
	const days = useEstimateDays();
	const itemOf = useMemo(
		() => new Map((tickets.data ?? []).map((i) => [i.key, i])),
		[tickets.data],
	);
	// A ticket with a run that has not ended cannot start another one: the run, by ticket key.
	const running = useMemo(
		() =>
			new Map((runs.data ?? []).filter((r) => !ENDED.includes(r.state)).map((r) => [r.key, r.id])),
		[runs.data],
	);
	const skip = useMemo(() => new Set(running.keys()), [running]);
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
		return (features.data ?? []).filter(
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
	}, [features.data, text, filter, mineKeys, view, filters, itemOf]);
	const history = useMemo(
		() => historyRuns(runs.data ?? []).filter(runMatcher(text, filter, mineKeys)),
		[runs.data, text, filter, mineKeys],
	);
	const active = useActiveProject().data;
	// The write controls wait for the rights, so a viewer never sees one on for a moment.
	const rights = useRightsView();
	const Icon = tabIcon("flow", view);
	if (active === undefined)
		return <Loading title={t.ui.place.flow} icon={Icon && <Icon size={16} />} />;
	if (active === null)
		return <NoProject title={t.ui.place.flow} icon={Icon && <Icon size={16} />} />;
	if (rights.isPending)
		return <Loading title={t.ui.place.flow} icon={Icon && <Icon size={16} />} />;
	const start = () =>
		void guard(async () => {
			await act.start(key.trim());
			setKey("");
			await qc.invalidateQueries({ queryKey: ["features"] });
		});
	// The refusal of a ticket that has a run links to that run.
	const taken =
		failure instanceof AppFailure && failure.code === "run_active"
			? running.get(key.trim())
			: undefined;
	const rows = (list: Feature[]): ReactNode => (
		<ul
			aria-label={t.flow.features}
			className="flex flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1"
		>
			{list.map((f) => {
				const key = f.ticket?.replace(/^wi:/, "") ?? "";
				const item = itemOf.get(key);
				return (
					<li key={featureKey(f)}>
						<FeatureRow
							feature={f}
							menu={menuOf(f)}
							facts={item ? <TicketFacts item={item} days={days.get(key)} /> : undefined}
						/>
					</li>
				);
			})}
		</ul>
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={Icon && <Icon size={16} />}
				title={t.ui.place.flow}
				chips={<AgentsToggle />}
				action={
					<Button
						variant="primary"
						className="min-h-control"
						onClick={() => void navigate({ to: "/flow/new" })}
					>
						<PlusIcon size={14} />
						{t.flow.newAction}
					</Button>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-2 pb-4">
				<div className="flex shrink-0 flex-wrap items-center gap-3">
					<Input
						label={l.search}
						type="search"
						className="w-64"
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							set({ q: e.target.value || undefined }, true);
						}}
					/>
					<div className="w-72">
						<Segmented
							label={t.flow.filter}
							value={filter}
							onValueChange={(v) => set({ filter: v === "all" ? undefined : v })}
							items={[
								{ value: "all", label: t.flow.filters.all },
								{ value: "needs", label: t.flow.filters.needs },
								{ value: "mine", label: t.flow.filters.mine },
							]}
						/>
					</div>
					<span className="flex-1" />
					<TicketPicker
						ref={field}
						label={t.factory.ticket}
						className="w-56"
						value={key}
						onChange={setKey}
						onSubmit={start}
						skip={skip}
					/>
					<RightButton
						right="runs.start"
						disabled={!key.trim()}
						onClick={start}
						className="min-h-control"
					>
						<PlayIcon size={14} />
						{t.factory.start}
					</RightButton>
				</div>
				{taken ? (
					<p role="alert" className="flex w-full items-center gap-2 text-ui text-danger-text">
						{format(t.factory.runActive, { key: key.trim() })}
						<Button className="min-h-control" onClick={() => void navigate(runHref(taken))}>
							{t.factory.openRun}
						</Button>
					</p>
				) : (
					<ErrorNotice error={failure} className="w-full" />
				)}
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
							action={{ label: t.factory.start, onClick: () => field.current?.focus() }}
						/>
					) : null
				) : null}
				{view === "flow" ? (
					<div className="min-h-0 flex-1 overflow-x-auto">
						<div className="grid h-full min-h-0 min-w-[80rem] grid-cols-5 grid-rows-[minmax(0,1fr)] gap-3 min-[1100px]:min-w-0">
							{STAGES.map((stage) => {
								const cards = shown.filter((f) => f.stage === stage);
								const label = t.flow.stages[stage];
								return (
									<section
										key={stage}
										aria-label={label}
										className="flex min-h-0 min-w-0 flex-col gap-2 rounded-xl bg-n-2 p-2"
									>
										<h2 className="flex items-center gap-2 px-1 text-14 font-medium text-n-12">
											{label}
											<span className="font-mono text-12 text-n-11">{cards.length}</span>
										</h2>
										<ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-0.5">
											{cards.map((f) => (
												<li key={featureKey(f)}>
													<FeatureCard feature={f} menu={menuOf(f)} />
												</li>
											))}
										</ul>
										{stage === "idea" ? (
											<Button
												className="min-h-control"
												onClick={() => void navigate({ to: "/flow/new", search: { kind: "idea" } })}
											>
												<PlusIcon size={14} />
												{t.flow.addIdea}
											</Button>
										) : null}
									</section>
								);
							})}
						</div>
					</div>
				) : view === "list" ? (
					<>
						<ListControls
							items={tickets.data ?? []}
							loading={tickets.isLoading}
							loadError={tickets.error}
							filters={filters}
							onFilters={setFilters}
						/>
						{shown.length === 0 ? <EmptyState title={t.flow.empty} /> : rows(shown)}
					</>
				) : (
					<>
						{shown.some((f) => f.stage === "ready") ? (
							<>
								<h2 className="text-14 font-medium text-n-12">{t.flow.finished}</h2>
								{rows(shown.filter((f) => f.stage === "ready"))}
							</>
						) : null}
						<RunHistory
							runs={history}
							onOpen={(id) => void navigate(runHref(id))}
							onBoard={() => void navigate({ to: "/flow/flow" })}
						/>
					</>
				)}
			</div>
		</div>
	);
}

export const FlowBoard = () => <FlowPage view="flow" />;
export const FlowList = () => <FlowPage view="list" />;
export const FlowDone = () => <FlowPage view="done" />;
