import type { PullDetail } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { useBacklinks } from "@/lib/refs";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { AgentReview } from "./agent-review";
import { MergeBox } from "./merge-box";
import { PrAi } from "./pr-ai";
import { Conversation } from "./pull-conversation";
import { hasSidebar, PullSidebar } from "./pull-sidebar";

/**
 * The Overview tab (REQ-044): the merge box, the description as Markdown, the assistant actions, the
 * conversation, and a narrow column on the right from 1100 px (below the page under it).
 */
export function PullOverview({
	d,
	draft,
	setDraft,
}: {
	d: PullDetail;
	draft: string;
	setDraft: (draft: string) => void;
}) {
	const { t } = useI18n();
	const cited = useBacklinks(d.reference).data?.length ?? 0;
	return (
		<div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_16rem]">
			<div className="flex min-w-0 flex-col gap-4">
				<MergeBox key={`${d.number}${d.state}${d.draft}`} d={d} />
				{d.description.trim() ? (
					<div className="rounded-lg border bg-surface-1 p-3 shadow-1 [overflow-wrap:anywhere]">
						<MarkdownView source={d.description} label={t.forge.description} reading />
					</div>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					<AgentReview d={d} />
					<PrAi d={d} />
				</div>
				<Conversation d={d} draft={draft} setDraft={setDraft} />
			</div>
			{hasSidebar(d, cited) ? <PullSidebar d={d} /> : null}
		</div>
	);
}
