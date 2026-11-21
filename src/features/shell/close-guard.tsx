import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";

/**
 * The window asked to close while a run or an assistant turn works. The person lets the agents
 * work (the window stays), or stops them (the window closes, and the work ends with it).
 */
export function CloseGuard() {
	const { t } = useI18n();
	const { closeGuardOpen, setCloseGuardOpen } = useShell();
	const m = t.workspace.moment;
	const state = useQuery({
		queryKey: ["close-guard"],
		queryFn: () => unwrap(commands.closeGuardState()),
		enabled: closeGuardOpen,
	});
	return (
		<Dialog
			open={closeGuardOpen}
			onOpenChange={setCloseGuardOpen}
			title={
				state.data?.runs ? format(m.agents, { count: state.data.runs }) : t.ui.closeGuard.title
			}
			actions={
				<>
					<Button className="min-h-control" onClick={() => void unwrap(commands.closeAnyway())}>
						{state.data?.runs ? m.stop : t.ui.closeGuard.close}
					</Button>
					<Button
						variant="primary"
						className="min-h-control"
						onClick={() => setCloseGuardOpen(false)}
					>
						{state.data?.runs ? m.keep : t.ui.closeGuard.keep}
					</Button>
				</>
			}
		>
			{state.data && state.data.runs + state.data.turns > 0 ? (
				<p className="text-ui">
					{format(t.ui.closeGuard.body, { runs: state.data.runs, turns: state.data.turns })}
				</p>
			) : null}
			{state.data?.drafts ? (
				<p className="text-ui">
					{state.data.drafts === 1
						? t.ui.closeGuard.draftsOne
						: format(t.ui.closeGuard.drafts, { drafts: state.data.drafts })}
				</p>
			) : null}
		</Dialog>
	);
}
