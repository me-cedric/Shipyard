import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, confirmDialog, type MachineSession, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useShell } from "@/lib/shell";

const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
/** A session id is a name: letters, digits, `-` and `_`. Another text never reaches a shell. */
const PLAIN = /^[A-Za-z0-9_-]+$/;

/** The command that opens a session of this tool again: Claude Code and Codex resume one. */
export function resumeLine(runner: string, session: string | null | undefined) {
	if (!session || !PLAIN.test(session)) return null;
	return runner === "claude"
		? `claude --resume ${session}`
		: runner === "codex"
			? `codex resume ${session}`
			: null;
}

/** The line that the Shipyard terminal runs: the folder of the session, then its resume command. */
export const takeLine = (dir: string, command: string) => `cd ${quote(dir)} && ${command}`;

/** The last lines that the tool of a session wrote. Empty when the tool writes no readable history. */
export function useLiveOutput(runner: string | undefined, session: string | null | undefined) {
	return (
		useQuery({
			queryKey: ["machine", "output", runner ?? "", session ?? ""],
			queryFn: () => unwrap(commands.machineSessionOutput(runner ?? "", session ?? "")),
			enabled: !!runner && !!session,
			refetchInterval: 3000,
		}).data ?? []
	);
}

/**
 * Take control of a session of this computer: it asks, stops the session, and opens it again in the
 * Shipyard terminal (`spec:shell-setup-rights#REQ-002`). A tool with no resume command is refused.
 */
export function useTakeMachine() {
	const { t } = useI18n();
	const { runInTerminal } = useShell();
	const writes = useMachineWrites();
	return useCallback(
		async (s: MachineSession) => {
			const pid = s.pid;
			if (pid == null) return;
			const name = `${s.runner} ${s.project}`;
			if (!(await confirmDialog(format(t.shellFn.sessions.confirmTake, { name })))) return;
			try {
				const plan = await writes.take(pid);
				runInTerminal(takeLine(plan.cwd, plan.command));
			} catch (e) {
				logError(e);
			}
		},
		[t, writes, runInTerminal],
	);
}
