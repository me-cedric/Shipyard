import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMyItems } from "@/features/home/stats";
import { runnerKeys } from "@/features/settings/connections/keys";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { useOpenSetting } from "@/lib/errors";
import { ENDED, useRunActions, useRuns } from "@/lib/factory";
import { historyRuns, latestPerTicket, type RunItem } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { AppFailure, commands, type Lane, unwrap } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { useNotifications } from "@/lib/notifications";
import { showAnchor } from "@/lib/notifications/targets";
import { useActiveProject } from "@/lib/projects";
import { foldWords } from "@/lib/refs";
import { RightButton, useRights } from "@/lib/rights";
import { runHref, useFormIntent } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { CpuChipIcon, InboxIcon, PlayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { Panel, type PanelTone } from "@/ui/molecules/panel";
import { RunCard } from "@/ui/molecules/run-card";
import { Terms } from "@/ui/molecules/term";
import { ListDetail } from "@/ui/templates/list-detail";
import { AgentsToggle } from "../agents-toggle";
import { TicketPicker } from "../ticket-picker";
import { progressOf } from "./run-detail";
import { RunHistory } from "./run-history";
import { nameOf } from "./run-live";
import { stepperOf } from "./run-summary";

const LANES: [Lane, PanelTone][] = [
	["queued", "neutral"],
	["working", "accent"],
	["needs_you", "warning"],
	["in_review", "info"],
	["ready_to_merge", "success"],
];

/** The three choices of the bar. They live in the address, so Back and a reload keep them. */
type RunsSearch = { q?: string; filter?: "needs" | "mine"; view?: "history" };

/** Factory / Runs: a bar, then five lanes or the history, the kill switch and one action, start a run (factory REQ-027, REQ-038; ux-declutter REQ-034 to REQ-037). */
export function Runs() {
	const { t } = useI18n();
	const menu = useMenus();
	const f = t.factory;
	const l = f.runsList;
	const active = useActiveProject().data;
	const runs = useRuns();
	const act = useRunActions();
	const { push } = useNotifications();
	const openSetting = useOpenSetting();
	const { gate } = useRights();
	// The same cache as Settings / Connections. While it loads, the page shows the usual empty state.
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const { failure, run: guard } = useGuard();
	const [key, setKey] = useState("");
	const navigate = useNavigate();
	const open = (id: string) => void navigate(runHref(id));
	const search: RunsSearch = useSearch({ strict: false });
	const filter = search.filter ?? "all";
	const view = search.view ?? "board";
	// The field keeps its own text: the address gives it back only on a reload.
	const [text, setText] = useState(search.q ?? "");
	const go = (patch: RunsSearch, replace = false) =>
		void navigate({
			to: "/factory/runs",
			search: (prev: RunsSearch) => ({ ...prev, ...patch }),
			replace,
		} as never);
	const field = useRef<HTMLInputElement>(null);
	const board = useRef<HTMLDivElement>(null);
	useFormIntent("run", () => field.current?.focus());
	// Runs of the tickets assigned to the person: the items that Home / Today lists.
	const mine = useMyItems();
	const all = runs.data;
	// A ticket with a run that has not ended cannot start another one: the run, by ticket key.
	const running = useMemo(
		() => new Map((all ?? []).filter((r) => !ENDED.includes(r.state)).map((r) => [r.key, r.id])),
		[all],
	);
	const skip = useMemo(() => new Set(running.keys()), [running]);
	// The search and the filter read the list that is in memory: they never fetch.
	const shown = useMemo(() => {
		const q = foldWords(text);
		const keys = new Set(mine.map((i) => i.key));
		const fit = (r: RunItem) =>
			(q.length === 0 ||
				q.every((w) =>
					foldWords(`${r.key} ${r.title} ${nameOf(r.workflow)}`)
						.join(" ")
						.includes(w),
				)) &&
			(filter === "all" || (filter === "needs" ? r.lane === "needs_you" : keys.has(r.key)));
		const runs = all ?? [];
		return {
			board: latestPerTicket(runs).filter(fit),
			history: historyRuns(runs).filter(fit),
		};
	}, [all, text, filter, mine]);
	if (active === undefined) return <Loading title={f.runs} icon={<CpuChipIcon size={16} />} />;
	if (active === null) return <NoProject title={f.runs} icon={<CpuChipIcon size={16} />} />;
	const start = () =>
		void guard(async () => {
			await act.start(key.trim());
			setKey("");
		});
	// The refusal of a ticket that has a run links to that run.
	const taken =
		failure instanceof AppFailure && failure.code === "run_active"
			? running.get(key.trim())
			: undefined;
	// The one button of a card that waits for a person. It opens the run, where the action is on top.
	const actionOf = (r: RunItem) => {
		const to = (label: string, anchor?: string) => ({
			label,
			onClick: () => {
				open(r.id);
				showAnchor(anchor);
			},
		});
		if (r.state === "WaitingForAnswer") return to(f.answer);
		if (r.state === "PlanReview") return to(l.reviewPlan, "plan");
		if (r.state === "Blocked") return to(f.unblock);
		if (r.state === "Paused") return to(f.resume);
		// Start again lives on the run page: the card opens it.
		if (r.state === "Failed") return to(f.why.again);
		if (r.approvals > 0) return to(l.review);
		if (r.pr && (r.lane === "in_review" || r.lane === "ready_to_merge"))
			return {
				label: f.openPullRequest,
				onClick: () => {
					if (r.pr) rememberSelection("code:pull-requests", r.pr.reference);
					void navigate({ to: "/code/pull-requests" });
				},
			};
	};
	// Stop from a card: tell the person, with a way to History, and move the focus to the next card.
	const stop = (r: RunItem, rows: RunItem[]) =>
		void guard(async () => {
			const at = rows.indexOf(r);
			const near = rows[at + 1] ?? rows[at - 1];
			await act.cancel(r.id);
			void push({
				id: `run-stopped:${r.id}`,
				kind: "info",
				title: format(l.stopped, { key: r.key }),
				action: { label: l.history, run: () => go({ view: "history" }) },
			});
			const card = near
				? [...(board.current?.querySelectorAll<HTMLElement>('[role="group"]') ?? [])].find(
						(el) => el.getAttribute("aria-label") === `${near.key} ${near.title}`,
					)
				: undefined;
			(card?.querySelector<HTMLElement>("button") ?? field.current)?.focus();
		});
	return (
		<ListDetail
			title={f.runs}
			icon={<CpuChipIcon size={16} />}
			count={view === "board" ? shown.board.length : shown.history.length}
			chips={<AgentsToggle />}
			action={
				<span className="flex items-center gap-2">
					<TicketPicker
						ref={field}
						label={f.ticket}
						className="w-56"
						value={key}
						onChange={setKey}
						onSubmit={start}
						skip={skip}
					/>
					<RightButton right="runs.start" variant="primary" disabled={!key.trim()} onClick={start}>
						<PlayIcon size={14} />
						{f.start}
					</RightButton>
				</span>
			}
			toolbar={
				taken ? (
					<p role="alert" className="flex w-full items-center gap-2 text-ui text-danger-text">
						{format(f.runActive, { key: key.trim() })}
						<Button onClick={() => open(taken)}>{f.openRun}</Button>
					</p>
				) : failure ? (
					<ErrorNotice error={failure} className="w-full" />
				) : undefined
			}
		>
			{(all ?? []).length === 0 && !runs.isPending ? (
				<div className="p-4">
					{runners && !runners.some((r) => r.state === "detected") ? (
						<EmptyState
							title={<Terms>{t.glossary.noRunner}</Terms>}
							icon={<CpuChipIcon size={28} />}
							action={{
								label: t.glossary.setUpRunner,
								onClick: () => openSetting("/settings/connections#connections-runner"),
							}}
						/>
					) : (
						<EmptyState
							title={t.empty.runs}
							action={{ label: f.start, onClick: () => field.current?.focus() }}
						/>
					)}
				</div>
			) : (
				<>
					<div className="flex shrink-0 flex-wrap items-center gap-3 px-4 pb-3">
						<Input
							label={l.search}
							type="search"
							className="w-64"
							value={text}
							onChange={(e) => {
								setText(e.target.value);
								go({ q: e.target.value || undefined }, true);
							}}
						/>
						<div className="w-60">
							<Segmented
								label={l.filter}
								value={filter}
								onValueChange={(v) => go({ filter: v === "all" ? undefined : v })}
								items={[
									{ value: "all", label: l.all },
									{ value: "needs", label: l.needsYou },
									{ value: "mine", label: l.mine },
								]}
							/>
						</div>
						<div className="w-44">
							<Segmented
								label={l.view}
								value={view}
								onValueChange={(v) => go({ view: v === "board" ? undefined : v })}
								items={[
									{ value: "board", label: l.board },
									{ value: "history", label: l.history },
								]}
							/>
						</div>
					</div>
					{view === "history" ? (
						<RunHistory
							runs={shown.history}
							onOpen={open}
							onBoard={() => go({ view: undefined })}
						/>
					) : (
						// Five equal lanes that fit from 1100 px; under it each lane keeps 16 rem and the board scrolls sideways.
						<div ref={board} className="relative flex min-h-0 flex-1 px-4 pb-4">
							<div className="grid min-h-0 min-w-0 flex-1 grid-cols-5 grid-rows-[minmax(0,1fr)] gap-3 max-[1099px]:grid-cols-[repeat(5,16rem)] max-[1099px]:overflow-x-auto">
								{LANES.map(([lane, tone]) => {
									const rows = shown.board.filter((r) => r.lane === lane);
									return (
										<Panel
											key={lane}
											title={f.lane[lane]}
											count={rows.length}
											tone={tone}
											className="min-h-0 min-w-0"
											bodyClassName="min-h-0 flex-1 overflow-y-auto"
										>
											{rows.length === 0 ? (
												<span aria-hidden="true" className="flex justify-center py-6 text-n-9">
													<InboxIcon size={24} />
												</span>
											) : null}
											{rows.map((r) => {
												const p = progressOf(r);
												const step = stepperOf(r);
												return (
													<RunCard
														key={r.id}
														itemKey={r.key}
														title={r.title}
														state={r.state}
														live={p.live}
														step={step}
														costUsd={r.costUsd}
														budgetUsd={r.budgetUsd}
														workflow={nameOf(r.workflow)}
														questions={r.openQuestions}
														approvals={r.approvals}
														pr={lane === "in_review" || lane === "ready_to_merge" ? r.pr : null}
														onOpen={() => open(r.id)}
														action={actionOf(r)}
														onStop={ENDED.includes(r.state) ? undefined : () => stop(r, rows)}
														stopDisabled={gate("runs.start").disabled}
														menu={menu("run", {
															open: () => open(r.id),
															"copy-ref": () => copyText(`run:${r.id}`),
														})}
													/>
												);
											})}
										</Panel>
									);
								})}
							</div>
						</div>
					)}
				</>
			)}
		</ListDetail>
	);
}
