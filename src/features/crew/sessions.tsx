import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useContext, useMemo } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useSessions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, type SessionView, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { runHref } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader, PageSwitchContext } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { usePlainDay } from "../plan/capacity";
import { type AgentRow, useAgentRows } from "./live";
import { EndedCard, MachineRows, OrcaCard, SIDE_HEAD } from "./sessions-side";

const live = (r: AgentRow) => r.session.state === "running" || r.session.state === "gate";
const idOf = (s: SessionView) => `${s.run}/${s.step}`;

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
	const { error, run } = useGuard();
	const slot = useContext(PageSwitchContext);
	// The page of the ended sessions has no section switch: it claims the switch and draws none.
	const day = usePlainDay();
	const bare = useMemo(() => slot && { ...slot, node: null }, [slot]);
	if (active === undefined) return <Loading title={t.ui.place.crew} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={null} />;
	const name = (r: AgentRow) =>
		r.session.step === "estimate"
			? format(s.estimate, { name: r.session.key })
			: r.session.pull != null
				? format(s.review, { number: r.session.pull })
				: r.title;
	const detail = (r: AgentRow) =>
		[runnerName(r.session.runner), r.session.model].filter(Boolean).join(", ");
	const open = (r: SessionView) => {
		if (r.step === "estimate")
			void navigate({ to: "/plan/estimates", search: { sheet: r.key } as never });
		else if (r.pull == null) void navigate(runHref(r.run, r.step));
	};
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
		const ended = rows.filter((r) => !live(r));
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
								className="min-h-18 py-2"
								render={(props) => (
									<button type="button" {...props} onClick={() => open(r.session)} />
								)}
							>
								<Avatar agent name={nameOf(r.session.step)} />
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

	const here = rows.filter(live).toSorted((a, b) => a.id.localeCompare(b.id, lang));
	const shown = here.find((r) => idOf(r.session) === search.session) ?? here[0];
	const none = here.length === 0 && !sessions.isPending;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.ui.place.crew} />
			{error ? (
				<p role="alert" className="px-4 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex flex-wrap items-stretch gap-4 px-4 pb-4">
				<div className="flex min-w-0 flex-[2_1_21rem] flex-col gap-4">
					{none ? (
						<EmptyState
							title={t.empty.sessions}
							action={{ label: f.runs, onClick: () => void navigate({ to: "/flow/flow" }) }}
						/>
					) : null}
					<Card className="py-2">
						<section aria-label={s.here}>
							<h2 className={SIDE_HEAD}>{s.here}</h2>
							{here.map((r) => (
								<Row
									key={r.id}
									className={cn("min-h-18 w-full py-2", r === shown && "bg-accent-subtle")}
									render={(props) => (
										<button
											type="button"
											aria-pressed={r === shown}
											{...props}
											onClick={() =>
												void navigate({
													to: "/crew/sessions",
													search: { session: idOf(r.session) } as never,
													replace: true,
												})
											}
										/>
									)}
								>
									<Avatar agent name={nameOf(r.session.step)} />
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
							))}
							<MachineRows />
						</section>
					</Card>
					<OrcaCard />
					<EndedCard />
				</div>
				{shown ? (
					<section
						aria-label={format(s.output, { name: name(shown) })}
						className="flex min-h-80 min-w-0 flex-[3_1_28rem] flex-col overflow-hidden rounded-xl bg-primary text-primary-fg"
					>
						<div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
							<Avatar
								agent
								name={nameOf(shown.session.step)}
								className="bg-primary-fg text-primary"
							/>
							<h2 className="font-semibold">{name(shown)}</h2>
							<span className="flex-1" />
							<Button className="min-h-control" onClick={() => open(shown.session)}>
								{t.common.open}
							</Button>
							{(shown.session.pull != null || shown.session.step === "estimate") &&
							shown.session.state === "running" ? (
								<RightButton
									right="runs.start"
									aria-label={format(f.machine.stop, { name: shown.session.key })}
									className="min-h-control"
									onClick={() => stop(shown.session)}
								>
									{s.stop}
								</RightButton>
							) : null}
						</div>
						<div className="flex flex-col gap-1 border-t border-primary-fg/20 px-4 py-4.5 text-primary-fg/80">
							<p>{format(s.tokens, { count: shown.session.tokens.toLocaleString(lang) })}</p>
							{shown.session.costUsd === null ? null : (
								<p>{`$${shown.session.costUsd.toFixed(2)}`}</p>
							)}
							<p>{s.noOutput}</p>
						</div>
					</section>
				) : null}
			</div>
		</div>
	);
}
