import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { type PullDetail, usePendingReview } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { useDraftCount } from "@/lib/shell/drafts";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { CloseConfirm } from "./close-confirm";
import { focusPullTitle } from "./focus-title";

/**
 * The pending review above the tabs (REQ-049): the count, Submit review and Discard. It shows on every
 * tab, and only while a comment waits. The count opens the Files changed tab.
 */
export function ReviewBar({ d, onSubmit }: { d: PullDetail; onSubmit: () => void }) {
	const { t } = useI18n();
	const r = t.forge.pullReview;
	const navigate = useNavigate();
	const { pullId } = useParams({ from: "/code/pull-requests/$pullId" });
	const { comments, clear, storageError, unreadable } = usePendingReview(d.reference);
	const [discarding, setDiscarding] = useState(false);
	// The review is kept on this computer, but the close guard still says that one waits.
	useDraftCount(comments.length > 0);
	const count = comments.length;
	if (count === 0)
		return unreadable ? (
			<p role="status" className="text-ui text-n-11">
				{r.unreadable}
			</p>
		) : null;
	return (
		<section
			aria-label={r.bar}
			className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2 shadow-1"
		>
			<Button
				variant="ghost"
				className="mr-auto"
				onClick={() =>
					void navigate({
						to: "/code/pull-requests/$pullId",
						params: { pullId },
						search: { tab: "files" },
						replace: true,
					})
				}
			>
				{count === 1 ? r.pendingOne : format(r.pendingMany, { count })}
			</Button>
			<RightButton right="code.write" variant="primary" onClick={onSubmit}>
				{r.submit}
			</RightButton>
			{discarding ? (
				<CloseConfirm
					label={count === 1 ? r.discardOne : format(r.discardMany, { count })}
					onCancel={() => setDiscarding(false)}
					onConfirm={() => {
						setDiscarding(false);
						clear();
						focusPullTitle();
					}}
				/>
			) : (
				<Button onClick={() => setDiscarding(true)}>{r.discard}</Button>
			)}
			<ErrorNotice
				className="basis-full"
				error={storageError && format(t.forge.pullInline.notSaved, { reason: storageError })}
			/>
		</section>
	);
}
