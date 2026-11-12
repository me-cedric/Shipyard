import { webUrl } from "@/features/factory/runs/run-summary";
import type { PullDetail } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { openUrl } from "@/lib/menus";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CheckIcon, ClockIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { CI_STATUS } from "./status";

/** One line of a list panel. */
const ROW = "flex min-h-row items-center gap-2 border-b px-3 text-ui last:border-b-0";

/** The Commits tab: each commit as its ref and its summary. */
export function PullCommits({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	return (
		<Panel title={t.forge.commits} count={d.commits.length} icon={<ClockIcon size={14} />} flush>
			{d.commits.map((c) => (
				<div key={c.reference} className={ROW}>
					<RefChip refId={c.reference} state="resolved" />
					<span className="truncate">{c.summary}</span>
				</div>
			))}
		</Panel>
	);
}

const ORDER = ["failing", "pending", "passing", "skipped"];

/** The Checks tab: failing first. A check with a web address links to it. */
export function PullChecks({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const checks = [...d.checks].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
	return (
		<Panel title={t.forge.checks} count={d.checks.length} icon={<CheckIcon size={14} />} flush>
			{checks.map((c) => {
				const url = webUrl(c.url);
				const word = t.forge.check[c.state as "passing"];
				return (
					<div key={c.name} className={ROW}>
						<StatusDot status={CI_STATUS[c.state] ?? "idle"} label={word} />
						{url ? (
							<a
								href={url}
								onClick={(e) => {
									e.preventDefault();
									openUrl(url);
								}}
								className="rounded-sm text-accent-text hover:underline focus-visible:shadow-glow"
							>
								{c.name}
							</a>
						) : (
							c.name
						)}
						<span className="ml-auto text-12 text-n-11">{word}</span>
					</div>
				);
			})}
		</Panel>
	);
}
