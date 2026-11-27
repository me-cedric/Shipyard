import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useFeature } from "@/features/flow/feature/use-feature";
import { useForgeActions, useImpactRefs, useImpacts, useImpactText, usePull } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { pullNumberOf } from "@/lib/shell";
import { buttonVariants } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ChartBarIcon } from "@/ui/icons";
import { ATTENTION_CHIP, AttentionCard } from "@/ui/molecules/attention-card";
import { BackLink } from "@/ui/molecules/back-link";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ChainWatch } from "./chain-watch";
import { withProject } from "./project-gate";
import { Elapsed } from "./quality-live";
import { useRun } from "./use-run";

/** A line of the action plan: a check box and an owner (`code-host-tickets` REQ-009). */
export type PlanLine = { text: string; done: boolean; owner: string };

/**
 * The plan file has three lists: axes (`- name: rating`), stale refs and actions. An action is a
 * numbered line, or a check box line: `- [x] text (owner: name)`.
 */
export function parsePlan(text: string) {
	const axes: [string, string][] = [];
	const stale: string[] = [];
	const actions: string[] = [];
	const lines: PlanLine[] = [];
	let part = "";
	for (const line of text.split("\n")) {
		if (line.startsWith("## ")) part = line.slice(3).trim();
		else if (part === "Axes") {
			const m = /^- (\w+): (\w+)$/.exec(line);
			if (m?.[1] && m[2]) axes.push([m[1], m[2]]);
		} else if (part === "Stale refs" && line.startsWith("- ")) stale.push(line.slice(2).trim());
		else if (part === "Actions") {
			const box = /^[-*]\s+\[([ xX])\]\s+(.*?)(?:\s+\(owner:\s*(.*?)\))?\s*$/.exec(line);
			const m = box ? null : /^\d+\.\s+(.*)$/.exec(line);
			const body = box?.[2] ?? m?.[1];
			if (!body) continue;
			actions.push(body);
			lines.push({ text: body, done: box?.[1]?.toLowerCase() === "x", owner: box?.[3] ?? "" });
		}
	}
	return { axes, stale, actions, lines };
}

const COLUMN = "flex min-w-0 flex-1 basis-64 flex-col gap-2.5 rounded-xl p-5";
const CHIP = "flex min-h-control items-center rounded-md bg-surface-1 px-3 text-ui";

/** The rows of the docs chain that wait, and the base that they count from. */
export function useChain(base: string) {
	const watch = useQuery({
		queryKey: ["code", "chain-watch", base],
		queryFn: () => unwrap(commands.codeChainWatch(base)),
		retry: false,
	});
	return (watch.data?.warnings ?? []).filter((r) => !r.ack);
}

/**
 * What a change touches (screen 50): the files, the docs that go stale and the way to the full
 * report. The feature page and the old address `/flow/impacts` share it.
 */
export function ImpactsPage({
	title,
	back,
	report,
	files: pullFiles,
}: {
	title: string;
	back: ReactNode;
	report: ReactNode;
	/** The paths of one feature. Without it, the page lists the local changes. */
	files?: string[];
}) {
	const { t } = useI18n();
	const i = t.flow.look.impact;
	const refsQuery = useImpactRefs();
	const refs = refsQuery.data;
	const latest = useImpacts().data?.[0];
	const plan = useImpactText(latest?.plan ?? null).data;
	const { analyze } = useForgeActions();
	const { failure, busy, run } = useRun();
	const { can } = useRights();
	const [base, setBase] = useState<string | null>(null);
	const [since, setSince] = useState(0);
	const [showDocs, setShowDocs] = useState(false);
	const [started, setStarted] = useState(false);
	const current = base ?? refs?.default ?? "";
	const rows = useChain(current);
	const status = useQuery({
		queryKey: ["code", "status"],
		queryFn: () => unwrap(commands.codeStatus()),
	});
	if (!refs)
		return (
			<section className="flex w-full flex-col gap-6 px-4 pb-10">
				{back}
				<ErrorNotice error={refsQuery.error} />
			</section>
		);
	const s = status.data;
	const files =
		pullFiles ??
		(s ? [...s.staged, ...s.unstaged, ...s.untracked, ...s.conflicted].map((f) => f.path) : []);
	const more = files.length - 3;
	const stale = plan ? parsePlan(plan).stale : [];
	const name = (k: string) => t.projects.path[k as "specs"] ?? k;
	const analyzeNow = () => {
		setSince(Date.now());
		void run(async () => void (await analyze(current)));
	};
	const startFix = () =>
		void run(async () => {
			for (const r of rows) await unwrap(commands.codeDocsUpdateStart(r.to, "branch", true));
			setStarted(true);
		});
	const heading =
		rows.length === 0
			? i.staleNone
			: rows.length === 1
				? i.staleOne
				: format(i.staleMany, { count: rows.length });
	const actions = (
		<>
			{report}
			{rows.length > 0 ? (
				<>
					<button
						type="button"
						aria-pressed={showDocs}
						className={buttonVariants()}
						onClick={() => setShowDocs(!showDocs)}
					>
						{rows.length === 1 ? i.showOne : format(i.showMany, { count: rows.length })}
					</button>
					{started ? (
						<Link to="/flow/flow" className={buttonVariants({ variant: "primary" })}>
							{i.runs}
						</Link>
					) : (
						<RightButton right="runs.start" variant="primary" onClick={startFix}>
							{i.fix}
						</RightButton>
					)}
				</>
			) : null}
		</>
	);
	return (
		<section aria-label={i.touches} className="flex w-full flex-col">
			<PageHeader
				title={title}
				back={back}
				menu={[
					{
						label: busy ? t.forge.impacts.analyzing : t.forge.impacts.analyze,
						disabled: busy || !can("runs.start"),
						onClick: analyzeNow,
					},
				]}
			/>
			<div className="flex flex-col gap-6 px-4 pb-10">
				<h2 className="text-30 font-semibold text-n-12">{i.touches}</h2>
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-n-11">{i.compare}</span>
					<span className="font-semibold">{i.mine}</span>
					<span className="text-n-11">{i.withBase}</span>
					<Select
						label={t.forge.impacts.base}
						items={[...refs.branches, ...refs.tags].map((r) => ({ value: r, label: r }))}
						value={current}
						onValueChange={setBase}
						className="min-w-24 font-mono [&_svg]:hidden"
					/>
					{busy ? <Elapsed since={since} /> : null}
				</div>
				<ErrorNotice error={failure} />
				{rows.length > 0 ? (
					<AttentionCard who={t.factory.agent} title={heading}>
						<div className="flex flex-wrap gap-3">{actions}</div>
					</AttentionCard>
				) : (
					<section className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-2 px-6 py-5 shadow-2">
						<h2 className="min-w-0 flex-1 basis-64 text-20 font-semibold text-n-12">{heading}</h2>
						{actions}
					</section>
				)}
				{showDocs ? <ChainWatch base={current} /> : null}
				<div className="flex flex-wrap items-stretch gap-4">
					<section aria-label={i.files} className={`${COLUMN} bg-n-3`}>
						<h2 className="text-17 font-semibold text-n-12">{i.files}</h2>
						{files.slice(0, 3).map((p) => (
							<span key={p} className={CHIP}>
								{p}
							</span>
						))}
						{more > 0 ? (
							<span className={CHIP}>
								{more === 1 ? i.moreOne : format(i.moreMany, { count: more })}
							</span>
						) : null}
					</section>
					<section aria-label={i.depends} className={`${COLUMN} bg-n-3`}>
						<h2 className="text-17 font-semibold text-n-12">{i.depends}</h2>
						<span className="text-ui text-n-11">{i.unknown}</span>
					</section>
					<section
						aria-label={i.docs}
						className={`${COLUMN} ${rows.length ? "bg-warning-soft" : "bg-n-3"}`}
					>
						<h2 className="text-17 font-semibold text-n-12">{i.docs}</h2>
						{rows.map((r) => (
							<span key={`${r.from}:${r.to}`} className={CHIP}>
								{name(r.to)}
							</span>
						))}
						{stale.map((r) => (
							<RefChip key={r} refId={r} state="unresolved" />
						))}
						{rows.length > 0 || stale.length > 0 ? (
							<span className={`self-start rounded-full px-3 py-1 text-12 ${ATTENTION_CHIP}`}>
								{i.needUpdate}
							</span>
						) : (
							<span className="text-ui text-n-11">{i.nothingStale}</span>
						)}
					</section>
				</div>
			</div>
		</section>
	);
}

/** `/flow/feature/$featureId/impacts`: the impacts of the change of one feature. */
function FeatureImpactsView() {
	const { t } = useI18n();
	const { featureId } = useParams({ from: "/flow/feature/$featureId/impacts" });
	const { feature, parts, pending } = useFeature(featureId);
	const pullId = parts.pr?.replace(/^pr:/, "").replace(/:(\d+)$/, "-$1");
	const pull = usePull(pullId ? pullNumberOf(pullId) : null);
	if (pending) return <Loading />;
	if (!feature)
		return <EmptyState icon={<ChartBarIcon size={28} />} title={t.flow.look.impact.touches} />;
	return (
		<ImpactsPage
			title={feature.title}
			files={parts.pr ? (pull.data?.files.map((f) => f.path) ?? []) : undefined}
			back={
				<BackLink
					label={t.flow.look.impact.checks}
					render={(props) => (
						<Link
							to="/flow/feature/$featureId"
							params={{ featureId }}
							search={{ section: "checks" }}
							{...props}
						/>
					)}
				/>
			}
			report={
				<Link
					to="/flow/feature/$featureId/impact-report"
					params={{ featureId }}
					className={buttonVariants()}
				>
					{t.flow.look.impact.fullReport}
				</Link>
			}
		/>
	);
}

/** `/flow/impacts`: the impacts of the working branch, with the same layout. */
function ImpactsView() {
	const { t } = useI18n();
	return (
		<ImpactsPage
			title={t.tabs.code.impacts}
			back={
				<BackLink
					label={t.flow.look.impact.flow}
					render={(props) => <Link to="/flow/flow" {...props} />}
				/>
			}
			report={
				<Link to="/flow/impacts/report" className={buttonVariants()}>
					{t.flow.look.impact.fullReport}
				</Link>
			}
		/>
	);
}

export const Impacts = withProject(ImpactsView, "impacts");
export const FeatureImpacts = withProject(FeatureImpactsView, "impacts");
