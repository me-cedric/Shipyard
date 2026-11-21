import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, confirmDialog, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useNotifications } from "@/lib/notifications";

/**
 * Sign out (`spec:shell-setup-rights#REQ-001`): after a confirmation that lists what it removes,
 * the tokens of the code host and of the issue tracker leave the keychain of this computer. The AI
 * tools and OpenRouter stay signed in. Cancel removes nothing.
 */
export function useSignOut() {
	const { t } = useI18n();
	const s = t.shellFn.signOut;
	const { push } = useNotifications();
	const qc = useQueryClient();
	return useCallback(async () => {
		try {
			const signed = await unwrap(commands.accountSignOutList());
			if (signed.length === 0) {
				void push({ id: `sign-out:none:${Date.now()}`, kind: "info", title: s.none });
				return;
			}
			const names = signed.map((c) => c.name).join(", ");
			if (!(await confirmDialog(format(s.confirm, { names })))) return;
			await unwrap(commands.accountSignOut(true));
			await qc.invalidateQueries();
			void push({
				id: `sign-out:${Date.now()}`,
				kind: "info",
				title: format(s.done, { names }),
			});
		} catch (e) {
			logError(e);
			void push({
				id: `sign-out:error:${Date.now()}`,
				kind: "error",
				title: s.label,
				body: e instanceof Error ? e.message : String(e),
			});
		}
	}, [s, push, qc]);
}
