import { Link } from "@tanstack/react-router";
import { useInbox } from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/ui/atoms/button";
import { AttentionCard } from "@/ui/molecules/attention-card";

/** One card when no time is logged today, with the action that opens the time page. Nothing when time is logged (spec:app-redesign#REQ-009). */
export function TimeReminder() {
	const { t } = useI18n();
	if (!useInbox().timesheet) return null;
	return (
		<div className="px-4">
			<AttentionCard who={t.rights.today.you} title={t.rights.today.noTime}>
				<Link
					to="/plan/time"
					className={cn(buttonVariants({ variant: "primary" }), "min-h-control self-start")}
				>
					{t.home.timesheetOpen}
				</Link>
			</AttentionCard>
		</div>
	);
}
