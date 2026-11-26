import { useErrorNotice } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/menus";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";

/**
 * A failed command as one plain sentence, its action as a button, and the raw text behind a Details disclosure. Pass the
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
	const { t } = useI18n();
	if (!notice) return null;
	const { action, details } = notice;
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
			{details ? (
				<details className="w-full">
					<summary className="flex min-h-control cursor-pointer items-center">
						{t.ui.item.details}
					</summary>
					<code className="block font-mono text-13 break-words whitespace-pre-wrap">{details}</code>
					<Button onClick={() => void copyText(details)}>{t.ui.item.copy}</Button>
				</details>
			) : null}
		</div>
	);
}
