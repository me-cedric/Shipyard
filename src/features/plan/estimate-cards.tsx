import { format, useI18n } from "@/lib/i18n";
import {
	figure,
	type Member,
	monthLabel,
	type Portfolio,
	type Seal,
	type SheetView,
	usePlan,
	useTeam,
} from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";

const TITLE = "text-13 font-semibold text-n-11";
const H2 = "text-17 font-semibold";

/** The days of each feature of a sheet, in the order of the sheet. */
export const featureDays = (view: SheetView) =>
	view.sheet.features.map((f) => ({
		id: f.id,
		name: f.name,
		days: f.tasks.reduce((n, x) => n + (view.days[x.id] ?? 0), 0),
	}));

/** The first name of a person. */
export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/**
 * The days that the plan of a sheet gives to each person. The key is the handle; the empty key
 * holds the days of the tasks with no member.
 */
export function usePersonDays(slug: string): { members: Member[]; days: Map<string, number> } {
	const members = useTeam().data?.team.members ?? [];
	const days = new Map<string, number>();
	const bars = usePlan(slug).data?.gantt.bars ?? [];
	for (const b of bars) days.set(b.member ?? "", (days.get(b.member ?? "") ?? 0) + (b.days ?? 0));
	return { members, days };
}

/** The card "Split": one bar with a part for each feature, and the days of each feature. */
export function SplitCard({ view }: { view: SheetView }) {
	const { t, lang } = useI18n();
	const parts = featureDays(view).filter((f) => f.days > 0);
	if (parts.length === 0) return null;
	return (
		<Card pad className="flex flex-col gap-3.5">
			<h2 className={TITLE}>{t.costing.estimate.split}</h2>
			<div
				role="img"
				aria-label={parts.map((f) => `${f.name} ${figure(f.days, lang)}`).join(", ")}
				className="flex h-7 gap-1"
			>
				{parts.map((f, at) => (
					<span
						key={f.id}
						className="rounded-sm bg-accent"
						// Each part is lighter than the one before it.
						style={{ flex: f.days, opacity: 1 - (at * 0.6) / parts.length }}
					/>
				))}
			</div>
			<div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
				{parts.map((f) => (
					<span key={f.id}>
						<span className="font-semibold">{figure(f.days, lang)}</span> {f.name}
					</span>
				))}
			</div>
		</Card>
	);
}

/** The card "By person": the days that the plan gives to each person, the most first. */
export function PersonCard({ slug }: { slug: string }) {
	const { t, lang } = useI18n();
	const p = t.costing.estimate;
	const { members, days } = usePersonDays(slug);
	const rows = [...days]
		.filter(([, n]) => n > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([handle, n]) => ({
			handle,
			n,
			name: members.find((m) => m.handle === handle)?.name ?? t.work.plan.unstaffed,
		}));
	if (rows.length === 0) return null;
	return (
		<Card pad className="flex flex-col gap-3.5">
			<h2 className={TITLE}>{p.byPerson}</h2>
			{rows.map((r) => (
				<div key={r.handle} className="flex items-center gap-3">
					<Avatar name={r.name} />
					<span className="font-semibold">{firstName(r.name)}</span>
					<span className="ml-auto">{format(p.daysCount, { days: figure(r.n, lang) })}</span>
				</div>
			))}
		</Card>
	);
}

/**
 * Summary, Spread and Portfolio on one page (Plan / Estimates). It shows days only: the amounts
 * are in Costing.
 */
export function SheetsView({
	view,
	seal,
	portfolio,
	project,
	names,
}: {
	view: SheetView;
	seal: Seal | undefined;
	portfolio: Portfolio | undefined;
	/** The name of the project. */
	project: string;
	/** The name of each sheet, by slug. */
	names: Map<string, string>;
}) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const p = t.costing.estimate;
	const days = (n: number | null | undefined) => format(p.daysCount, { days: figure(n, lang) });
	const features = featureDays(view).sort((a, b) => b.days - a.days);
	const max = Math.max(1, ...features.map((f) => f.days));
	const top = Math.max(1, ...view.spread.map((m) => m.days ?? 0));
	return (
		<div className="flex flex-col gap-6 px-4 pb-10">
			<div className="flex flex-wrap items-start gap-6">
				<Card pad className="flex flex-[1_1_380px] flex-col gap-2">
					<h2 className={`${H2} pb-1.5`}>{e.views.summary}</h2>
					{features.map((f) => (
						<div key={f.id} className="flex min-h-13 items-center gap-3.5">
							<span className="w-38 shrink-0 truncate font-semibold">{f.name}</span>
							<span role="img" aria-label={days(f.days)} className="min-w-0 flex-1">
								<span
									className="block h-7 rounded-sm bg-accent"
									style={{ width: `${(f.days / max) * 100}%` }}
								/>
							</span>
							<span className="w-18 shrink-0 text-right font-semibold">{days(f.days)}</span>
						</div>
					))}
					<div className="flex min-h-13 items-center gap-3.5 border-t border-n-6">
						<span className="flex-1 font-semibold">{p.all}</span>
						<span className="font-semibold">{days(view.totals.days)}</span>
					</div>
					<Badge className="self-start">{seal?.sealed ? p.open : p.notSealed}</Badge>
				</Card>
				<Card pad className="flex flex-[1_1_380px] flex-col gap-3.5">
					<h2 className={H2}>{e.views.spread}</h2>
					<div
						role="img"
						aria-label={`${p.spreadLabel}: ${view.spread
							.map((m) => `${monthLabel(m.month, lang)} ${days(m.days)}`)
							.join(", ")}`}
						className="grid h-38 items-end gap-2.5"
						style={{ gridTemplateColumns: `repeat(${view.spread.length || 1}, minmax(0, 1fr))` }}
					>
						{view.spread.map((m) => (
							<div key={m.month} className="flex h-full flex-col gap-1.5 text-center">
								<span className="flex min-h-0 flex-1 items-end">
									<span
										className="block w-full rounded-t-sm bg-accent/40"
										style={{ height: `${((m.days ?? 0) / top) * 100}%` }}
									/>
								</span>
								<span className={TITLE}>{monthLabel(m.month, lang)}</span>
							</div>
						))}
					</div>
				</Card>
			</div>
			{portfolio ? (
				<Card className="py-2">
					<h2 className={`${H2} px-6 pt-3.5 pb-1.5`}>{e.views.portfolio}</h2>
					{portfolio.sheets.map(([slug, totals]) => (
						<Row key={slug}>
							<span className="flex-[1_1_200px] font-semibold">{project}</span>
							<Badge variant={slug === view.slug ? "accent" : "neutral"}>
								{names.get(slug) ?? slug}
							</Badge>
							<span className="w-24 text-right font-semibold">{days(totals.days)}</span>
						</Row>
					))}
					<Row>
						<span className="flex-1 font-semibold">{p.all}</span>
						<span className="font-semibold">{days(portfolio.total.days)}</span>
					</Row>
				</Card>
			) : null}
		</div>
	);
}
