import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { ApprovalView } from "@/lib/ipc";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";

/**
 * One write that waits for a click (delivery REQ-021 and the approvals of the Inbox). It names the
 * write: kind, summary and the text that goes out. Approve sends it. Reject drops it and blocks the run.
 */
export function ApprovalBar({
	approval: a,
	meta,
	onApprove,
	onReject,
}: {
	approval: Pick<ApprovalView, "kind" | "summary" | "detail" | "force">;
	/** The run chip and the ticket key. */
	meta?: ReactNode;
	onApprove: () => void;
	onReject: () => void;
}) {
	const { t } = useI18n();
	const kind = t.home.kind[a.kind as keyof typeof t.home.kind] ?? a.kind;
	return (
		<section aria-label={a.summary} className="flex flex-col gap-2 border-b px-3 py-2">
			<div className="flex flex-wrap items-center gap-2">
				{meta}
				<Badge>{kind}</Badge>
				{a.force ? <Badge variant="danger">{t.home.force}</Badge> : null}
				<span className="flex-1 text-ui font-medium">{a.summary}</span>
				<Button onClick={onReject}>{t.home.reject}</Button>
				<Button variant="primary" onClick={onApprove}>
					{t.home.approve}
				</Button>
			</div>
			{a.detail ? (
				<pre className="whitespace-pre-wrap font-mono text-12 text-n-11">{a.detail}</pre>
			) : null}
		</section>
	);
}
