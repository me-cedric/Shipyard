import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
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

/** The raw text behind a general sentence: an unknown error, or the output of a failed program. */
const detailsOf = (e: ReturnType<typeof toFailure>) =>
	(e.code === "unknown" && !e.own) || e.code === "tool_failed" ? e.details : null;

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
	// One log line per failure: `toFailure` runs once for each error, not on each render.
	const e = useMemo(() => (error == null || error === "" ? null : toFailure(error)), [error]);
	const f = useMemo(() => (failed ? toFailure(failed) : null), [failed]);
	if (!e) return null;
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
			else void router?.navigate({ to: "/today/today" });
			onDone?.();
		} catch (err) {
			setFailed(err);
		} finally {
			setBusy(false);
		}
	};
	// An action that failed shows its own reason, and offers no second try of the same button.
	if (f) {
		return { message: errorMessage(f, lang), details: detailsOf(f), action: null };
	}
	return {
		message: errorMessage(e, lang),
		details: detailsOf(e),
		action: a ? { label: actionLabel(a, lang), busy, run } : null,
	};
}
