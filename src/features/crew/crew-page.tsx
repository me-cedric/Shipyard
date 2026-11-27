import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { nameOf } from "@/features/factory/runs/run-live";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { SealBar } from "@/features/work/seal";
import { parseMemberWeek } from "@/features/work/week-focus";
import { ENDED, useRoles, useRuns, useUsage, useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { useFormIntent, useFormIntentFor } from "@/lib/shell";
import { useViewState } from "@/lib/shell/view-state";
import { useWorkItems } from "@/lib/sync";
import { usePlan, useSealState, useSheets, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { buttonVariants } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader, PageSwitchContext } from "@/ui/molecules/page-header";
import { atWork, byRun, LiveRows, useAgentRows } from "./live";
import { MemberForm } from "./member";

const CARD =
	"flex h-full w-full flex-col items-start gap-3 rounded-lg bg-surface-2 p-5 text-left shadow-2";
const HOVER =
	"hover:shadow-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3.5";
const H2 = "text-17 font-semibold text-n-12";
const NAME = "text-17 font-semibold text-n-12";

/** The week of a capacity warning, for the member that it names. */
type Week = { handle: string; from: string; slug: string };

/**
 * Crew (`spec:app-redesign#REQ-016`, `spec:app-redesign#REQ-017`): the people and the agent roles
 * with their current work, the spend and the recipes. `view=live` shows one row for each agent.
 * A person opens on the member page, the one place that edits the members of the team file.
 */
export function CrewPage() {
	const { t } = useI18n();
	const c = t.crewPlace;
	// The open member lives in the address (`member`, a handle, or empty for a new member): Back
	// closes the member page and a link opens one person.
	const search = useSearch({ strict: false }) as { view?: string; member?: unknown };
	const navigate = useNavigate();
	const slot = useContext(PageSwitchContext);
	const { can } = useRights();
	const live = search.view === "live";
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
	const [week, setWeek] = useState<Week>();
	// The switch of Spend: a shared screen keeps the amounts private here too.
	const [prices] = useViewState("usage-prices", true);
	const price = (text: string) =>
		prices ? (
			text
		) : (
			<span>
				<span aria-hidden="true">•••</span>
				<span className="sr-only">{t.extras.usage.hidden}</span>
			</span>
		);
	const members = team.data?.team.members ?? [];
	const show = (handle?: string | null, replace = false) =>
		void navigate({
			to: "/crew/crew",
			search: (handle === undefined ? {} : { member: handle ?? "" }) as never,
			replace,
		});
	// A handle that is not in the team opens no page.
	const open =
		search.member === ""
			? { handle: null }
			: members.some((x) => x.handle === search.member)
				? { handle: search.member as string }
				: undefined;
	useFormIntent("member", () => show(null));
	// A capacity warning of the plan opens the member that it names, on the week of the warning.
	useFormIntentFor(
		"member:",
		(rest) => {
			const { handle, week, slug } = parseMemberWeek(rest);
			if (!members.some((o) => o.handle === handle)) return;
			setWeek(week && slug ? { handle, from: week, slug } : undefined);
			show(handle);
		},
		!!team.data,
	);

	const Icon = tabIcon("crew", "crew");
	const icon = Icon && <Icon size={16} />;
	// One row for each run: the title counts what the rows show.
	const working = byRun(agents.rows.filter(atWork));
	const title = !live
		? t.ui.place.crew
		: working.length === 1
			? c.atWorkOne
			: format(c.atWorkCount, { count: working.length });
	if (active === undefined || team.isLoading) return <Loading title={title} icon={icon} />;
	if (active === null) return <NoProject title={title} icon={icon} />;

	if (open) {
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<MemberForm
					key={open.handle}
					handle={open.handle}
					week={week?.handle === open.handle ? week : undefined}
					seal={team.data?.locked && seal ? <SealBar state={seal} /> : null}
					// A saved or removed member replaces the entry of the form: Back does not show it again.
					onOpen={(handle) => show(handle ?? undefined, true)}
				/>
			</div>
		);
	}

	const setView = (view: string) =>
		void navigate({ to: "/crew/crew", search: (view === "live" ? { view } : {}) as never });
	const openRuns = new Set(runs.filter((r) => !ENDED.includes(r.state)).map((r) => r.id));
	const spent = (usage?.runs ?? []).filter((r) => openRuns.has(r.run));
	const spend = spent.reduce((a, r) => a + (r.usd ?? 0), 0);
	// The limit of a feature is the budget of its run. When the open runs differ, the lowest shows.
	const limits = spent.flatMap((r) => (r.budget == null ? [] : [r.budget]));
	// The way back to the cards, left of the section switch. It is a choice of two views, not a second section switch.
	const viewSwitch = (
		<div className="shrink-0">
			<Segmented
				label={t.factory.runsList.view}
				value="live"
				onValueChange={setView}
				items={[
					{ value: "cards", label: c.cards },
					{ value: "live", label: c.live },
				]}
			/>
		</div>
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageSwitchContext.Provider
				value={
					slot && live
						? {
								...slot,
								node: (
									<>
										{viewSwitch}
										{slot.node}
									</>
								),
							}
						: slot
				}
			>
				<PageHeader
					icon={icon}
					title={title}
					action={live ? undefined : <AgentsToggle />}
					menu={
						live
							? undefined
							: [
									{ label: c.live, onClick: () => setView("live") },
									{
										label: c.addPerson,
										icon: <PlusIcon size={14} />,
										disabled: !can("project.settings"),
										onClick: () => show(null),
									},
								]
					}
				/>
			</PageSwitchContext.Provider>
			<div className="flex flex-col gap-6 px-4 pb-4">
				{live ? (
					<LiveRows {...agents} />
				) : (
					<>
						<h2 className={H2}>{c.people}</h2>
						<ErrorNotice error={team.data?.error} />
						{members.length === 0 ? (
							<EmptyState
								title={t.empty.team}
								action={{
									id: "add-member",
									label: c.addPerson,
									icon: <PlusIcon size={14} />,
									onClick: () => show(null),
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
												onClick={() => show(m.handle)}
												className={`${CARD} ${HOVER}`}
											>
												<span aria-hidden="true" className="flex">
													<Avatar name={m.name} className="size-14 text-17" />
												</span>
												<span className={NAME}>{m.name}</span>
												<span className="min-h-[1.45em] text-n-11">
													{items
														.filter((i) => i.member === m.handle && i.category === "in-progress")
														.map((i) => i.title)
														.join(", ")}
												</span>
												{days ? (
													<Badge variant={over > 0 ? "you" : "success"}>
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
							{/* Only a role with work has a card. Each card opens the live rows. */}
							{roles.map((role) => {
								const mine = working.filter((r) => r.role === role.id);
								if (mine.length === 0) return null;
								const titles = [...new Set(mine.map((r) => r.title))];
								return (
									<li key={role.id}>
										<Link
											to="/crew/crew"
											search={{ view: "live" } as never}
											className={`${CARD} ${HOVER}`}
										>
											<span aria-hidden="true" className="flex">
												<Avatar
													agent
													name={nameOf(role.id)}
													className="size-14 rounded-field text-17"
												/>
											</span>
											<span className={NAME}>{nameOf(role.id)}</span>
											<span className="text-n-11">
												{titles.length > 1
													? format(c.more, { title: titles[0] ?? "", count: titles.length - 1 })
													: titles[0]}
											</span>
											{mine.some((r) => r.session.state === "gate") ? (
												<Badge variant="you">{c.waitsForYou}</Badge>
											) : (
												<Badge variant="accent">
													{format(c.countAtWork, { count: mine.length })}
												</Badge>
											)}
										</Link>
									</li>
								);
							})}
							<li className={`${CARD} justify-between`}>
								<span className="text-13 font-semibold text-n-11">{c.spendOpen}</span>
								<span className="text-44 leading-tight font-semibold text-n-12">
									{price(`$${spend.toFixed(2)}`)}
								</span>
								{limits.length ? (
									<span className="text-n-11">
										{price(format(c.limit, { usd: `$${Math.min(...limits).toFixed(2)}` }))}
									</span>
								) : null}
								<Link to="/crew/spend" className={`${buttonVariants()} self-stretch`}>
									{t.factory.budgets}
								</Link>
							</li>
						</ul>
						<h2 className={H2}>{c.views.recipes}</h2>
						<ul aria-label={c.views.recipes} className="rounded-lg bg-surface-2 px-5 shadow-2">
							{recipes.map((w) => (
								<li
									key={w.id}
									className="flex flex-wrap items-center gap-4 border-n-6 py-4 [&+&]:border-t"
								>
									<span className="w-20 font-semibold text-n-12">{nameOf(w.id)}</span>
									<span className="flex flex-1 basis-96 flex-wrap gap-2">
										{w.steps.map((s) => (
											<span
												key={s}
												className="inline-flex min-h-9 items-center rounded-sm bg-n-3 px-3.5 font-medium text-n-12"
											>
												{c.stepNames[s] ?? nameOf(s)}
											</span>
										))}
									</span>
									<Link
										to="/crew/recipes"
										search={{ recipe: w.id } as never}
										aria-label={`${t.factory.edit} ${nameOf(w.id)}`}
										className={buttonVariants()}
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
