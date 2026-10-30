import { useCallback } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { setVersion, showNotes } from "./whats-new";

/**
 * Checks the release address and tells the person (spec `shell`, REQ-014). A newer version shows
 * once in the notification centre. The app never installs it. A manual check also says when the
 * app is up to date or when the check failed. The start check stays quiet in those cases. A manual answer is not an update event: it ignores `notifyOff`.
 */
export function useUpdateCheck() {
	const { t } = useI18n();
	const { push } = useNotifications();
	return useCallback(
		async (manual: boolean) => {
			try {
				const info = await unwrap(commands.updateCheck());
				setVersion(info.current);
				// The changelog of the version that now runs shows once. `seenVersion` is the last version
				// that ran: it moves to `current` when the notes showed, or when there are none.
				const shown =
					!info.notes ||
					(await push({
						id: `update:notes:${info.current}`,
						kind: "info",
						title: format(t.notifications.notes, { version: info.current }),
						body: info.notes,
					}));
				// The dialog opens with the entry, once, and the status bar badge opens it again.
				if (shown && info.notes) showNotes(info.current, info.notes);
				if (shown) await unwrap(commands.prefsSet({ seenVersion: info.current }));
				if (info.newer)
					push({
						id: `update:${info.latest}`,
						kind: "info",
						title: format(t.notifications.update, { version: info.latest }),
						body: info.url,
					});
				else if (manual)
					push({
						id: `check:none:${Date.now()}`,
						kind: "info",
						title: format(t.notifications.upToDate, { version: info.current }),
					});
			} catch (e) {
				if (manual)
					push({
						id: `check:error:${Date.now()}`,
						kind: "error",
						title: t.notifications.updateFailed,
						body: e instanceof Error ? e.message : String(e),
					});
			}
		},
		[t, push],
	);
}
