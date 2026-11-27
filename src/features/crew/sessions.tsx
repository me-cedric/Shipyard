import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useContext, useMemo, useRef, useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useRunActions, useRuns, useSessions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, type SessionView, type UnitView, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton, useRights } from "@/lib/rights";
import { runHref, useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { ATTENTION_ON_PANEL } from "@/ui/molecules/attention-card";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader, PageSwitchContext } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { usePlainDay } from "../plan/capacity";
import { type AgentRow, useAgentRows } from "./live";
import { EndedCard, MachineRows, modelName, OrcaCard, SIDE_HEAD } from "./sessions-side";
import { resumeLine, takeLine, useLiveOutput } from "./take-control";

// A session that has not started yet is not ended: it stays in the main list.
const over = (r: AgentRow) => r.session.state === "done" || r.session.state === "failed";
/** A button on the dark session panel: dark, like the design. */
const PANEL_BUTTON = "border-terminal-fg/20 bg-terminal-fg/15 hover:bg-terminal-fg/25";
const ON_PANEL = `${PANEL_BUTTON} text-terminal-fg`;
/** The Stop button on that panel: light orange, like the design (dark orange on the light panel of the dark theme). */
const STOP_ON_PANEL = `${PANEL_BUTTON} ${ATTENTION_ON_PANEL}`;
/** The rows of the list that show before "Show all", as in the design. */
const FIRST = 3;
const idOf = (s: SessionView) => `${s.run}/${s.step}`;

/** The live output of a session: what its tool wrote, or the words that say it writes none. */
function SessionOutput({ unit }: { unit?: UnitView }) {
	const { t } = useI18n();
	const lines = useLiveOutput(unit?.runner, unit?.session);
	if (lines.length === 0) return <p>{t.factory.sessionsPage.noOutput}</p>;
	return (
		<pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap leading-[1.8]">
			{lines.join("\n")}
		</pre>
	);
}

/**
 * Take control (`spec:shell-setup-rights#REQ-002`): it stops the run and opens the session of
 * Claude Code or Codex again in the Shipyard terminal. It shows only for a session with a folder
 * and an id that the tool can resume.
 */
function TakeControl({
	session,
	unit,
	name,
}: {
	session: SessionView;
	unit?: UnitView;
	name: string;
}) {
	const { t } = useI18n();
	const { runInTerminal } = useShell();
	const act = useRunActions();
	const { gate } = useRights();
	const { run } = useGuard();
	const command = unit ? resumeLine(unit.runner, unit.session) : null;
	if (!unit || !command || !unit.dir) return null;
	return (
		<ConfirmButton
			className={`min-h-control ${ON_PANEL}`}
			{...gate("runs.start")}
			confirm={format(t.shellFn.sessions.confirmTake, { name })}
			onConfirm={() =>
				void run(async () => {
					await act.cancel(session.run);
					runInTerminal(takeLine(unit.dir, command));
				})
			}
		>
			{t.shellFn.sessions.take}
		</ConfirmButton>
	);
}

/** Crew / Sessions (`spec:app-redesign#REQ-016`): the sessions of this machine, the one shown, and the ended ones on `page=ended`. */
export function CrewSessions() {
	const { t, lang } = useI18n();
	const f = t.factory;
	const s = f.sessionsPage;
	const navigate = useNavigate();
	const search = useSearch({ strict: false }) as { session?: string; page?: string };
	const active = useActiveProject().data;
	const sessions = useSessions();
	const { rows } = useAgentRows();
	const writes = useFactoryWrites();
	const { failure, run } = useGuard();
	const act = useRunActions();
	const runs = useRuns().data;
	const { gate } = useRights();
	const slot = useContext(PageSwitchContext);
	const [all, setAll] = useState(false);
	const panel = useRef<HTMLElement>(null);
	// The page of the ended sessions has no section switch: it claims the switch and draws none.
	const day = usePlainDay();
	const bare = useMemo(() => slot && { ...slot, node: null }, [slot]);
	if (active === undefined) return <Loading title={t.ui.place.crew} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={null} />;
	const name = (r: AgentRow) =>
		r.session.step === "estimate"
			? format(s.estimate, { name: r.session.key })
			: r.session.step === "tile"
				? format(s.tile, { name: r.session.key })
				: r.session.pull != null
					? format(s.review, { number: r.session.pull })
					: r.title;
	const detail = (r: AgentRow) =>
		[runnerName(r.session.runner), modelName(r.session.model)].filter(Boolean).join(", ");
	const open = (r: SessionView) => {
		if (r.step === "estimate")
			void navigate({ to: "/plan/estimates", search: { sheet: r.key } as never });
		else if (r.step === "tile") void navigate({ to: "/library/dashboards" });
		else if (r.pull == null) void navigate(runHref(r.run, r.step));
	};
	// A review session has no page of its own here: its pull request opens from Code.
	const opens = (r: SessionView) => r.step !== "review" || r.pull == null;
	const stop = (r: SessionView) =>
		void run(async () => {
			if (r.pull != null) return writes.reviewStop(r.pull);
			try {
				await unwrap(commands.estimateAgentStop(r.key));
			} finally {
				await sessions.refetch();
			}
		});

	if (search.page === "ended") {
		const ended = rows.filter(over);
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<PageSwitchContext.Provider value={bare}>
					<PageHeader
						title={s.endedAll}
						back={
							<BackLink
								label={t.crewPlace.views.sessions}
								render={(props) => <Link to="/crew/sessions" {...props} />}
							/>
						}
					/>
				</PageSwitchContext.Provider>
				<div className="px-4 pb-4">
					<Card className="py-2">
						{ended.length === 0 ? <Row className="text-n-11">{s.none}</Row> : null}
						{ended.map((r) => (
							<Row
								key={r.id}
								className="min-h-18 w-full py-2"
								render={(props) => (
									<button type="button" {...props} onClick={() => open(r.session)} />
								)}
							>
								<Avatar agent name={nameOf(r.session.step, t.factory.agentNames)} />
								<span className="flex min-w-0 flex-1 flex-col text-left">
									<span className="truncate font-semibold">{name(r)}</span>
									<span className="truncate text-n-11">
										{[
											detail(r),
											r.session.started
												? day(new Date(r.session.started * 1000).toISOString().slice(0, 10))
												: "",
										]
											.filter(Boolean)
											.join(", ")}
									</span>
								</span>
								<Badge variant={r.session.state === "failed" ? "danger" : "neutral"}>
									{f.step[r.session.state]}
								</Badge>
							</Row>
						))}
					</Card>
				</div>
			</div>
		);
	}

	const here = rows.filter((r) => !over(r)).toSorted((a, b) => a.id.localeCompare(b.id, lang));
	const shown = here.find((r) => idOf(r.session) === search.session) ?? here[0];
	const none = here.length === 0 && !sessions.isPending;
	// The unit of the session shown: it knows the tool, the folder and the session id.
	const unit = shown
		? runs
				?.find((r) => r.id === shown.session.run)
				?.steps.flatMap((s) => s.units)
				.find((u) => u.id === shown.session.step)
		: undefined;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.ui.place.crew} />
			<ErrorNotice error={failure} className="px-4 pb-2" />
			<div className="flex flex-wrap items-stretch gap-6 px-4 pb-4">
				<div className="flex min-w-0 flex-[2_1_21rem] flex-col gap-4 self-start">
					{none ? (
						<EmptyState
							title={t.empty.sessions}
							action={{ label: f.runs, onClick: () => void navigate({ to: "/flow/flow" }) }}
						/>
					) : null}
					<Card className="overflow-hidden py-2">
						<section aria-label={s.here}>
							<h2 className={SIDE_HEAD}>{s.here}</h2>
							{here.map((r, i) =>
								all || i < FIRST || r === shown ? (
									<Row
										key={r.id}
										className={cn("min-h-18 w-full py-2", r === shown && "bg-accent-subtle/40")}
										render={(props) => (
											<button
												type="button"
												aria-pressed={r === shown}
												{...props}
												onClick={() => {
													void navigate({
														to: "/crew/sessions",
														search: { session: idOf(r.session) } as never,
														replace: true,
													});
													// In a small window the output wraps under the list: bring it into view.
													panel.current?.scrollIntoView?.({ block: "nearest" });
												}}
											/>
										)}
									>
										<Avatar agent name={nameOf(r.session.step, t.factory.agentNames)} />
										<span className="flex min-w-0 flex-1 flex-col text-left">
											<span className="truncate font-semibold">{name(r)}</span>
											<span className="truncate text-n-11">{detail(r)}</span>
										</span>
										{r === shown ? (
											<Badge variant="accent">{s.shown}</Badge>
										) : r.session.state === "gate" ? (
											<Badge variant="you">{s.waits}</Badge>
										) : null}
									</Row>
								) : null,
							)}
							<MachineRows />
							{!all && here.length > FIRST ? (
								<Row
									className="min-h-12 w-full py-2 font-semibold"
									render={(props) => (
										<button type="button" {...props} onClick={() => setAll(true)} />
									)}
								>
									{format(s.showAll, { n: here.length })}
								</Row>
							) : null}
						</section>
					</Card>
					<OrcaCard />
					<EndedCard />
				</div>
				{shown ? (
					<section
						ref={panel}
						aria-label={format(s.output, { name: name(shown) })}
						className="flex min-h-140 min-w-0 flex-[3_1_28rem] flex-col overflow-hidden rounded-xl border border-terminal-fg/15 bg-terminal text-terminal-fg"
					>
						<div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
							<Avatar
								agent
								name={nameOf(shown.session.step, t.factory.agentNames)}
								className="bg-terminal-fg text-terminal"
							/>
							<h2 className="font-semibold">{name(shown)}</h2>
							<span className="flex-1" />
							<Badge className="bg-terminal-fg/15 text-terminal-fg">{s.readOnly}</Badge>
							{/* Open shows the page of the work. Taking over the terminal of an agent has no command. */}
							{opens(shown.session) ? (
								<Button className={`min-h-control ${ON_PANEL}`} onClick={() => open(shown.session)}>
									{t.inspector.open}
								</Button>
							) : null}
							{shown.session.state === "running" ? (
								<TakeControl session={shown.session} unit={unit} name={name(shown)} />
							) : null}
							{(shown.session.pull != null || shown.session.step === "estimate") &&
							shown.session.state === "running" ? (
								<RightButton
									right="runs.start"
									aria-label={format(f.machine.stop, { name: name(shown) })}
									className={`min-h-control ${STOP_ON_PANEL}`}
									onClick={() => stop(shown.session)}
								>
									{s.stop}
								</RightButton>
							) : null}
							{shown.session.pull == null &&
							shown.session.step !== "estimate" &&
							shown.session.step !== "tile" &&
							shown.session.state === "running" ? (
								<ConfirmButton
									className={`min-h-control ${STOP_ON_PANEL}`}
									{...gate("runs.start")}
									confirm={format(f.machine.confirmStop, { name: name(shown) })}
									onConfirm={() => void run(() => act.cancel(shown.session.run))}
								>
									{s.stop}
								</ConfirmButton>
							) : null}
						</div>
						<div className="flex flex-col gap-1 border-t border-terminal-fg/20 px-4 py-4.5 font-mono text-terminal-fg/80">
							<p>{format(s.tokens, { count: shown.session.tokens.toLocaleString(lang) })}</p>
							{shown.session.costUsd === null ? null : (
								<p>{`$${shown.session.costUsd.toFixed(2)}`}</p>
							)}
							<SessionOutput unit={unit} />
						</div>
					</section>
				) : null}
			</div>
		</div>
	);
}
