import { useState } from "react";
import { useConflicts } from "@/lib/code";
import { useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ArrowUpTrayIcon, ChatBubbleIcon } from "@/ui/icons";

/**
 * Hands the conflicted files to the assistant (the draft names them, a person sends it) or to a
 * factory run (one work item with the `wf:` label). Legacy source: `conflict-dialog.tsx` (agent).
 */
export function ConflictAgent() {
	const { t } = useI18n();
	const { ask } = useShell();
	const workflow = useWorkflows().data?.find((w) => !w.issue)?.id;
	const [sent, setSent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const files = (useConflicts().data ?? []).map((c) => c.path);
	if (files.length === 0) return null;
	const c = t.workspace.conflict;
	return (
		<div className="flex flex-wrap items-center gap-2 px-3 py-1">
			<Button variant="ghost" onClick={() => ask(format(c.prompt, { files: files.join(", ") }))}>
				<ChatBubbleIcon size={14} />
				{c.agent}
			</Button>
			{workflow ? (
				<Button
					variant="ghost"
					onClick={() =>
						unwrap(commands.conflictToFactory(workflow, true))
							.then((r) => {
								setError(null);
								setSent(r.item.key ?? r.item.reference);
							})
							.catch((e) => setError(e instanceof Error ? e.message : String(e)))
					}
				>
					<ArrowUpTrayIcon size={14} />
					{c.factory}
				</Button>
			) : null}
			{sent ? (
				<span role="status" className="text-12">
					{format(c.sent, { key: sent })}
				</span>
			) : null}
			{error ? (
				<span role="alert" className="text-12 text-danger-text">
					{error}
				</span>
			) : null}
		</div>
	);
}
