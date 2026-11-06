import { useState } from "react";
import {
	type ImpactEntry,
	useForgeActions,
	useImpactRefs,
	useImpacts,
	useImpactText,
} from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Select } from "@/ui/atoms/select";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { ChartBarIcon, CpuChipIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { SplitPane } from "@/ui/molecules/split-pane";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { Assignments } from "./assignments";
import { ChainWatch } from "./chain-watch";
import { DeliveryNotes } from "./delivery-notes";
import { withProject } from "./project-gate";
import { Elapsed } from "./quality-live";
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

/** The plan file has three lists: axes (`- name: rating`), stale refs and numbered actions. */
export function parsePlan(text: string) {
	const axes: [string, string][] = [];
	const stale: string[] = [];
	const actions: string[] = [];
	let part = "";
	for (const line of text.split("\n")) {
		if (line.startsWith("## ")) part = line.slice(3).trim();
		else if (part === "Axes") {
			const m = /^- (\w+): (\w+)$/.exec(line);
			if (m?.[1] && m[2]) axes.push([m[1], m[2]]);
		} else if (part === "Stale refs" && line.startsWith("- ")) stale.push(line.slice(2).trim());
		else if (part === "Actions") {
			const m = /^\d+\.\s+(.*)$/.exec(line);
			if (m?.[1]) actions.push(m[1]);
		}
	}
	return { axes, stale, actions };
}

/** One saved analysis: the plan with its seven axes, then the digest. The two files stay apart (REQ-033). */
function Report({ entry }: { entry: ImpactEntry }) {
	const { t } = useI18n();
	const plan = useImpactText(entry.plan).data;
	const digest = useImpactText(entry.digest).data;
	const parsed = plan ? parsePlan(plan) : null;
	const i18n = t.forge.impacts;
	return (
		<div className="flex flex-col gap-3 p-3">
			{parsed ? (
				<>
					<Panel title={i18n.axes} count={parsed.axes.length} bodyClassName="gap-2.5 p-3">
						{parsed.axes.map(([axis, rating]) => {
							const bar = BAR[rating] ?? { level: 0.04, fill: "bg-n-7" };
							return (
								<div
									key={axis}
									className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-ui"
								>
									<span className="truncate text-n-12">{i18n.axis[axis as "data"] ?? axis}</span>
									<span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-n-3">
										<span
											className={cn("block h-full rounded-full", bar.fill)}
											style={{ width: `${bar.level * 100}%` }}
										/>
									</span>
									<span className="flex items-center gap-1.5 font-mono text-12 text-n-11">
										<StatusDot status={RATING[rating] ?? "idle"} label={rating} />
										<span aria-hidden="true">{rating}</span>
									</span>
								</div>
							);
						})}
					</Panel>
					<div className="grid grid-cols-2 gap-3">
						<Panel title={i18n.stale} count={parsed.stale.length}>
							<div className="flex flex-wrap gap-1">
								{parsed.stale.map((r) => (
									<RefChip key={r} refId={r} state="unresolved" />
								))}
							</div>
						</Panel>
						<Panel title={i18n.actions} count={parsed.actions.length}>
							<ol className="flex flex-col gap-1.5 text-ui">
								{parsed.actions.map((a, i) => (
									<li key={a} className="flex gap-2">
										<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-11 text-accent-text">
											{i + 1}
										</span>
										{a}
									</li>
								))}
							</ol>
						</Panel>
					</div>
				</>
			) : null}
			{digest ? (
				<Panel title={i18n.digest} bodyClassName="p-3">
					<MarkdownView source={digest} label={i18n.digest} />
				</Panel>
			) : null}
		</div>
	);
}

function ImpactsView() {
	const { t } = useI18n();
	const i18n = t.forge.impacts;
	const refsQuery = useImpactRefs();
	const refs = refsQuery.data;
	const list = useImpacts().data ?? [];
	const { analyze } = useForgeActions();
	const { error, busy, run } = useRun();
	const [base, setBase] = useState<string | null>(null);
	const [path, setPath] = useState<string | null>(null);
	const [since, setSince] = useState(0);
	if (!refs)
		return (
			<>
				<PageHeader icon={<ChartBarIcon size={16} />} title={t.tabs.code.impacts} />
				<ErrorNotice error={refsQuery.error} className="px-4 py-2" />
			</>
		);
	const current = base ?? refs.default;
	// The newest report shows until the person picks another.
	const entry = list.find((e) => e.plan === path) ?? list[0];
	const analyzeNow = () => {
		setSince(Date.now());
		void run(async () => {
			const out = await analyze(current);
			setPath(out.plan);
		});
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<ChartBarIcon size={16} />}
				title={t.tabs.code.impacts}
				count={list.length}
				action={
					<span className="flex items-center gap-2">
						<Select
							label={i18n.base}
							items={[...refs.branches, ...refs.tags].map((r) => ({ value: r, label: r }))}
							value={current}
							onValueChange={setBase}
							className="min-w-32"
						/>
						{busy ? <Elapsed since={since} /> : null}
						{entry ? (
							<RightButton right="runs.start" variant="primary" busy={busy} onClick={analyzeNow}>
								{busy ? null : <CpuChipIcon size={14} />}
								{busy ? i18n.analyzing : i18n.analyze}
							</RightButton>
						) : null}
					</span>
				}
			/>
			{error ? (
				<p role="alert" className="px-4 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex min-h-0 flex-1 gap-3 px-4 pt-1 pb-4">
				<SplitPane id="code-impacts-width" label={t.forge.resize.impacts} fallback={384}>
					<div className="flex shrink-0 flex-col gap-3 overflow-y-auto">
						<ChainWatch base={current} />
						<DeliveryNotes />
						{list.length > 0 ? (
							<Panel
								title={i18n.past}
								count={list.length}
								flush
								className="shrink-0"
								bodyClassName="py-1"
							>
								{list.map((e) => (
									<button
										key={e.plan}
										type="button"
										aria-current={e.plan === entry?.plan || undefined}
										onClick={() => setPath(e.plan)}
										className="flex min-h-row w-full items-center gap-2 px-3 text-left text-ui hover:bg-n-3 aria-[current]:bg-accent-soft"
									>
										<span className="font-mono text-12 text-n-11">{e.date}</span>
										{e.slug}
									</button>
								))}
							</Panel>
						) : null}
						<Assignments />
					</div>
				</SplitPane>
				<div className="min-w-0 flex-1 overflow-auto rounded-lg border bg-surface-1 shadow-1">
					{entry ? (
						<Report entry={entry} />
					) : (
						<EmptyState
							icon={<ChartBarIcon size={28} />}
							title={i18n.noPast}
							action={{
								label: i18n.analyze,
								icon: <CpuChipIcon size={14} />,
								onClick: analyzeNow,
								busy,
							}}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

export const Impacts = withProject(ImpactsView);
