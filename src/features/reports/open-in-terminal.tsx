import { useI18n } from "@/lib/i18n";
import { commands, errorDialog, toFailure, unwrap } from "@/lib/ipc";
import { IconButton } from "@/ui/atoms/icon-button";
import { CommandLineIcon } from "@/ui/icons";

/** Opens the terminal app of Settings / Me in a folder of the project (empty: the project folder). */
export function OpenInTerminal({ folder = "" }: { folder?: string }) {
	const { t } = useI18n();
	return (
		<IconButton
			label={t.reports.terminal.open}
			onClick={() =>
				void unwrap(commands.terminalLaunch(folder, true)).catch((e) =>
					errorDialog(toFailure(e).message),
				)
			}
		>
			<CommandLineIcon size={16} />
		</IconButton>
	);
}
