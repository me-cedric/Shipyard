import { Link } from "@tanstack/react-router";
import { useInbox } from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/ui/atoms/button";
import { AttentionCard } from "@/ui/molecules/attention-card";

/**
 * The reminder when no time is logged today, with the action that opens the time page. Nothing when
 * time is logged (spec:app-redesign#REQ-009). Today shows the slim card of picture 001; `alert`
 * is the row at the top of the role panels (picture 092).
 */
export function TimeReminder({ alert }: { alert?: boolean }) {
	const { t } = useI18n();
	if (!useInbox().timesheet) return null;
	return alert ? (
		<AttentionCard who={t.rights.today.you} title={t.rights.today.noTime}>
			<Link
				to="/plan/time"
				className={cn(buttonVariants({ variant: "primary" }), "min-h-control self-start")}
			>
				{t.home.logTime}
			</Link>
		</AttentionCard>
	) : (
		<section className="flex min-h-15 items-center gap-3 rounded-lg bg-surface-2 pr-2 pl-5 shadow-2">
			<span className="mr-auto text-n-11">{t.home.logToday}</span>
			<Link
				to="/plan/time"
				aria-label={t.home.logTime}
				className={cn(buttonVariants(), "min-h-control")}
			>
				{t.home.log}
			</Link>
		</section>
	);
}
