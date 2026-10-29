import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { type Status, StatusDot } from "../atoms/status-dot";

/** One pull request: its ref, title, draft mark, CI state and review state. Each state has a shape. */
export function PullRow({
	reference,
	title,
	draft,
	ci,
	ciLabel,
	review,
	reviewLabel,
	selected,
	onSelect,
}: {
	reference: string;
	title: string;
	/** The draft label. Absent when the pull request is ready. */
	draft?: string;
	ci: Status;
	ciLabel: string;
	review: Status;
	reviewLabel: string;
	selected?: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={selected || undefined}
			className={cn(
				"flex min-h-row w-full items-center gap-2 border-b px-3 py-1 text-left text-ui hover:bg-n-3",
				selected && "bg-n-4",
			)}
		>
			<span className="shrink-0 font-mono text-12 text-n-11">{reference}</span>
			<span className="min-w-0 flex-1 truncate">{title}</span>
			{draft ? <Badge>{draft}</Badge> : null}
			<StatusDot status={ci} label={ciLabel} />
			<StatusDot status={review} label={reviewLabel} />
		</button>
	);
}
