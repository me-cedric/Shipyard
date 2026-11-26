import { type FormEvent, useId, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
import { Input } from "../atoms/input";
import { Textarea } from "../atoms/textarea";
import { ErrorNotice } from "../molecules/error-notice";
import { Dialog } from "./dialog";

/** The advice for the summary length. A longer summary still commits. */
const ADVICE = 50;

/**
 * The commit form: the summary and the description, nothing else. `onSubmit` rejects with the
 * reason, which shows under the fields. The dialog closes when it resolves.
 */
export function CommitDialog({
	open,
	onOpenChange,
	onSubmit,
	reason,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (summary: string, description: string) => Promise<unknown>;
	/** Why the commit is off: a missing right. */
	reason?: string;
}) {
	const { t } = useI18n();
	const formId = useId();
	const [summary, setSummary] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<unknown>(null);
	const [busy, setBusy] = useState(false);

	const submit = async (e?: FormEvent) => {
		e?.preventDefault();
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			await onSubmit(summary, description);
			setSummary("");
			setDescription("");
			onOpenChange(false);
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t.shell.commit}
			closeLabel={t.common.close}
			actions={
				<Button
					type="submit"
					form={formId}
					variant="primary"
					disabled={busy || !!reason}
					reason={reason}
				>
					{t.shell.commit}
				</Button>
			}
		>
			<form id={formId} onSubmit={submit} className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Input
						label={t.code.summary}
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
						autoFocus
					/>
					<span
						className={cn(
							"shrink-0 text-12",
							summary.length > ADVICE ? "text-warning-text" : "text-n-10",
						)}
					>
						{format(t.code.counter, { count: summary.length, max: ADVICE })}
					</span>
				</div>
				<Textarea
					label={t.code.description}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
					}}
				/>
				<ErrorNotice error={error} />
			</form>
		</Dialog>
	);
}
