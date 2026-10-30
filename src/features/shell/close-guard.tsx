import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";

/**
 * The window asked to close while a run or an assistant turn works.
 * The person keeps working, or closes anyway.
 */
export function CloseGuard() {
	const { t } = useI18n();
	const { closeGuardOpen, setCloseGuardOpen } = useShell();
	const state = useQuery({
		queryKey: ["close-guard"],
		queryFn: () => unwrap(commands.closeGuardState()),
		enabled: closeGuardOpen,
	});
	return (
		<Dialog
			open={closeGuardOpen}
			onOpenChange={setCloseGuardOpen}
			title={t.ui.closeGuard.title}
			actions={
				<Button variant="primary" onClick={() => void unwrap(commands.closeAnyway())}>
					{t.ui.closeGuard.close}
				</Button>
			}
		>
			{state.data ? (
				<p className="text-ui">
					{format(t.ui.closeGuard.body, { runs: state.data.runs, turns: state.data.turns })}
				</p>
			) : null}
		</Dialog>
	);
}
