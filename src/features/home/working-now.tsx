import { Link } from "@tanstack/react-router";
import { useGuard } from "@/features/work/guard";
import { useDailySpend, useRunActions, useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { runHref, useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Sparkline } from "@/ui/atoms/sparkline";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { RUN_STATUS } from "@/ui/molecules/run-card";
import { useMyItems } from "./stats";

const TREND_DAYS = 14;

/** The live runs of the person, each with its stop, and the spend of today (spec:app-redesign#REQ-007). */
export function WorkingNow() {
	const { t, lang } = useI18n();
	const stopGate = useRights().gate("runs.start");
	const { openRef } = useShell();
	const keys = new Set(useMyItems().map((i) => i.key));
	const live = (useRuns().data ?? []).filter(
		(r) => keys.has(r.key) && (r.lane === "working" || r.lane === "needs_you"),
	);
	const { cancel } = useRunActions();
	const { error, run } = useGuard();
	// Every AI tool on this computer, as the menu bar panel shows it.
	const spend = useDailySpend(TREND_DAYS);
	return (
		<>
			<Panel
				title={t.home.workingNow}
				count={live.length}
				flush
				toolbar={
					<span className="flex items-center gap-2">
						<Sparkline values={spend.series.map((p) => p.usd)} className="h-5 w-16" />
						<Badge className="font-mono">
							<span className="sr-only">{t.ui.spendToday} </span>
							{new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(
								spend.today,
							)}
						</Badge>
					</span>
				}
			>
				{live.length === 0 ? <p className="px-3 py-3 text-n-10">{t.shell.runsNone}</p> : null}
				{live.map((r) => (
					<div
						key={r.id}
						className="flex min-h-control items-center gap-2 border-b px-3 last:border-b-0"
					>
						<StatusDot status={RUN_STATUS[r.state]} label={t.factory.state[r.state]} />
						<RefChip refId={`run:${r.id}`} state="resolved" onOpen={openRef} />
						<span className="font-mono text-12 text-n-11">{r.key}</span>
						<Link {...runHref(r.id)} className="min-w-0 flex-1 truncate text-ui hover:underline">
							{r.title}
						</Link>
						<ConfirmButton
							variant="ghost"
							className="min-h-control"
							{...stopGate}
							confirm={format(t.factory.machine.confirmStop, { name: r.key })}
							onConfirm={() => void run(() => cancel(r.id))}
						>
							{format(t.factory.machine.stop, { name: r.key })}
						</ConfirmButton>
					</div>
				))}
			</Panel>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}
