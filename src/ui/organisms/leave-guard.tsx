import { useBlocker, useRouter } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Button } from "../atoms/button";
import { Dialog } from "./dialog";

function Ask({ dirty }: { dirty: boolean }) {
	const { t } = useI18n();
	const block = useBlocker({
		shouldBlockFn: () => true,
		disabled: !dirty,
		enableBeforeUnload: dirty,
		withResolver: true,
	});
	const l = t.ui.leave;
	return (
		<Dialog
			open={block.status === "blocked"}
			onOpenChange={(open) => {
				if (!open) block.reset?.();
			}}
			title={l.title}
			actions={
				<Button variant="primary" onClick={() => block.proceed?.()}>
					{l.leave}
				</Button>
			}
		>
			<p className="text-ui">{l.body}</p>
		</Dialog>
	);
}

/** Asks before a page change while `dirty` is true. Without a router it does nothing. */
export function LeaveGuard({ dirty }: { dirty: boolean }) {
	return useRouter({ warn: false }) ? <Ask dirty={dirty} /> : null;
}
