import { useState } from "react";
import { Button } from "../atoms/button";
import { Textarea } from "../atoms/textarea";

/**
 * The decision on a proposed ADR (REQ-010). Accept is the primary action and reject is the other
 * choice. Both need a comment: an empty one shows `required` and changes nothing.
 * `AdrDecision` passes no comment to accept, so this part serves the Design space.
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
	labels: { accept: string; reject: string; comment: string; required: string };
}) {
	const [comment, setComment] = useState("");
	const [missing, setMissing] = useState(false);
	const decide = (go: (comment: string) => void) => () => {
		const c = comment.trim();
		setMissing(!c);
		if (c) go(c);
	};
	return (
		<div className="flex flex-col gap-2">
			<Textarea
				caption
				label={labels.comment}
				value={comment}
				aria-invalid={missing || undefined}
				onChange={(e) => {
					setComment(e.target.value);
					setMissing(false);
				}}
			/>
			{missing ? (
				<p role="alert" className="text-ui text-danger-text">
					{labels.required}
				</p>
			) : null}
			<div className="flex justify-end gap-2">
				<Button disabled={busy} onClick={decide(onReject)}>
					{labels.reject}
				</Button>
				<Button disabled={busy} onClick={decide(onAccept)}>
					{labels.accept}
				</Button>
			</div>
		</div>
	);
}
