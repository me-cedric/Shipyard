import { useState } from "react";
import { Button } from "../atoms/button";
import { Textarea } from "../atoms/textarea";

/**
 * The decision on a proposed ADR (REQ-010). Accept is the primary action and reject is the other
 * choice. Both need a comment: the field is marked as required and both buttons stay off until it
 * has text. `AdrDecision` passes no comment to accept, so this part serves the Design space.
 */
export function DesignAdrDecision({
	onAccept,
	onReject,
	busy,
	labels,
}: {
	onAccept: (comment: string) => void;
	onReject: (comment: string) => void;
	busy?: boolean;
	labels: { accept: string; reject: string; comment: string };
}) {
	const [comment, setComment] = useState("");
	const c = comment.trim();
	return (
		<div className="flex flex-col gap-2">
			<span className="flex min-w-0 flex-col gap-1">
				<span aria-hidden="true" className="text-12 text-n-11">
					{labels.comment} <span className="text-danger-text">*</span>
				</span>
				<Textarea
					label={labels.comment}
					value={comment}
					aria-required="true"
					onChange={(e) => setComment(e.target.value)}
				/>
			</span>
			<div className="flex justify-end gap-2">
				<Button disabled={busy || !c} onClick={() => onReject(c)}>
					{labels.reject}
				</Button>
				<Button disabled={busy || !c} onClick={() => onAccept(c)}>
					{labels.accept}
				</Button>
			</div>
		</div>
	);
}
