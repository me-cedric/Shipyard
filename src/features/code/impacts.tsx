import { useState } from "react";
import {
	type ImpactEntry,
	useForgeActions,
	useImpactRefs,
	useImpacts,
	useImpactText,
} from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon } from "@/ui/icons";
import { GroupSection } from "@/ui/molecules/group-section";
import { RefChip } from "@/ui/molecules/ref-chip";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { Assignments } from "./assignments";
import { withProject } from "./project-gate";
import { useRun } from "./use-run";

const RATING: Record<string, Status> = {
	none: "idle",
	low: "info",
	medium: "warning",
	high: "danger",
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
		<div>
			{parsed ? (
				<>
					<GroupSection name={i18n.axes} count={parsed.axes.length}>
						{parsed.axes.map(([axis, rating]) => (
							<div key={axis} className="flex min-h-row items-center gap-2 px-3 text-ui">
								<StatusDot status={RATING[rating] ?? "idle"} label={rating} />
								{i18n.axis[axis as "data"] ?? axis}
							</div>
						))}
					</GroupSection>
					<GroupSection name={i18n.stale} count={parsed.stale.length}>
						<div className="flex flex-wrap gap-1 px-3 py-1">
							{parsed.stale.map((r) => (
								<RefChip key={r} refId={r} state="unresolved" />
							))}
						</div>
					</GroupSection>
					<GroupSection name={i18n.actions} count={parsed.actions.length}>
						<ol className="list-decimal px-8 py-1 text-ui">
							{parsed.actions.map((a) => (
								<li key={a}>{a}</li>
							))}
						</ol>
					</GroupSection>
				</>
			) : null}
			{digest ? (
				<div className="px-3 py-2">
					<MarkdownView source={digest} label={i18n.digest} />
				</div>
			) : null}
		</div>
	);
}

function ImpactsView() {
	const { t } = useI18n();
	const i18n = t.forge.impacts;
	const refs = useImpactRefs().data;
	const list = useImpacts().data ?? [];
	const { analyze } = useForgeActions();
	const { error, run } = useRun();
	const [base, setBase] = useState<string | null>(null);
	const [path, setPath] = useState<string | null>(null);
	if (!refs) return null;
	const current = base ?? refs.default;
	const entry = list.find((e) => e.plan === path);
	return (
		<div className="flex h-full">
			<h1 className="sr-only">{t.tabs.code.impacts}</h1>
			<div className="w-[24rem] shrink-0 overflow-y-auto border-r">
				<div className="flex items-center gap-2 border-b px-3 py-2">
					<Select
						label={i18n.base}
						items={[...refs.branches, ...refs.tags].map((r) => ({ value: r, label: r }))}
						value={current}
						onValueChange={setBase}
						className="min-w-32"
					/>
					<Button
						variant="primary"
						onClick={() =>
							void run(async () => {
								const out = await analyze(current);
								setPath(out.plan);
							})
						}
					>
						<CpuChipIcon size={14} />
						{i18n.analyze}
					</Button>
				</div>
				{error ? (
					<p role="alert" className="px-3 py-2 text-ui text-danger-text">
						{error}
					</p>
				) : null}
				<GroupSection name={i18n.past} count={list.length}>
					{list.map((e) => (
						<button
							key={e.plan}
							type="button"
							aria-current={e.plan === path || undefined}
							onClick={() => setPath(e.plan)}
							className="flex min-h-row w-full items-center gap-2 border-b px-3 text-left text-ui hover:bg-n-3 aria-[current]:bg-n-4"
						>
							<span className="font-mono text-12 text-n-11">{e.date}</span>
							{e.slug}
						</button>
					))}
				</GroupSection>
				<Assignments />
			</div>
			<div className="min-w-0 flex-1 overflow-auto">{entry ? <Report entry={entry} /> : null}</div>
		</div>
	);
}

export const Impacts = withProject(ImpactsView);
