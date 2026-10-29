import { Dialog } from "@base-ui/react/dialog";
import { type FormEvent, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
import { Input } from "../atoms/input";
import { Textarea } from "../atoms/textarea";

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
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (summary: string, description: string) => Promise<unknown>;
}) {
	const { t } = useI18n();
	const [summary, setSummary] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);
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
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-n-1/60 transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<Dialog.Popup className="fixed top-24 left-1/2 z-50 w-[32rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-n-7 bg-n-2 transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
					<form onSubmit={submit} className="flex flex-col gap-2 p-3">
						<Dialog.Title className="text-14 font-medium">{t.shell.commit}</Dialog.Title>
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
						{error ? (
							<p role="alert" className="text-ui text-danger-text">
								{error}
							</p>
						) : null}
						<div className="flex justify-end gap-2">
							<Dialog.Close render={<Button variant="ghost" />}>{t.common.close}</Dialog.Close>
							<Button type="submit" variant="primary" disabled={busy}>
								{t.shell.commit}
							</Button>
						</div>
					</form>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
