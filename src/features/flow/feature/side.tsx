import type { ReactNode } from "react";
import { usePullState } from "@/features/code/pull-page";
import { hasSidebar, PullSidebar } from "@/features/code/pull-sidebar";
import { type RunScopeData, useRunScope } from "@/features/factory/runs/run-detail";
import { nameOf } from "@/features/factory/runs/run-live";
import { stepperOf } from "@/features/factory/runs/run-summary";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useOpenSetting } from "@/lib/errors";
import { format, useI18n } from "@/lib/i18n";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { useBacklinks } from "@/lib/refs";
import { useAutomation } from "@/lib/sync";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { LinkButton } from "@/ui/atoms/link-button";
import { Progress } from "@/ui/atoms/progress";
import { Card } from "@/ui/molecules/card";
import { countsOf } from "@/ui/molecules/diff-file-list";
import { Row } from "@/ui/molecules/row";
import type { Section } from "../sections";
import { AgentCard } from "./agent-card";
import { keyOf } from "./start";
import type { Parts } from "./use-feature";

const LABEL = "text-13 font-semibold text-n-11";
const usd = (n: number) => `$${n.toFixed(2)}`;

function Block({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section
			aria-label={title}
			className="flex flex-col gap-2.5 rounded-lg bg-surface-2 p-5 shadow-2"
		>
			<h2 className={LABEL}>{title}</h2>
			{children}
		</section>
	);
}

/** "After you approve" (picture 024): the agent of the next step, the cost against the limit and the step. */
function AfterApprove({ run }: { run: RunScopeData["run"] }) {
	const { t } = useI18n();
	const x = t.flow.look.page;
	const step = stepperOf(run);
	const names = t.factory.agentNames;
	const next = run.steps[step.n];
	const cost = run.costUsd ?? 0;
	return (
		<Block title={x.plan.after}>
			{next ? (
				<p className="flex items-center gap-3 font-semibold text-n-12">
					<Avatar agent name={nameOf(next.id, names)} />
					{format(x.plan.starts, { agent: nameOf(next.id, names) })}
				</p>
			) : null}
			{run.budgetUsd === null ? null : (
				<Progress value={cost} max={run.budgetUsd} label={t.factory.budget} />
			)}
			<p className="flex flex-wrap justify-between gap-x-3 text-n-12">
				<span>
					{run.budgetUsd === null
						? usd(cost)
						: format(x.spent, { spent: usd(cost), budget: usd(run.budgetUsd) })}
				</span>
				<span className="text-n-11">
					{format(t.factory.stepOf, { n: step.n, total: step.total })}
				</span>
			</p>
		</Block>
	);
}

/**
 * "Agent may do alone" (picture 024): the write switches of the project and the permissions of the
 * recipe, read only. A write goes out alone when its switch is on or when the recipe names its kind.
 */
function MayDoAlone({ workflow }: { workflow: string }) {
	const { t } = useI18n();
	const x = t.flow.look.page.plan;
	const open = useOpenSetting();
	const automation = useAutomation().data?.automation;
	if (!automation) return null;
	const recipe = automation.recipe_writes?.[workflow] ?? [];
	// The kind is a prefix of the WriteKind: the full word of the move kind in quotes reads as a CSS class to the tokens check.
	const rows: [string, boolean, string][] = [
		[x.push, automation.writes.push, "push"],
		[x.pull, automation.writes.pull_request, "open"],
		[x.move, automation.writes.tracker_transition, "trans"],
		[x.comment, automation.writes.tracker_comment, "comment"],
	];
	return (
		<Card className="py-2">
			<section aria-label={x.alone} className="flex flex-col">
				<h2 className={`${LABEL} px-6 pt-3`}>{x.alone}</h2>
				{rows.map(([label, on, kind]) => (
					<Row key={kind}>
						<span className="flex-1 font-semibold">{label}</span>
						<Badge>{on || recipe.some((k) => k.startsWith(kind)) ? x.free : x.asks}</Badge>
					</Row>
				))}
				<Row>
					<LinkButton onClick={() => open("/setup/project#automation")}>{x.setup}</LinkButton>
				</Row>
			</section>
		</Card>
	);
}

/**
 * The side column of the Story: the agent, the brief, the changes and the people. A plan in review
 * shows what comes after the approval; the ticket page shows the fields of the ticket first.
 */
export function Side({
	feature,
	parts,
	mode,
	onSection,
}: {
	feature: Feature;
	parts: Parts;
	/** `plan`: the plan waits for a person. `ticket`: the ticket page. */
	mode?: "plan" | "ticket";
	onSection: (s: Section) => void;
}) {
	const { t } = useI18n();
	const x = t.flow.feature;
	const p = t.flow.look.page;
	const scope = useRunScope();
	const pull = usePullState()?.d ?? null;
	const cited = useBacklinks(pull?.reference ?? null).data?.length ?? 0;
	const key = keyOf(parts.ticket);
	if (mode === "plan" && scope)
		return (
			<aside className="flex flex-col gap-4">
				<AfterApprove run={scope.run} />
				<MayDoAlone workflow={scope.run.workflow} />
			</aside>
		);
	const lines = (scope?.diff ?? []).reduce(
		(sum, f) => {
			const n = countsOf(f.text ?? "");
			return { added: sum.added + n.added, removed: sum.removed + n.removed };
		},
		{ added: 0, removed: 0 },
	);
	const files = scope?.diff.length ?? 0;
	const agent = scope ? (
		<AgentCard scope={scope} compact={mode === "ticket"} onTalk={() => onSection("chat")} />
	) : null;
	if (mode === "ticket" && key)
		return (
			<aside className="flex flex-col gap-4">
				<Card className="py-2">
					<TicketDetail itemKey={key} fieldsOnly />
				</Card>
				{agent}
				<Badge variant="success" dot className="self-start">
					{p.ticket.sync}
				</Badge>
			</aside>
		);
	const who = feature.who;
	const whoName = who ? (who.agent ? nameOf(who.name, t.factory.agentNames) : who.name) : "";
	return (
		<aside className="flex flex-col gap-4">
			{agent}
			<Block title={x.side.brief}>
				{/* A feature that is past Spec works from its ticket: "not yet" is false for it. */}
				{parts.change || !["idea", "spec"].includes(feature.stage) ? null : (
					<p className="text-n-11">{x.noSpec}</p>
				)}
				<LinkButton onClick={() => onSection("brief")}>
					{parts.change ? nameOf(parts.change.replace(/^change:/, "")) : x.side.open}
				</LinkButton>
				{feature.questions > 0 ? (
					<Badge variant="you" className="self-start">
						{feature.questions === 1
							? p.oneQuestion
							: format(x.openQuestions, { count: feature.questions })}
					</Badge>
				) : null}
			</Block>
			<Block title={x.side.changes}>
				<div className="flex flex-wrap items-center gap-3">
					{files ? (
						<>
							<span className="font-semibold text-n-12">{format(x.files, { count: files })}</span>
							{/* A count of zero is not drawn; the exact counts are in the titles. */}
							{lines.added ? (
								<span title={p.linesAdded} className="font-semibold text-success-text">
									+{lines.added}
								</span>
							) : null}
							{lines.removed ? (
								<span title={p.linesRemoved} className="font-semibold text-danger-text">
									−{lines.removed}
								</span>
							) : null}
						</>
					) : null}
					<LinkButton className="ml-auto self-auto" onClick={() => onSection("changes")}>
						{x.side.open}
					</LinkButton>
				</div>
			</Block>
			{who ? (
				<Block title={x.side.people}>
					<p className="flex items-center gap-3 text-n-12">
						<Avatar agent={who.agent} name={whoName} />
						<span className="font-semibold">{whoName}</span>
						{who.agent ? null : <span className="text-n-11">{p.owner}</span>}
					</p>
					{pull && hasSidebar(pull, cited) ? <PullSidebar d={pull} /> : null}
				</Block>
			) : pull && hasSidebar(pull, cited) ? (
				<Block title={x.side.people}>
					<PullSidebar d={pull} />
				</Block>
			) : null}
		</aside>
	);
}
