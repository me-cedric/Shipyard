import { useCallback } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";

/**
 * Checks the release address and tells the person (spec `shell`, REQ-014). A newer version shows
 * once in the notification centre. The app never installs it. A manual check also says when the
 * app is up to date or when the check failed. The start check stays quiet in those cases.
 */
export function useUpdateCheck() {
	const { t } = useI18n();
	const { push } = useNotifications();
	return useCallback(
		async (manual: boolean) => {
			try {
				const info = await unwrap(commands.updateCheck());
				if (info.newer)
					push({
						id: `update:${info.latest}`,
						kind: "info",
						title: format(t.notifications.update, { version: info.latest }),
						body: info.url,
					});
				else if (manual)
					push({
						id: `update:none:${Date.now()}`,
						kind: "info",
						title: format(t.notifications.upToDate, { version: info.current }),
					});
			} catch (e) {
				if (manual)
					push({
						id: `update:error:${Date.now()}`,
						kind: "error",
						title: t.notifications.updateFailed,
						body: e instanceof Error ? e.message : String(e),
					});
			}
		},
		[t, push],
	);
}
