import type { ReactNode } from "react";
import { usePullState } from "@/features/code/pull-page";
import { hasSidebar, PullSidebar } from "@/features/code/pull-sidebar";
import { useRunScope } from "@/features/factory/runs/run-detail";
import { nameOf } from "@/features/factory/runs/run-live";
import { format, useI18n } from "@/lib/i18n";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { useBacklinks } from "@/lib/refs";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { CpuChipIcon } from "@/ui/icons";
import { countsOf } from "@/ui/molecules/diff-file-list";
import type { Section } from "../sections";
import { AgentCard } from "./agent-card";

function Block({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section aria-label={title} className="flex flex-col gap-2 rounded-lg border bg-surface-1 p-3">
			<h2 className="text-14 font-medium text-n-12">{title}</h2>
			{children}
		</section>
	);
}

/** The side column of the Story: the agent, the brief, the changes and the people. */
export function Side({
	feature,
	hasChange,
	onSection,
}: {
	feature: Feature;
	hasChange: boolean;
	onSection: (s: Section) => void;
}) {
	const { t } = useI18n();
	const x = t.flow.feature;
	const scope = useRunScope();
	const pull = usePullState()?.d ?? null;
	const cited = useBacklinks(pull?.reference ?? null).data?.length ?? 0;
	const lines = (scope?.diff ?? []).reduce(
		(sum, f) => {
			const n = countsOf(f.text ?? "");
			return { added: sum.added + n.added, removed: sum.removed + n.removed };
		},
		{ added: 0, removed: 0 },
	);
	const files = scope?.diff.length ?? 0;
	return (
		<aside className="flex flex-col gap-3">
			{scope ? <AgentCard scope={scope} onTalk={() => onSection("chat")} /> : null}
			<Block title={x.side.brief}>
				{feature.questions > 0 ? (
					<p className="text-ui text-n-12">
						{format(x.openQuestions, { count: feature.questions })}
					</p>
				) : null}
				<div>
					<Button className="min-h-control" onClick={() => onSection("brief")}>
						{x.side.open}
					</Button>
				</div>
				{hasChange ? null : <p className="text-ui text-n-11">{x.noSpec}</p>}
			</Block>
			<Block title={x.side.changes}>
				{files ? (
					<p className="text-ui text-n-12">
						{format(x.files, { count: files })} {format(x.lines, lines)}
					</p>
				) : null}
				<div>
					<Button className="min-h-control" onClick={() => onSection("changes")}>
						{x.side.open}
					</Button>
				</div>
			</Block>
			{feature.who ? (
				<Block title={x.side.people}>
					<p className="flex items-center gap-2 text-ui text-n-12">
						{feature.who.agent ? (
							<CpuChipIcon size={16} />
						) : (
							<Avatar name={feature.who.name} className="size-5" />
						)}
						{feature.who.agent ? nameOf(feature.who.name) : feature.who.name}
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
