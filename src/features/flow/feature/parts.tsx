import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PullPart } from "@/features/code/pull-page";
import { CI_STATUS } from "@/features/code/status";
import { PlanBlock, planOf } from "@/features/factory/runs/plan";
import { RunChanges } from "@/features/factory/runs/run-changes";
import { type RunScopeData, useRunScope } from "@/features/factory/runs/run-detail";
import { nameOf } from "@/features/factory/runs/run-live";
import { UnitTranscript } from "@/features/factory/runs/unit-chat";
import { transcript } from "@/features/factory/runs/unit-transcript";
import { ChangeDetail } from "@/features/specs/change-detail";
import { NameDialog } from "@/features/specs/name-dialog";
import { TicketComments } from "@/features/sync/ticket-thread";
import { useGuard } from "@/features/work/guard";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useRunActions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useBacklinks } from "@/lib/refs";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useChanges, useSpecsActions } from "@/lib/specs";
import { StatusDot } from "@/ui/atoms/status-dot";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import type { Parts } from "./use-feature";

const keyOf = (ref?: string) => ref?.replace(/^wi:/, "");

/** "Start an agent": a ticket starts a run of its own; a feature with no ticket goes to the new feature page. */
export function StartAgent({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const act = useRunActions();
	const { openRef } = useShell();
	const { error, run: guard } = useGuard();
	const key = keyOf(parts.ticket);
	return (
		<>
			<RightButton
				right="runs.start"
				className="min-h-control"
				variant="primary"
				onClick={() =>
					key
						? void guard(async () => openRef(`run:${await act.start(key)}`))
						: void navigate({ to: "/flow/new" })
				}
			>
				{t.flow.feature.startAgent}
			</RightButton>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}

/** "Write the spec": a change from the ticket, or the new change of Specs when the feature has no ticket. */
function WriteSpec({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const navigate = useNavigate();
	const act = useSpecsActions();
	const { error, run: guard } = useGuard();
	const [naming, setNaming] = useState(false);
	const key = keyOf(parts.ticket);
	const done = async () => {
		await qc.invalidateQueries({ queryKey: ["features"] });
	};
	return (
		<>
			<RightButton
				right="specs.edit"
				className="min-h-control"
				variant="primary"
				onClick={() =>
					key
						? void guard(async () => {
								await act.changeFromTicket(key);
								await done();
							})
						: setNaming(true)
				}
			>
				{t.flow.feature.writeSpec}
			</RightButton>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{naming ? (
				<NameDialog
					title={t.specs.newChange}
					label={t.specs.changeId}
					onCreate={async (id) => {
						const c = await act.createChange(id);
						await done();
						void navigate({
							to: "/flow/feature/$featureId",
							params: { featureId: `change:${c.id}` },
							search: { section: "brief" },
						});
					}}
					onClose={() => setNaming(false)}
				/>
			) : null}
		</>
	);
}

/** Brief: the plan in review, the facts of the ticket and the spec change of the feature. */
export function Brief({ parts, onBack }: { parts: Parts; onBack: () => void }) {
	const { t } = useI18n();
	const scope = useRunScope();
	const changes = useChanges().data;
	const change = parts.change ? changes?.find((c) => `change:${c.id}` === parts.change) : undefined;
	const plan = scope && scope.run.state === "PlanReview" ? planOf(scope.events) : null;
	const key = keyOf(parts.ticket);
	return (
		<div className="flex flex-col gap-6">
			{scope && plan ? <PlanReview scope={scope} plan={plan} /> : null}
			{key ? <TicketDetail itemKey={key} comments={false} /> : null}
			{change ? (
				<ChangeDetail change={change} onBack={onBack} />
			) : (
				<EmptyState title={t.flow.feature.noSpec} extra={<WriteSpec parts={parts} />} />
			)}
		</div>
	);
}

function PlanReview({
	scope,
	plan,
}: {
	scope: RunScopeData;
	plan: NonNullable<ReturnType<typeof planOf>>;
}) {
	const { t } = useI18n();
	const { run, act, guard } = scope;
	return (
		<div className="flex flex-col gap-2">
			<PlanBlock plan={plan} />
			<div>
				<RightButton
					right="runs.approve"
					className="min-h-control"
					variant="primary"
					onClick={() => void guard(() => act.planApprove(run.id))}
				>
					{t.factory.planApprove}
				</RightButton>
			</div>
		</div>
	);
}

/** What the design kinds are: the things that a feature can cite. */
const DESIGN = ["adr", "diagram", "model", "api", "data", "flow", "screen"];

/** Design: the decisions, diagrams, screens, API and data that cite the parts of the feature. */
export function Design({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const { openRef } = useShell();
	const found = [
		useBacklinks(parts.ticket ?? null).data,
		useBacklinks(parts.change ?? null).data,
		useBacklinks(parts.run ?? null).data,
		useBacklinks(parts.pr ?? null).data,
	];
	const groups = DESIGN.flatMap((kind) => {
		const items = found.flatMap((g) => g?.find((x) => x.kind === kind)?.items ?? []);
		const seen = [...new Map(items.map((i) => [i.source, i])).values()];
		return seen.length
			? [{ kind, items: seen.map((i) => ({ ref: i.source, title: i.title })) }]
			: [];
	});
	if (!groups.length) return <EmptyState title={t.flow.feature.noDesign} />;
	return <BacklinkList groups={groups} onOpen={openRef} />;
}

/** Changes: the diff of the run and the pull request with its files, review and merge box. */
export function Changes({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const scope = useRunScope();
	const hasRun = scope && (scope.run.findings.length > 0 || scope.diff.length > 0);
	if (!scope && !parts.pr)
		return <EmptyState title={t.empty.changes} extra={<StartAgent parts={parts} />} />;
	return (
		<div className="flex flex-col gap-6">
			{scope && (hasRun || !parts.pr) ? <RunChanges run={scope.run} diff={scope.diff} /> : null}
			{parts.pr ? <PullPart part="changes" /> : null}
		</div>
	);
}

/** Checks: the gates of the run, the checks of the pull request and the link to the impacts. */
export function Checks({ parts, ci }: { parts: Parts; ci?: string | null }) {
	const { t } = useI18n();
	const f = t.factory;
	const scope = useRunScope();
	if (!scope && !parts.pr)
		return <EmptyState title={t.flow.feature.noRun} extra={<StartAgent parts={parts} />} />;
	return (
		<div className="flex flex-col gap-6">
			{scope ? (
				<Panel title={t.flow.feature.gates} count={scope.run.steps.length} flush>
					<ul>
						{scope.run.steps.map((s) => (
							<li
								key={s.id}
								className="flex min-h-row items-center gap-2 border-b px-3 text-ui last:border-b-0"
							>
								<StatusDot status={STEP_STATUS[s.state]} label={f.step[s.state]} />
								<span className="min-w-0 flex-1 truncate">{nameOf(s.id)}</span>
								<span className="text-12 text-n-11">{f.step[s.state]}</span>
							</li>
						))}
					</ul>
				</Panel>
			) : null}
			{/* The state that the card of Flow names, before the list of the checks. */}
			{ci && ci !== "none" ? (
				<p className="flex items-center gap-2 text-ui text-n-12">
					<StatusDot status={CI_STATUS[ci] ?? "idle"} label={t.forge.ci[ci as "none"]} />
					{t.forge.ci[ci as "none"]}
				</p>
			) : null}
			{parts.pr ? <PullPart part="checks" /> : null}
			<Link
				to="/code/impacts"
				className="inline-flex min-h-control w-fit items-center text-ui text-accent-text hover:underline"
			>
				{t.flow.feature.impacts}
			</Link>
		</div>
	);
}

/** Chat: the conversation of the session, the pull request conversation and the comments of the ticket. */
export function Chat({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const scope = useRunScope();
	const key = keyOf(parts.ticket);
	const session = scope?.run.steps
		.flatMap((s) => s.units)
		.find((u) => u.state === "running" && u.runner !== "");
	// An empty conversation draws no box.
	const mine = scope && session ? scope.events.filter((e) => e.step === session.id) : [];
	const talk = transcript(mine).items.length > 0;
	if (!(talk || parts.pr || key))
		return (
			<EmptyState
				title={t.flow.feature.noChat}
				extra={scope ? null : <StartAgent parts={parts} />}
			/>
		);
	return (
		<div className="flex flex-col gap-6">
			{scope && talk ? (
				<div className="overflow-hidden rounded-lg border bg-surface-1">
					<UnitTranscript events={mine} ticket={scope.run.key} running />
				</div>
			) : null}
			{parts.pr ? <PullPart part="chat" /> : null}
			{key ? <TicketComments itemKey={key} /> : null}
		</div>
	);
}
