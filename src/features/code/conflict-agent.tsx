import { useId, useState } from "react";
import { useConflicts } from "@/lib/code";
import { useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { LinkButton } from "@/ui/atoms/link-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/**
 * The banner of the conflicted files. "Solve it myself" opens the first one; "Solve with an agent"
 * hands them to the assistant (the draft names them, a person sends it); "Send to Flow" makes one
 * work item with the `wf:` label for a factory run.
 */
export function ConflictAgent({ onSolve }: { onSolve?: (path: string) => void }) {
	const { t } = useI18n();
	const { ask } = useShell();
	const head = useId();
	const workflow = useWorkflows().data?.find((w) => !w.issue)?.id;
	const [more, setMore] = useState(false);
	const [sent, setSent] = useState<string | null>(null);
	const [error, setError] = useState<unknown>(null);
	const files = (useConflicts().data ?? []).map((c) => c.path);
	const [first] = files;
	if (first === undefined) return null;
	const c = t.workspace.conflict;
	const n = t.forge.now;
	return (
		<section aria-labelledby={head} className="flex flex-col items-end gap-2">
			<div className="flex w-full flex-wrap items-center gap-4 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2 outline-2 outline-attention">
				<span aria-hidden="true" className="contents">
					<Avatar agent name={n.solveAgent.split(" ").at(-1) ?? ""} />
				</span>
				<h2 id={head} className="flex-[1_1_260px] text-20 font-semibold text-n-12">
					{files.length === 1 ? n.conflictOne : format(n.conflicts, { count: files.length })}
				</h2>
				<span className="min-w-0 font-mono text-14 break-all">{files.join(", ")}</span>
				{onSolve ? <Button onClick={() => onSolve(first)}>{n.solveSelf}</Button> : null}
				<Button
					variant="primary"
					onClick={() => ask(format(c.prompt, { files: files.join(", ") }))}
				>
					{n.solveAgent}
				</Button>
			</div>
			{workflow ? (
				<LinkButton aria-expanded={more} onClick={() => setMore(!more)}>
					{t.ui.more}
				</LinkButton>
			) : null}
			<div className="flex flex-wrap items-center gap-2">
				{workflow && more ? (
					<RightButton
						right="runs.start"
						variant="ghost"
						onClick={() =>
							unwrap(commands.conflictToFactory(workflow, true))
								.then((r) => {
									setError(null);
									setSent(r.item.key ?? r.item.reference);
								})
								.catch((e) => setError(e))
						}
					>
						{c.factory}
					</RightButton>
				) : null}
				{sent ? (
					<span role="status" className="text-13">
						{format(c.sent, { key: sent })}
					</span>
				) : null}
				{error ? <ErrorNotice error={error} className="text-13 text-danger-text" /> : null}
			</div>
		</section>
	);
}
