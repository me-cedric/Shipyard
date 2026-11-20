import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useFeature } from "@/features/flow/feature/use-feature";
import { useForgeActions, useImpactRefs, useImpacts, useImpactText } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { ChartBarIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { Assignments } from "./assignments";
import { ChainWatch } from "./chain-watch";
import { DeliveryNotes } from "./delivery-notes";
import { parsePlan, useChain } from "./impacts";
import { PlanLines } from "./plan-lines";
import { withProject } from "./project-gate";
import { useRun } from "./use-run";

const RATING: Record<string, Status> = {
	none: "idle",
	low: "info",
	medium: "warning",
	high: "danger",
};
/** The length and the colour of the bar of a rating. */
const BAR: Record<string, { level: number; fill: string }> = {
	none: { level: 0.04, fill: "bg-n-7" },
	low: { level: 1 / 3, fill: "bg-info" },
	medium: { level: 2 / 3, fill: "bg-warning" },
	high: { level: 1, fill: "bg-danger" },
};
const LEVELS = ["none", "low", "medium", "high"] as const;
type Level = (typeof LEVELS)[number];

/** The size of a count: 0 none, 1 or 2 small, 3 or 4 medium, 5 or more large. */
const sizeOf = (n: number): Level => (n === 0 ? "none" : n < 3 ? "low" : n < 5 ? "medium" : "high");
/** The largest of some levels. */
const largest = (levels: string[]): Level =>
	LEVELS[Math.max(0, ...levels.map((l) => LEVELS.indexOf(l as Level)))] ?? "none";

const CARD = "flex min-w-0 flex-col gap-3 rounded-xl bg-surface-2 p-5 shadow-2";

/**
 * The impact report (screen 73): the sizes, the action plan, the digest and the delivery notes of the
 * newest saved analysis, with the past ones one click away. The feature page and the old address
 * `/flow/impacts/report` share it.
 */
function ReportPage({ title, back }: { title: string; back: ReactNode }) {
	const { t } = useI18n();
	const i = t.flow.look.impact;
	const i18n = t.forge.impacts;
	const refs = useImpactRefs().data;
	const list = useImpacts().data ?? [];
	const [path, setPath] = useState<string | null>(null);
	const [past, setPast] = useState(false);
	const [details, setDetails] = useState(false);
	const entry = list.find((e) => e.plan === path) ?? list[0];
	const plan = useImpactText(entry?.plan ?? null).data;
	const digest = useImpactText(entry?.digest ?? null).data;
	const { analyze } = useForgeActions();
	const { error, busy, run } = useRun();
	const base = refs?.default ?? "";
	const rows = useChain(base);
	const parsed = plan ? parsePlan(plan) : null;
	const rating = (axis: string) => parsed?.axes.find(([a]) => a === axis)?.[1] ?? "none";
	const specs = parsed?.stale.filter((r) => r.startsWith("spec:")).length ?? 0;
	const others = (parsed?.stale.length ?? 0) - specs + rows.length;
	const sizes: [keyof typeof i.size, Level][] = [
		["code", largest(["contracts", "data", "configuration", "security", "operations"].map(rating))],
		["specs", sizeOf(specs)],
		["docs", largest([sizeOf(others), rating("artifacts")])],
		["tests", largest([rating("behaviour")])],
		["people", sizeOf(parsed?.actions.length ?? 0)],
	];
	const again = () => void run(async () => void setPath((await analyze(base)).plan));
	const copy = () => void navigator.clipboard.writeText(digest ?? "");
	return (
		<section aria-label={i.fullReport} className="flex w-full flex-col">
			<PageHeader
				title={title}
				back={back}
				action={
					<>
						<Button aria-pressed={past} onClick={() => setPast(!past)}>
							{i.pastReports}
						</Button>
						<RightButton right="runs.start" busy={busy} onClick={again}>
							{i.again}
						</RightButton>
						<Button variant="primary" disabled={!digest} onClick={copy}>
							{i.copyBrief}
						</Button>
					</>
				}
				menu={[{ label: i.details, onClick: () => setDetails(!details) }]}
			/>
			<div className="flex flex-col gap-6 px-4 pb-10">
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
				{past ? (
					<Panel title={i.pastReports} count={list.length} flush bodyClassName="py-1">
						{list.map((e) => (
							<button
								key={e.plan}
								type="button"
								aria-current={e.plan === entry?.plan || undefined}
								onClick={() => setPath(e.plan)}
								className="flex min-h-control w-full items-center gap-2 px-3 text-left text-ui hover:bg-n-3 aria-[current]:bg-accent-soft"
							>
								<span className="font-mono text-12 text-n-11">{e.date}</span>
								{e.slug}
							</button>
						))}
					</Panel>
				) : null}
				{entry ? (
					<>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(min(170px,100%),1fr))] gap-3.5">
							{sizes.map(([key, level]) => (
								<div key={key} className={CARD}>
									<h2 className="text-17 font-semibold text-n-12">{i.size[key]}</h2>
									<Badge
										className="self-start"
										variant={level === "none" ? "neutral" : level === "low" ? "success" : "warning"}
									>
										{i.level[level]}
									</Badge>
								</div>
							))}
						</div>
						<div className="flex flex-wrap items-start gap-4">
							<div className="flex min-w-0 flex-[3_1_30rem] flex-col gap-4">
								{parsed ? (
									<>
										<section aria-label={i18n.plan} className={CARD}>
											<h2 className="text-17 font-semibold text-n-12">{i18n.plan}</h2>
											<PlanLines path={entry?.plan ?? ""} lines={parsed.lines} />
										</section>
										{details ? (
											<>
												<Panel
													title={i18n.axes}
													count={parsed.axes.length}
													bodyClassName="gap-2.5 p-3"
												>
													{parsed.axes.map(([axis, level]) => {
														const bar = BAR[level] ?? { level: 0.04, fill: "bg-n-7" };
														return (
															<div
																key={axis}
																className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-ui"
															>
																<span className="truncate text-n-12">
																	{i18n.axis[axis as "data"] ?? axis}
																</span>
																<span
																	aria-hidden="true"
																	className="h-2 overflow-hidden rounded-full bg-n-3"
																>
																	<span
																		className={cn("block h-full rounded-full", bar.fill)}
																		style={{ width: `${bar.level * 100}%` }}
																	/>
																</span>
																<span className="flex items-center gap-1.5 font-mono text-12 text-n-11">
																	<StatusDot status={RATING[level] ?? "idle"} label={level} />
																	<span aria-hidden="true">{level}</span>
																</span>
															</div>
														);
													})}
												</Panel>
												<Panel title={i18n.stale} count={parsed.stale.length}>
													<div className="flex flex-wrap gap-1">
														{parsed.stale.map((r) => (
															<RefChip key={r} refId={r} state="unresolved" />
														))}
													</div>
												</Panel>
											</>
										) : null}
									</>
								) : null}
							</div>
							<div className="flex min-w-0 flex-[2_1_18rem] flex-col gap-4">
								{digest ? (
									<section aria-label={i18n.digest} className={CARD}>
										<h2 className="text-13 font-semibold text-n-11">{i18n.digest}</h2>
										<MarkdownView source={digest} label={i18n.digest} />
									</section>
								) : null}
								<DeliveryNotes />
							</div>
						</div>
					</>
				) : (
					<EmptyState
						icon={<ChartBarIcon size={28} />}
						title={i18n.noPast}
						action={{ label: i.again, onClick: again, busy }}
					/>
				)}
				{details ? (
					<>
						<ChainWatch base={base} />
						<Assignments />
					</>
				) : null}
			</div>
		</section>
	);
}

function FeatureReportView() {
	const { t } = useI18n();
	const { featureId } = useParams({ from: "/flow/feature/$featureId/impact-report" });
	const { feature, pending } = useFeature(featureId);
	if (pending) return <Loading />;
	if (!feature)
		return <EmptyState icon={<ChartBarIcon size={28} />} title={t.flow.look.impact.fullReport} />;
	return (
		<ReportPage
			title={feature.title}
			back={
				<BackLink
					label={t.flow.look.impact.touches}
					render={(props) => (
						<Link to="/flow/feature/$featureId/impacts" params={{ featureId }} {...props} />
					)}
				/>
			}
		/>
	);
}

function ReportView() {
	const { t } = useI18n();
	const branch = useQuery({
		queryKey: ["code", "status"],
		queryFn: () => unwrap(commands.codeStatus()),
	}).data?.branch;
	return (
		<ReportPage
			title={branch ?? t.tabs.code.impacts}
			back={
				<BackLink
					label={t.flow.look.impact.touches}
					render={(props) => <Link to="/flow/impacts" {...props} />}
				/>
			}
		/>
	);
}

export const FeatureImpactReport = withProject(FeatureReportView, "impacts");
export const ImpactsReport = withProject(ReportView, "impacts");
