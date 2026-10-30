import { useErrorNotice } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";

/**
 * A failed command as one plain sentence and, when the error has one, its action as a button. Pass the
 * error that the command threw. It shows nothing for `null`.
 */
export function ErrorNotice({
	error,
	onDone,
	className,
}: {
	error: unknown;
	onDone?: () => void;
	className?: string;
}) {
	const notice = useErrorNotice(error, onDone);
	if (!notice) return null;
	const { action } = notice;
	return (
		<div
			role="alert"
			className={cn("flex flex-wrap items-center gap-2 text-ui text-danger-text", className)}
		>
			<span className="min-w-0 break-words">{notice.message}</span>
			{action ? (
				<Button disabled={action.busy} onClick={() => void action.run()}>
					{action.label}
				</Button>
			) : null}
		</div>
	);
}
