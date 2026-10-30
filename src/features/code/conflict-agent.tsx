import { useConflicts } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon } from "@/ui/icons";

/** Hands the conflicted files to the assistant: the draft names them, a person sends it. Legacy source: `conflict-dialog.tsx` (agent). */
export function ConflictAgent() {
	const { t } = useI18n();
	const { ask } = useShell();
	const files = (useConflicts().data ?? []).map((c) => c.path);
	if (files.length === 0) return null;
	return (
		<div className="px-3 py-1">
			<Button
				variant="ghost"
				onClick={() => ask(format(t.workspace.conflict.prompt, { files: files.join(", ") }))}
			>
				<ChatBubbleIcon size={14} />
				{t.workspace.conflict.agent}
			</Button>
		</div>
	);
}
