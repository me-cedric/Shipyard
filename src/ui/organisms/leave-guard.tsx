import { useBlocker, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "../atoms/button";
import { Dialog } from "./dialog";

type Props = {
	dirty: boolean;
	/** The file that is not saved: the question names it. */
	file?: string;
	/** Saves the file. With it, the question offers Save and leave. */
	onSave?: () => unknown;
};

function Ask({ dirty, file, onSave }: Props) {
	const { t } = useI18n();
	const block = useBlocker({
		shouldBlockFn: () => true,
		disabled: !dirty,
		enableBeforeUnload: dirty,
		withResolver: true,
	});
	const [error, setError] = useState<string | null>(null);
	const l = t.ui.leave;
	const saveAndLeave = async () => {
		try {
			await onSave?.();
			block.proceed?.();
		} catch (e) {
			setError(String(e));
		}
	};
	return (
		<Dialog
			open={block.status === "blocked"}
			onOpenChange={(open) => {
				if (!open) {
					setError(null);
					block.reset?.();
				}
			}}
			title={file ? l.titleOne : l.title}
			closeLabel={l.stay}
			actions={
				<>
					<Button className="min-h-control" onClick={() => block.proceed?.()}>
						{l.leave}
					</Button>
					{onSave ? (
						<Button variant="primary" className="min-h-control" onClick={() => void saveAndLeave()}>
							{l.save}
						</Button>
					) : null}
				</>
			}
		>
			{file ? <p className="font-mono text-ui">{file}</p> : <p className="text-ui">{l.body}</p>}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}

/** Asks before a page change while `dirty` is true. Without a router it does nothing. */
export function LeaveGuard(props: Props) {
	return useRouter({ warn: false }) ? <Ask {...props} /> : null;
}
