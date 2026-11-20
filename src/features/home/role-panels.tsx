import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useFeatures } from "@/features/flow/feature";
import { overloaded } from "@/features/plan/proposals";
import {
	type PlaceId,
	type PlacePath,
	sectionView,
	visibleSections,
} from "@/features/shell/places";
import { tabLabel } from "@/features/shell/spaces";
import { usePulls, useQuality } from "@/lib/code/forge";
import { useDesignList } from "@/lib/design";
import { useDailySpend, useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { TeamRole } from "@/lib/ipc";
import { useDay, usePrefs } from "@/lib/prefs";
import { useHealth } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { useChanges, useQuestions, useTestPlans } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { memberName, usePlan, useSheets, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { buttonVariants } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { linkClass } from "@/ui/atoms/link-button";
import { Progress } from "@/ui/atoms/progress";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { SinceAway } from "./away";
import { MyWork } from "./my-work";
import { NoSwitch } from "./no-switch";
import { useMyItems } from "./stats";
import { TimeReminder } from "./time-reminder";

const SURFACE = "rounded-lg bg-surface-2 shadow-2";
const CARD_TITLE = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";

/** One small card (picture 092): the title, its state (the count, or `children`) and one Open control to its page. */
function Card({
	title,
	to,
	page,
	items,
	count = items.length,
	children,
}: {
	title: string;
	to: PlacePath;
	/** The sub-page of a scope of Setup that holds the items. */
	page?: string;
	items: string[];
	count?: number;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	const { level } = useRights();
	const [, place, slug] = to.split("/") as [string, PlaceId, string];
	// A panel of an area that the person cannot see stays hidden, whatever role the picker shows (spec:app-redesign#REQ-006).
	if (!visibleSections(place, level).some(([, tab]) => tab === slug)) return null;
	const view = sectionView(place, slug);
	return (
		<section aria-label={title} className={cn(SURFACE, "flex flex-col gap-2.5 px-6 py-5.5")}>
			<h2 className="text-13 font-semibold text-n-11">{title}</h2>
			<span className="text-30 font-semibold text-n-12">{children ?? count}</span>
			<Link
				to={to}
				// shortcut: one cast. The section routes are built in a loop, so the link type does not know `page`.
				search={(page ? { page } : undefined) as never}
				aria-label={`${t.rights.today.open} ${t.ui.place[place]} / ${view ? tabLabel(t, view[0], view[1]) : ""}`}
				className={cn(buttonVariants(), "min-h-control self-start")}
			>
				{t.rights.today.open}
			</Link>
		</section>
	);
}

const line = (key: string, title: string) => `${key} ${title}`;

function useTodo() {
	return (useWorkItems({}).data ?? []).filter((i) => i.category === "todo");
}

const PANELS: Record<string, () => ReactNode> = {
	backlogHealth: function BacklogHealthPanel() {
		const { t } = useI18n();
		const x = useTodo().filter((i) => !i.member);
		return (
			<Card
				title={t.rights.panel.backlogHealth}
				to="/flow/list"
				items={x.map((i) => line(i.key, i.title))}
			/>
		);
	},
	ready: function ReadyPanel() {
		const { t } = useI18n();
		return (
			<Card
				title={t.rights.panel.ready}
				to="/flow/list"
				items={useTodo().map((i) => line(i.key, i.title))}
			/>
		);
	},
	roadmap: function RoadmapPanel() {
		const { t } = useI18n();
		const x = (useWorkItems({}).data ?? []).filter((i) => i.category === "in-progress");
		return (
			<Card
				title={t.rights.panel.roadmap}
				to="/plan/timeline"
				items={x.map((i) => line(i.key, i.title))}
			/>
		);
	},
	plan: function PlanPanel() {
		const { t } = useI18n();
		const x = (useWorkItems({}).data ?? []).filter((i) => i.category === "in-progress");
		return (
			<Card
				title={t.rights.panel.plan}
				to="/plan/timeline"
				items={x.map((i) => line(i.key, i.title))}
			/>
		);
	},
	capacity: function CapacityPanel() {
		const { t } = useI18n();
		const x = useTeam().data?.team.members ?? [];
		return (
			<Card
				title={t.rights.panel.capacity}
				to="/plan/timeline"
				items={x.map((m) => `${m.name} ${m.capacity ?? 0}`)}
			/>
		);
	},
	risks: function RisksPanel() {
		const { t } = useI18n();
		const x = (useHealth().data ?? []).filter((f) => f.severity !== "info");
		return (
			<Card
				title={t.rights.panel.risks}
				to="/setup/project"
				page="health"
				items={x.map((f) => f.id)}
			/>
		);
	},
	spend: function SpendPanel() {
		const { t, lang } = useI18n();
		const { can } = useRights();
		const month = useDailySpend(31).month;
		if (!can("costs.view") || month === 0) return null;
		const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(month);
		return (
			<Card title={t.rights.panel.spend} to="/crew/spend" items={[]}>
				{money}
			</Card>
		);
	},
	adrs: function AdrsPanel() {
		const { t } = useI18n();
		const x = useDesignList().data?.adrs ?? [];
		return (
			<Card
				title={t.rights.panel.adrs}
				to="/library/decisions"
				items={x.map((a) => `${a.number} ${a.title}`)}
			/>
		);
	},
	drift: function DriftPanel() {
		const { t } = useI18n();
		const x = (useDesignList().data?.artifacts ?? []).filter((a) => a.issue);
		return (
			<Card title={t.rights.panel.drift} to="/library/diagrams" items={x.map((a) => a.title)} />
		);
	},
	designQuestions: function DesignQuestionsPanel() {
		const { t } = useI18n();
		const x = (useQuestions().data ?? []).filter(
			(e) => e.question.status === "open" && /architect|designer/i.test(e.question.owner),
		);
		return (
			<Card
				title={t.rights.panel.designQuestions}
				to="/library/questions"
				items={x.map((e) => `${e.question.id} ${e.question.title}`)}
			/>
		);
	},
	runs: function RunsPanel() {
		const { t } = useI18n();
		const x = (useRuns().data ?? []).filter((r) => r.lane === "working" || r.lane === "needs_you");
		return (
			<Card
				title={t.rights.panel.runs}
				to="/flow/flow"
				items={x.map((r) => line(r.key, r.title))}
			/>
		);
	},
	quality: function QualityPanel() {
		const { t } = useI18n();
		const q = useQuality().data;
		const x = [...(q?.checks ?? []), ...(q?.scanners ?? [])].filter(
			(r) => r.last?.passed === false,
		);
		return (
			<Card
				title={t.rights.panel.quality}
				to="/flow/health"
				items={x.map((r) => r.label ?? r.name)}
			/>
		);
	},
	reviewLoad: function ReviewLoadPanel() {
		const { t } = useI18n();
		const x = (usePulls().data ?? []).filter((p) => p.state === "open" && !p.draft);
		return (
			<Card
				title={t.rights.panel.reviewLoad}
				to="/code/now"
				items={x.map((p) => `#${p.number} ${p.title}`)}
			/>
		);
	},
	specChanges: function SpecChangesPanel() {
		const { t } = useI18n();
		const x = (useChanges().data ?? []).filter((c) => !c.validated);
		return (
			<Card title={t.rights.panel.specChanges} to="/flow/list" items={x.map((c) => c.title)} />
		);
	},
	openQuestions: function OpenQuestionsPanel() {
		const { t } = useI18n();
		const x = (useQuestions().data ?? []).filter((e) => e.question.status === "open");
		return (
			<Card
				title={t.rights.panel.openQuestions}
				to="/library/questions"
				items={x.map((e) => `${e.question.id} ${e.question.title}`)}
			/>
		);
	},
	myTickets: function MyTicketsPanel() {
		const { t } = useI18n();
		const x = useMyItems().filter((i) => i.category !== "done");
		return (
			<Card
				title={t.rights.panel.myTickets}
				to="/flow/list"
				items={x.map((i) => line(i.key, i.title))}
			/>
		);
	},
	myPulls: function MyPullsPanel() {
		const { t } = useI18n();
		const keys = useMyItems().map((i) => i.key);
		const x = (usePulls().data ?? []).filter(
			(p) => p.state === "open" && keys.some((k) => p.title.includes(k)),
		);
		return (
			<Card
				title={t.rights.panel.myPulls}
				to="/code/now"
				items={x.map((p) => `#${p.number} ${p.title}`)}
			/>
		);
	},
	reviewRequests: function ReviewRequestsPanel() {
		const { t } = useI18n();
		const keys = useMyItems().map((i) => i.key);
		const x = (usePulls().data ?? []).filter(
			(p) => p.state === "open" && !keys.some((k) => p.title.includes(k)),
		);
		return (
			<Card
				title={t.rights.panel.reviewRequests}
				to="/code/now"
				items={x.map((p) => `#${p.number} ${p.title}`)}
			/>
		);
	},
	testPlans: function TestPlansPanel() {
		const { t } = useI18n();
		const x = useTestPlans().data ?? [];
		return (
			<Card
				title={t.rights.panel.testPlans}
				to="/library/test-plans"
				items={x.map((p) => p.title)}
			/>
		);
	},
	screens: function ScreensPanel() {
		const { t } = useI18n();
		const x = useDesignList().data?.screens ?? [];
		return (
			<Card title={t.rights.panel.screens} to="/library/screens" items={x.map((s) => s.title)} />
		);
	},
};

/** The panels of each role (`team-rights` REQ-012), in order. */
export const ROLE_PANELS: Record<TeamRole, (keyof typeof PANELS)[]> = {
	po: ["backlogHealth", "ready", "roadmap"],
	pm: ["plan", "capacity", "risks", "spend"],
	architect: ["adrs", "drift", "designQuestions"],
	techlead: ["runs", "quality", "reviewLoad"],
	ba: ["specChanges", "openQuestions"],
	developer: ["myTickets", "myPulls", "reviewRequests"],
	qa: ["testPlans", "quality"],
	designer: ["screens", "designQuestions"],
	viewer: ["myTickets"],
};

/**
 * The plan cards of a product owner or a project manager (picture 065): when the release ends with
 * the features that are ready, and the people with too much work. The same data as Plan / Timeline.
 */
export function PlanCards({ className }: { className?: string }) {
	const { t } = useI18n();
	const day = useDay();
	const { level } = useRights();
	const sheet = (useSheets().data ?? []).find((s) => s.state === "ready");
	const plan = usePlan(sheet?.slug ?? null).data;
	const members = useTeam().data?.team.members ?? [];
	const features = useFeatures().data ?? [];
	if (!sheet || !plan || visibleSections("plan", level).length === 0) return null;
	const finish = plan.gantt.bars
		.map((b) => b.end)
		.sort()
		.at(-1);
	const name = sheet.name || sheet.slug;
	const over = overloaded(plan.load.members);
	const ready = format(t.home.featuresReady, {
		done: features.filter((f) => f.stage === "ready").length,
		total: features.length,
	});
	return (
		<div
			className={cn(
				"grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4",
				className,
			)}
		>
			<section className={cn(SURFACE, "flex flex-col gap-3.5 px-6 py-5.5")}>
				<h2 className="text-17 font-semibold text-n-12">
					{finish ? format(t.planPlace.ends, { name, day: day(finish, true) }) : name}
				</h2>
				<Progress
					value={features.filter((f) => f.stage === "ready").length}
					max={features.length}
					label={ready}
				/>
				<div className="flex items-center justify-between gap-3">
					<span>{ready}</span>
					<Link to="/plan/timeline" className={linkClass}>
						{t.ui.place.plan}
					</Link>
				</div>
			</section>
			{over.length ? (
				<AttentionCard
					title={
						over.length === 1
							? format(t.planPlace.tooMuchOne, { name: memberName(members, over[0]?.handle) })
							: format(t.planPlace.tooMuch, { count: over.length })
					}
					icon={
						<span className="flex">
							{over.map((m) => (
								<Avatar
									key={m.handle}
									name={memberName(members, m.handle)}
									className="-ml-2 ring-2 ring-surface-2 first:ml-0"
								/>
							))}
						</span>
					}
					action={
						<Link to="/plan/people" className={cn(buttonVariants(), "min-h-control")}>
							{t.planPlace.show}
						</Link>
					}
				/>
			) : null}
		</div>
	);
}

/**
 * Today, for a role (pictures 092 and 065): one chip for each role, the panels of the chosen role as
 * small cards, the work of the person, the news since the last visit and the panels of the other
 * roles. The view starts on the role of the person; a person with no role sees the chips with none
 * chosen and no panel (spec:app-redesign#REQ-009, adr:0023). The address holds the choice (`role`).
 */
export function RolePanelsPage() {
	const { t } = useI18n();
	const { teamRole } = usePrefs();
	const navigate = useNavigate();
	const search: { role?: unknown } = useSearch({ strict: false });
	const roles = Object.keys(ROLE_PANELS) as TeamRole[];
	const role = roles.find((r) => r === search.role) ?? teamRole;
	const names: Record<string, string> = t.rights.panel;
	// The same word as Role views and the first run: the viewer is "I only look".
	const roleName = (r: TeamRole) => (r === "viewer" ? t.home.roles.viewer : t.rights.role[r]);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<NoSwitch>
				<PageHeader
					title={
						role
							? format(t.home.forRole, { role: t.rights.role[role].toLowerCase() })
							: t.ui.place.today
					}
					action={
						<Link to="/setup/role-views" className={cn(buttonVariants(), "min-h-control")}>
							{t.home.roleViews}
						</Link>
					}
				/>
			</NoSwitch>
			<div className="flex flex-col gap-4 px-4">
				{/* biome-ignore lint/a11y/useSemanticElements: a fieldset draws its own frame */}
				<div role="group" aria-label={t.rights.team.pickRole} className="flex flex-wrap gap-2">
					{roles.map((r) => (
						<Chip
							key={r}
							selected={r === role}
							className={r === role ? undefined : "bg-surface-2"}
							onClick={() =>
								void navigate({ to: "/today/panels", search: { role: r }, replace: true })
							}
						>
							{roleName(r)}
						</Chip>
					))}
				</div>
				<TimeReminder alert />
				{role ? (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-4">
						{ROLE_PANELS[role].map((id) => {
							const P = PANELS[id] as () => ReactNode;
							return <P key={id} />;
						})}
					</div>
				) : null}
				{role === "po" || role === "pm" ? <PlanCards /> : null}
				<div className="flex flex-wrap items-start gap-6">
					<div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
						<MyWork />
						<SinceAway />
					</div>
					<section
						aria-labelledby="other-panels"
						className={cn(SURFACE, "min-w-0 flex-[1_1_420px] py-2")}
					>
						<h2 id="other-panels" className={CARD_TITLE}>
							{t.home.otherPanels}
						</h2>
						{roles
							.filter((r) => r !== role)
							.map((r) => (
								<Row key={r}>
									<span className="flex-[1_1_200px] font-medium">{roleName(r)}</span>
									<span className="flex flex-[3_1_320px] flex-wrap gap-1.5 py-2">
										{ROLE_PANELS[r].map((id) => (
											<Badge key={id}>{names[id]}</Badge>
										))}
									</span>
								</Row>
							))}
					</section>
				</div>
			</div>
		</div>
	);
}
