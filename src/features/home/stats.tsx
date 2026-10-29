import { useCounts } from "@/features/shell";
import { useUsage } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { useMyItems } from "./my-work";

const TREND_DAYS = 14;

/** The four figures of Home: needs you, my items, live runs and the spend of today with its trend. */
export function HomeStats() {
	const { t, lang } = useI18n();
	const { needsYou, live } = useCounts();
	const mine = useMyItems().length;
	// Newest day first, keyed by the UTC day.
	const days = useUsage().data?.days ?? [];
	const today = new Date().toISOString().slice(0, 10);
	const spend = days.find((d) => d.key === today)?.usd ?? 0;
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	return (
		<StatStrip
			className="px-4"
			items={[
				{ label: t.home.needsYou, value: String(needsYou) },
				{ label: t.ui.myItems, value: String(mine) },
				{ label: t.shell.runs, value: String(live) },
				{
					label: t.ui.spendToday,
					value: money.format(spend),
					trend: days
						.slice(0, TREND_DAYS)
						.reverse()
						.map((d) => d.usd ?? 0),
				},
			]}
		/>
	);
}
