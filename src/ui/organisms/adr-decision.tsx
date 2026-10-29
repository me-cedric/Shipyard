import { useState } from "react";
import { Button } from "../atoms/button";
import { Textarea } from "../atoms/textarea";

/**
 * The decision on an ADR. Accept is the primary action. Reject needs a comment.
 */
export function AdrDecision({
	onAccept,
	onReject,
	busy,
	error,
	labels,
}: {
	onAccept: () => void;
	onReject: (comment: string) => void;
	busy?: boolean;
	error?: string | null;
	labels: { accept: string; reject: string; comment: string };
}) {
	const [comment, setComment] = useState("");
	return (
		<div className="flex flex-col gap-2">
			<Textarea
				caption
				label={labels.comment}
				value={comment}
				onChange={(e) => setComment(e.target.value)}
			/>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex justify-end gap-2">
				<Button disabled={busy || !comment.trim()} onClick={() => onReject(comment.trim())}>
					{labels.reject}
				</Button>
				<Button disabled={busy} onClick={onAccept}>
					{labels.accept}
				</Button>
			</div>
		</div>
	);
}
