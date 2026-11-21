import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { noticeTarget, useNotifications } from "@/lib/notifications";
import { runnerName } from "@/ui/atoms/brand-icon";

/** The budgets that reached Warn at this month, and the level itself. It reads again every 10 minutes. */
export function useBudgetStatus() {
	return useQuery({
		queryKey: ["budget-status"],
		queryFn: () => unwrap(commands.budgetStatus()),
		refetchInterval: 10 * 60_000,
	});
}

/**
 * The budget notice (`spec:shell-setup-rights#REQ-007`): a notification when a budget reaches Warn
 * at. The id holds the tool, the month and the level, so each budget notifies once for each month
 * and level. The source `budget` in `Prefs.notifyOff` mutes it.
 */
export function useBudgetNotice() {
	const { t, lang } = useI18n();
	const n = t.shellFn.notify;
	const { push } = useNotifications();
	const status = useBudgetStatus().data;
	useEffect(() => {
		if (!status) return;
		const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
		for (const r of status.reached)
			void push({
				id: `budget:${r.runner || "all"}:${status.month}:${status.warnPercent}`,
				kind: "info",
				title: format(n.budgetTitle, { percent: status.warnPercent }),
				body: format(n.budgetBody, {
					name: r.runner ? runnerName(r.runner) : n.allTools,
					spent: money.format(r.spentUsd ?? 0),
					budget: money.format(r.budgetUsd ?? 0),
				}),
				target: noticeTarget({ source: "budget" }),
			});
	}, [status, push, n, lang]);
}
