import { useCounts } from "@/features/shell";
import { useDailySpend } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useWorkItems } from "@/lib/sync";
import { useWorkContext } from "@/lib/work";
import { StatStrip } from "@/ui/molecules/stat-strip";

const TREND_DAYS = 14;

/** The mirrored items assigned to the person. */
export function useMyItems() {
	const me = useWorkContext().data?.me ?? null;
	return (useWorkItems({}).data ?? []).filter((i) => me !== null && i.member === me);
}

/** The four figures of Home: needs you, my items, live runs and the spend of today with its trend. */
export function HomeStats() {
	const { t, lang } = useI18n();
	const { needsYou, live } = useCounts();
	const mine = useMyItems().length;
	// Every AI tool on this computer, as the menu bar panel shows it.
	const spend = useDailySpend(TREND_DAYS);
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
					value: money.format(spend.today),
					trend: spend.series.map((d) => d.usd),
				},
			]}
		/>
	);
}
