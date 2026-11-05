import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { actionLabel, errorMessage } from "@/lib/i18n/errors";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { useSyncNow } from "@/lib/sync";

/**
 * Opens a Settings row: `target` is a route and an anchor id, such as `/settings/project#issue-tracker`.
 * `useAnchorArrival` scrolls to the row, focuses its control and rings it.
 */
export function useOpenSetting() {
	const router = useRouter({ warn: false });
	return useCallback((target: string) => router?.history.push(target), [router]);
}

/**
 * The sentence of an error and its one action, ready to show. The action runs here: it opens the
 * Settings row, syncs, installs the tool or goes to create a project. `onDone` runs after it.
 */
export function useErrorNotice(error: unknown, onDone?: () => void) {
	const { lang } = useI18n();
	const router = useRouter({ warn: false });
	const qc = useQueryClient();
	const syncNow = useSyncNow();
	const open = useOpenSetting();
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState<unknown>(null);
	if (error == null || error === "") return null;
	const e = toFailure(error);
	const a = e.action;
	const run = async () => {
		if (!a) return;
		setFailed(null);
		setBusy(true);
		try {
			if (a.kind === "setting") open(a.target);
			else if (a.kind === "sync") await syncNow();
			else if (a.kind === "install") {
				await unwrap(commands.doctorToolInstall(a.target, true));
				await qc.invalidateQueries({ queryKey: ["doctor"] });
			} else if (a.kind === "open") open(a.target);
			else void router?.navigate({ to: "/home/today" });
			onDone?.();
		} catch (err) {
			setFailed(err);
		} finally {
			setBusy(false);
		}
	};
	// An action that failed shows its own reason, and offers no second try of the same button.
	if (failed) return { message: errorMessage(toFailure(failed), lang), action: null };
	return {
		message: errorMessage(e, lang),
		action: a ? { label: actionLabel(a, lang), busy, run } : null,
	};
}
