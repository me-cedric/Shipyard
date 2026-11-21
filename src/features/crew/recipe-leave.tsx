import { useBlocker } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";

/**
 * Asks before a page change while `dirty` is true, as `LeaveGuard` does. A move inside the same
 * recipe (its steps, its text) keeps the draft and does not ask.
 */
export function RecipeLeave({ dirty }: { dirty: boolean }) {
	const { t } = useI18n();
	const block = useBlocker({
		shouldBlockFn: ({ current, next }) =>
			current.pathname !== next.pathname ||
			(current.search as { recipe?: string }).recipe !==
				(next.search as { recipe?: string }).recipe,
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
			closeLabel={l.stay}
			actions={
				<Button variant="primary" className="min-h-control" onClick={() => block.proceed?.()}>
					{l.leave}
				</Button>
			}
		>
			<p className="text-ui">{l.body}</p>
		</Dialog>
	);
}
