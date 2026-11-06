import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type TabPath, tabLabel } from "@/features/shell/spaces";
import { usePulls, useQuality } from "@/lib/code/forge";
import { useDesignList } from "@/lib/design";
import { useDailySpend, useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { TeamRole } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useHealth } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { useChanges, useQuestions, useTestPlans } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { useTeam } from "@/lib/work";
import { ChevronRightIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { useMyItems } from "./stats";

const SHOWN = 5;

/** One panel: a title with its count, a few lines, and a link to its page. It hides when it has nothing. */
function Card({
	title,
	to,
	items,
	count = items.length,
	children,
}: {
	title: string;
	to: TabPath;
	items: string[];
	count?: number;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	if (count === 0 && !children) return null;
	const [, space, tab] = to.split("/");
	return (
		<Panel
			title={title}
			count={children ? undefined : count}
			flush
			toolbar={
				<Link
					to={to}
					aria-label={`${t.space[space as keyof typeof t.space]} / ${tabLabel(t, space as keyof typeof t.space, tab ?? "")}`}
					className="flex size-6 items-center justify-center rounded-md text-n-11 hover:bg-n-3"
				>
					<ChevronRightIcon size={14} />
				</Link>
			}
		>
			{children ?? (
				<ul className="flex flex-col">
					{items.slice(0, SHOWN).map((x) => (
						<li
							key={x}
							className="h-row truncate border-b px-3 text-ui leading-[var(--row)] last:border-b-0"
						>
							{x}
						</li>
					))}
				</ul>
			)}
		</Panel>
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
				to="/work/backlog"
				items={x.map((i) => line(i.key, i.title))}
			/>
		);
	},
	ready: function ReadyPanel() {
		const { t } = useI18n();
		return (
			<Card
				title={t.rights.panel.ready}
				to="/work/backlog"
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
				to="/work/plan"
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
				to="/work/plan"
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
				to="/work/plan"
				items={x.map((m) => `${m.name} ${m.capacity ?? 0}`)}
			/>
		);
	},
	risks: function RisksPanel() {
		const { t } = useI18n();
		const x = (useHealth().data ?? []).filter((f) => f.severity !== "info");
		return <Card title={t.rights.panel.risks} to="/settings/health" items={x.map((f) => f.id)} />;
	},
	spend: function SpendPanel() {
		const { t, lang } = useI18n();
		const { can } = useRights();
		const month = useDailySpend(31).month;
		if (!can("costs.view") || month === 0) return null;
		const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(month);
		return (
			<Card title={t.rights.panel.spend} to="/factory/usage" items={[]}>
				{<p className="px-3 py-2 font-mono text-ui">{money}</p>}
			</Card>
		);
	},
	adrs: function AdrsPanel() {
		const { t } = useI18n();
		const x = useDesignList().data?.adrs ?? [];
		return (
			<Card
				title={t.rights.panel.adrs}
				to="/design/decisions"
				items={x.map((a) => `${a.number} ${a.title}`)}
			/>
		);
	},
	drift: function DriftPanel() {
		const { t } = useI18n();
		const x = (useDesignList().data?.artifacts ?? []).filter((a) => a.issue);
		return (
			<Card title={t.rights.panel.drift} to="/design/diagrams" items={x.map((a) => a.title)} />
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
				to="/specs/questions"
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
				to="/factory/runs"
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
				to="/code/quality"
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
				to="/code/pull-requests"
				items={x.map((p) => `#${p.number} ${p.title}`)}
			/>
		);
	},
	specChanges: function SpecChangesPanel() {
		const { t } = useI18n();
		const x = (useChanges().data ?? []).filter((c) => !c.validated);
		return (
			<Card title={t.rights.panel.specChanges} to="/specs/changes" items={x.map((c) => c.title)} />
		);
	},
	openQuestions: function OpenQuestionsPanel() {
		const { t } = useI18n();
		const x = (useQuestions().data ?? []).filter((e) => e.question.status === "open");
		return (
			<Card
				title={t.rights.panel.openQuestions}
				to="/specs/questions"
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
				to="/work/backlog"
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
				to="/code/pull-requests"
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
				to="/code/pull-requests"
				items={x.map((p) => `#${p.number} ${p.title}`)}
			/>
		);
	},
	testPlans: function TestPlansPanel() {
		const { t } = useI18n();
		const x = useTestPlans().data ?? [];
		return (
			<Card title={t.rights.panel.testPlans} to="/specs/test-plans" items={x.map((p) => p.title)} />
		);
	},
	screens: function ScreensPanel() {
		const { t } = useI18n();
		const x = useDesignList().data?.screens ?? [];
		return (
			<Card title={t.rights.panel.screens} to="/design/screens" items={x.map((s) => s.title)} />
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

/** The panels of the role of the person, before the sections of Today. A solo person has none. */
export function RolePanels() {
	const { teamRole } = usePrefs();
	if (!teamRole) return null;
	return (
		<div className="grid gap-3 px-4 @xl:grid-cols-2">
			{ROLE_PANELS[teamRole].map((id) => {
				const P = PANELS[id] as () => ReactNode;
				return <P key={id} />;
			})}
		</div>
	);
}
