import type { PullDetail } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { useBacklinks } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { Avatar } from "@/ui/atoms/avatar";
import { StatusDot } from "@/ui/atoms/status-dot";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { RefChip } from "@/ui/molecules/ref-chip";
import { REVIEW_STATUS } from "./status";

/** True when the sidebar has something to show: the page then makes room for it. */
export const hasSidebar = (d: PullDetail, cited: number) =>
	d.verdicts.length > 0 || d.links.length > 0 || cited > 0;

/** The narrow column of the Overview (REQ-044): the reviewers with their verdicts, and the linked tickets and runs. Only what the data has. */
export function PullSidebar({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const { openRef } = useShell();
	// The same backlinks as the inspector shows for another ref, here on the page.
	const cited = useBacklinks(d.reference).data ?? [];
	const group = "flex flex-col gap-2 border-b pb-3 last:border-b-0";
	const head = "text-12 font-medium text-n-11";
	return (
		<aside aria-label={t.forge.pullPage.details} className="flex flex-col gap-3 text-ui">
			{d.verdicts.length ? (
				<section className={group}>
					<h2 className={head}>{t.forge.pullPage.reviewers}</h2>
					<ul className="flex flex-col gap-1.5">
						{d.verdicts.map((v) => (
							<li key={v.reviewer} className="flex items-center gap-2">
								<Avatar name={v.reviewer} className="size-5" />
								<span className="min-w-0 flex-1 truncate">{v.reviewer}</span>
								<StatusDot
									status={REVIEW_STATUS[v.state] ?? "idle"}
									label={t.forge.verdict[v.state as "approved"]}
									className="size-2"
								/>
								<span className="text-12 text-n-11">{t.forge.verdict[v.state as "approved"]}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{d.links.length ? (
				<section className={group}>
					<h2 className={head}>{t.forge.links}</h2>
					<div className="flex flex-wrap gap-1">
						{d.links.map((l) => (
							<RefChip key={l} refId={l} state="resolved" />
						))}
					</div>
				</section>
			) : null}
			{cited.length ? (
				<section className={group}>
					<h2 className={head}>{t.forge.pullPage.citedBy}</h2>
					<BacklinkList
						groups={cited.map((g) => ({
							kind: g.kind,
							items: g.items.map((i) => ({ ref: i.source, title: i.title })),
						}))}
						onOpen={openRef}
					/>
				</section>
			) : null}
		</aside>
	);
}
