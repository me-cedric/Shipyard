import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { nameOf } from "@/features/factory/runs/run-live";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { SealBar } from "@/features/work/seal";
import { parseMemberWeek } from "@/features/work/week-focus";
import { ENDED, useRoles, useRuns, useUsage, useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useFormIntent, useFormIntentFor } from "@/lib/shell";
import { useWorkItems } from "@/lib/sync";
import { usePlan, useSealState, useSheets, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ChevronLeftIcon, LockClosedIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { atWork, LiveRows, useAgentRows } from "./live";
import { MemberForm } from "./member";

const CARD = "flex min-h-control flex-col gap-2 rounded-xl bg-surface-2 p-4 text-left shadow-1";
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3";
const H2 = "text-16 font-semibold text-n-12";
const LINK =
	"inline-flex min-h-control items-center justify-center rounded-md border px-3 text-ui font-medium text-n-12 hover:bg-n-3";

/** The member that is open, or the form of a new one (`handle` null). */
type Open = { handle: string | null; week?: { from: string; slug: string } };

/**
 * Crew (`spec:app-redesign#REQ-016`, `spec:app-redesign#REQ-017`): the people and the agent roles
 * with their current work, the spend and the recipes. `view=live` shows one row for each agent.
 * A person opens on the member page, the one place that edits the members of the team file.
 */
export function CrewPage() {
	const { t } = useI18n();
	const c = t.crewPlace;
	const live = (useSearch({ strict: false }) as { view?: string }).view === "live";
	const active = useActiveProject().data;
	const team = useTeam();
	const seal = useSealState().data;
	const agents = useAgentRows();
	const roles = useRoles().data ?? [];
	const runs = useRuns().data ?? [];
	const usage = useUsage().data;
	const recipes = useWorkflows().data ?? [];
	const items = useWorkItems({}).data ?? [];
	// The load of each person comes from the plan of the first sheet that is ready, as on Plan.
	const slug = useSheets().data?.find((s) => s.state === "ready")?.slug ?? null;
	const load = usePlan(slug).data?.load.members;
	const [open, setOpen] = useState<Open>();
	const members = team.data?.team.members ?? [];
	useFormIntent("member", () => setOpen({ handle: null }));
	// A capacity warning of the plan opens the member that it names, on the week of the warning.
	useFormIntentFor(
		"member:",
		(rest) => {
			const { handle, week, slug } = parseMemberWeek(rest);
			if (!members.some((o) => o.handle === handle)) return;
			setOpen({ handle, week: week && slug ? { from: week, slug } : undefined });
		},
		!!team.data,
	);

	const Icon = tabIcon("crew", "crew");
	const icon = Icon && <Icon size={16} />;
	const title = live ? c.atWork : t.ui.place.crew;
	if (active === undefined || team.isLoading) return <Loading title={title} icon={icon} />;
	if (active === null) return <NoProject title={title} icon={icon} />;

	const sealed =
		team.data?.locked && seal ? (
			<div className="flex flex-wrap items-center gap-2">
				<LockClosedIcon size={14} />
				<span className="text-ui text-n-11">{t.work.team.lockedRate}</span>
				<SealBar state={seal} />
			</div>
		) : null;

	if (open) {
		const member = members.find((x) => x.handle === open.handle);
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className="px-4 pt-3">
					<Button className="min-h-control" onClick={() => setOpen(undefined)}>
						<ChevronLeftIcon size={14} />
						{t.ui.place.crew}
					</Button>
				</div>
				<PageHeader icon={icon} title={member?.name ?? t.work.team.add} />
				<div className="flex flex-col gap-3 px-4 pb-4">
					{sealed}
					<MemberForm
						// The form starts again when the seal opens: the day rate is in the team only then.
						key={`${open.handle}:${team.data?.locked}`}
						handle={open.handle}
						week={open.week}
						onOpen={(handle) => setOpen(handle === null ? undefined : { handle })}
					/>
				</div>
			</div>
		);
	}

	const working = agents.rows.filter(atWork);
	const openRuns = new Set(runs.filter((r) => !ENDED.includes(r.state)).map((r) => r.id));
	const spend = (usage?.runs ?? [])
		.filter((r) => openRuns.has(r.run))
		.reduce((a, r) => a + (r.usd ?? 0), 0);
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				icon={icon}
				title={title}
				count={live ? working.length : undefined}
				action={
					<>
						<SectionSwitch
							label={t.factory.runsList.view}
							items={[
								{ id: "cards", label: c.cards, current: !live },
								{ id: "live", label: c.live, current: live },
							]}
							renderItem={(i, props) => (
								<Link
									to="/crew/crew"
									search={(i.id === "live" ? { view: "live" } : {}) as never}
									{...props}
								>
									{i.label}
								</Link>
							)}
						/>
						<AgentsToggle />
					</>
				}
			/>
			<div className="flex flex-col gap-3 px-4 pt-2 pb-4">
				{live ? (
					<LiveRows {...agents} />
				) : (
					<>
						<div className="flex items-center justify-between gap-3">
							<h2 className={H2}>{c.people}</h2>
							{members.length ? (
								<RightButton
									id="add-member"
									right="project.settings"
									className="min-h-control"
									onClick={() => setOpen({ handle: null })}
								>
									<PlusIcon size={14} />
									{t.work.team.add}
								</RightButton>
							) : null}
						</div>
						{sealed}
						{team.data?.error ? (
							<p role="alert" className="text-ui text-danger-text">
								{team.data.error}
							</p>
						) : null}
						{members.length === 0 ? (
							<EmptyState
								title={t.empty.team}
								action={{
									id: "add-member",
									label: t.work.team.add,
									icon: <PlusIcon size={14} />,
									onClick: () => setOpen({ handle: null }),
								}}
							/>
						) : (
							<ul aria-label={c.people} className={GRID}>
								{members.map((m) => {
									const days = load?.find((x) => x.handle === m.handle)?.days;
									const over = Math.round(
										(days ?? []).reduce(
											(a, d) => a + Math.max(0, (d.used ?? 0) - (d.capacity ?? 0)),
											0,
										),
									);
									return (
										<li key={m.handle}>
											<button
												type="button"
												aria-label={m.handle}
												onClick={() => setOpen({ handle: m.handle })}
												className={`${CARD} w-full hover:shadow-2 focus-visible:shadow-glow`}
											>
												<Avatar name={m.name} className="size-10 text-13" />
												<span className="font-medium text-n-12">{m.name}</span>
												<span className="text-ui text-n-11">
													{items
														.filter((i) => i.member === m.handle && i.category === "in-progress")
														.map((i) => i.title)
														.join(", ")}
												</span>
												{days ? (
													<Badge variant={over > 0 ? "warning" : "success"}>
														{over > 0 ? format(c.overBy, { days: over }) : c.hasRoom}
													</Badge>
												) : null}
											</button>
										</li>
									);
								})}
							</ul>
						)}
						<h2 className={H2}>{c.agents}</h2>
						<ul aria-label={c.agents} className={GRID}>
							{roles.map((role) => {
								const mine = working.filter((r) => r.role === role.id);
								const titles = [...new Set(mine.map((r) => r.title))];
								return (
									<li key={role.id}>
										<Link
											to="/crew/crew"
											search={{ view: "live" } as never}
											aria-label={role.id}
											className={`${CARD} hover:shadow-2 focus-visible:shadow-glow`}
										>
											<span className="font-medium text-n-12">{nameOf(role.id)}</span>
											<span className="text-ui text-n-11">
												{titles.length > 1
													? format(c.more, { title: titles[0] ?? "", count: titles.length - 1 })
													: titles[0]}
											</span>
											{mine.some((r) => r.session.state === "gate") ? (
												<Badge variant="warning">{t.factory.runsList.needsYou}</Badge>
											) : mine.length ? (
												<Badge variant="info">
													{format(c.countAtWork, { count: mine.length })}
												</Badge>
											) : (
												<Badge>{t.status.idle}</Badge>
											)}
										</Link>
									</li>
								);
							})}
							<li className={CARD}>
								<span className="text-12 font-medium text-n-11">{c.spendOpen}</span>
								<span className="text-20 font-semibold text-n-12">${spend.toFixed(2)}</span>
								<Link to="/crew/spend" className={LINK}>
									{t.factory.budgets}
								</Link>
							</li>
						</ul>
						<h2 className={H2}>{c.views.recipes}</h2>
						<ul aria-label={c.views.recipes} className="rounded-xl bg-surface-2 px-4 shadow-1">
							{recipes.map((w) => (
								<li
									key={w.id}
									className="flex flex-wrap items-center gap-3 border-b py-2 last:border-b-0"
								>
									<span className="w-28 font-medium text-n-12">{nameOf(w.id)}</span>
									<span className="flex flex-1 flex-wrap gap-1.5">
										{w.steps.map((s) => (
											<Badge key={s}>{nameOf(s)}</Badge>
										))}
									</span>
									<Link
										to="/crew/recipes"
										aria-label={`${t.factory.edit} ${nameOf(w.id)}`}
										className={LINK}
									>
										{t.factory.edit}
									</Link>
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</div>
	);
}
