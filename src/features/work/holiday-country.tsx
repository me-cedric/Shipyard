import { useI18n } from "@/lib/i18n";
import { useCalendar, useWorkActions } from "@/lib/work";
import { Select } from "@/ui/atoms/select";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { useGuard } from "./guard";

/** The countries of `crates/shipyard-core/src/holidays.rs`. France is the default. */
export const COUNTRIES = ["FR", "BE", "LU", "CH", "DE", "NL", "ES", "IT", "GB", "US"] as const;
const NONE = "@@none";

/** The country names in the language of the person. */
export function useCountryItems() {
	const { t, lang } = useI18n();
	const names = new Intl.DisplayNames([lang], { type: "region" });
	return [
		...COUNTRIES.map((c) => ({ value: c, label: names.of(c) ?? c })),
		{ value: NONE, label: t.costing.plan.none },
	];
}

/** The country of the public holidays of the plan. The plan computes them each year. */
export function HolidayCountry({ row }: { row?: boolean }) {
	const { t } = useI18n();
	const cal = useCalendar().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const items = useCountryItems();
	if (!cal) return null;
	const select = (
		<Select
			caption={!row}
			label={t.costing.plan.country}
			value={cal.country || NONE}
			onValueChange={(v) =>
				void run(() => act.saveCalendar({ ...cal, country: v === NONE ? "" : v }))
			}
			items={items}
		/>
	);
	return (
		<>
			{row ? <SettingsRow label={t.costing.plan.country}>{select}</SettingsRow> : select}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}
