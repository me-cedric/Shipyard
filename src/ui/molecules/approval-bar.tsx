import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import type { ApprovalView } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";

/**
 * One write that waits for a click (delivery REQ-021 and the approvals of the Inbox). It names the
 * write in plain words. A push that rewrites history is in the danger colour. The exact command
 * stays behind Details; a comment or a pull request body shows, because it is the text that goes out.
 * Approve sends it. Reject drops it and blocks the run.
 */
export function ApprovalBar({
	approval: a,
	meta,
	onApprove,
	onReject,
}: {
	approval: Pick<ApprovalView, "kind" | "key" | "title" | "summary" | "detail" | "force">;
	/** The run chip and the ticket key. */
	meta?: ReactNode;
	onApprove: () => void;
	onReject: () => void;
}) {
	const { t } = useI18n();
	const said = t.home.approval;
	const kind = a.force ? "force" : a.kind in said ? (a.kind as keyof typeof said) : "other";
	const sentence = format(said[kind], { key: a.key || a.title });
	const command = a.kind === "push";
	return (
		<section
			aria-label={sentence}
			className={cn("flex flex-col gap-2 border-b px-3 py-2", a.force && "bg-danger-soft")}
		>
			<div className="flex flex-wrap items-center gap-2">
				{meta}
				<span className={cn("flex-1 text-ui font-medium", a.force && "text-danger-text")}>
					{sentence}
				</span>
				<Button onClick={onReject}>{t.home.reject}</Button>
				<Button variant={a.force ? "danger" : "primary"} onClick={onApprove}>
					{t.home.approve}
				</Button>
			</div>
			{a.detail && !command ? (
				<pre className="whitespace-pre-wrap font-sans text-12 text-n-11">{a.detail}</pre>
			) : null}
			<details className="text-12 text-n-11">
				<summary className="w-fit cursor-pointer select-none">{t.home.details}</summary>
				<p className="pt-1">{a.summary}</p>
				{a.detail && command ? (
					<pre className="whitespace-pre-wrap font-mono">{a.detail}</pre>
				) : null}
			</details>
		</section>
	);
}
