import { PullPart } from "@/features/code/pull-page";
import { RunChanges } from "@/features/factory/runs/run-changes";
import { useRunScope } from "@/features/factory/runs/run-detail";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";
import { StartAgent } from "./start";
import type { Parts } from "./use-feature";

/** Changes: the diff of the run and the pull request with its files, review and merge box. */
export function Changes({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const scope = useRunScope();
	if (!scope && !parts.pr)
		return <EmptyState title={t.empty.changes} extra={<StartAgent parts={parts} />} />;
	return (
		<div className="flex flex-col gap-6">
			{/* With a pull request the files show one time, in the pull request: the run keeps its findings. */}
			{scope && (scope.run.findings.length > 0 || !parts.pr) ? (
				<RunChanges run={scope.run} diff={parts.pr ? [] : scope.diff} />
			) : null}
			{parts.pr ? <PullPart part="changes" /> : null}
		</div>
	);
}
