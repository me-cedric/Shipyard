import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { actionLabel, errorMessage } from "@/lib/i18n/errors";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { askForm } from "@/lib/shell";
import { useSyncNow } from "@/lib/sync";

/** The page and the form of each Settings field that an error can name. */
const SETTING = {
	connections: { to: "/settings/connections", form: "connection" },
	trackerScope: { to: "/settings/project", form: "trackerScope" },
	pickupLabel: { to: "/settings/project", form: "pickupLabel" },
	terminalApp: { to: "/settings/me", form: "terminalApp" },
} as const;

/** Opens a Settings field: the page of the field, then its form. */
export function useOpenSetting() {
	const router = useRouter({ warn: false });
	return useCallback(
		(target: string) => {
			const s = SETTING[target as keyof typeof SETTING] ?? SETTING.trackerScope;
			askForm(s.form);
			void router?.navigate({ to: s.to });
		},
		[router],
	);
}

/**
 * The sentence of an error and its one action, ready to show. The action runs here: it opens the
 * Settings field, syncs, installs the tool or goes to create a project. `onDone` runs after it.
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
			} else if (a.kind === "open") router?.history.push(a.target);
			else void router?.navigate({ to: "/home/inbox" });
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
