import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { SealCard } from "@/features/work/seal";
import { ProfileTable } from "@/features/work/sheet-menu";
import { useUsage } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { Totals } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { figure, money, type Portfolio, type Seal, type SheetView } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { buttonVariants } from "@/ui/atoms/button";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";
import { DataTable } from "@/ui/organisms/data-table";
import { firstName, useDays, usePersonDays } from "./estimate-cards";

const NAME = "flex-[1_1_200px] font-medium";
const TABLE = "flex min-h-48 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1";

type Month = { month: string; days: number | null; cost: number | null };
type Lot = { name: string } & Totals;

/**
 * Costing (Plan / Estimates): what the people and the agents of a sheet cost, the money of the
 * sheet and the seal. An amount shows only with the right `costs.view`. A day rate comes from the
 * team file, which gives none while the seal is locked.
 */
export function CostingView({
	view,
	seal,
	portfolio,
	names,
	amounts: more,
	onSheet,
}: {
	view: SheetView;
	seal: Seal | undefined;
	portfolio: Portfolio | undefined;
	/** The name of each sheet, by slug. */
	names: Map<string, string>;
	/** The tables of the other amounts show (the item "More amounts" of the menu of the page). */
	amounts: boolean;
	/** Opens the page that edits the margin and the currency. */
	onSheet: () => void;
}) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const p = t.costing.estimate;
	const costs = useRights().can("costs.view");
	const { members, days } = usePersonDays(view.slug);
	const usage = useUsage().data;
	const daysText = useDays();
	const { sheet, totals } = view;
	const currency = sheet.currency ?? "EUR";
	const frozen = sheet.frozen === true;
	const cash = (n: number | null | undefined) => money(costs ? n : null, currency, lang);
	// A sheet whose roles all lack a rate costs nothing only because no rate shows: say so, not 0.
	const unrated = costs && totals.unrated.length > 0 && !totals.cost;
	const priced = (n: number | null) =>
		!costs ? "—" : unrated ? e.unrated : money(n, currency, lang);
	const rate =
		!costs || sheet.marginRate == null ? "—" : `${figure(sheet.marginRate * 100, lang)} %`;
	const spend = (usage?.days ?? []).reduce((n, d) => n + (d.usd ?? 0), 0);
	const people = [...members].sort((a, b) => (days.get(b.handle) ?? 0) - (days.get(a.handle) ?? 0));
	const amountColumns = (["cost", "price", "margin"] as const).map(
		(k): ColumnDef<Lot> => ({
			id: k,
			header: k === "margin" ? e.marginAmount : e[k],
			meta: { width: "9rem", numeric: true },
			cell: ({ row }) => cash(row.original[k]),
		}),
	);
	const dayCol = <T extends { days: number | null }>(): ColumnDef<T> => ({
		id: "days",
		header: e.days,
		meta: { width: "7rem", numeric: true },
		cell: ({ row }) => figure(row.original.days, lang),
	});

	return (
		<div className="flex flex-wrap items-start gap-6 px-4 pb-10">
			<div className="flex min-w-0 flex-[3_1_520px] flex-col gap-6">
				<Card className="overflow-x-auto py-2">
					<div className="min-w-160">
						{people.map((m) => {
							const name = firstName(m.name);
							const to = (label: string, text: string, width = "max-w-32") => (
								<Link
									to="/crew/crew"
									search={{ member: m.handle } as never}
									aria-label={`${format(label, { name })}: ${text}`}
									className={cn(buttonVariants(), width, "min-w-0 truncate px-3.5")}
								>
									{text}
								</Link>
							);
							return (
								<Row key={m.handle} className="flex-nowrap">
									<span className={`flex items-center gap-3 ${NAME}`}>
										<Avatar name={m.name} />
										{name}
									</span>
									<span className="w-24 shrink-0 text-right text-n-11">
										{daysText(days.get(m.handle) ?? 0)}
									</span>
									{costs
										? to(
												p.rateOf,
												m.dayRate == null
													? e.unrated
													: format(p.perDay, { rate: money(m.dayRate, currency, lang) }),
											)
										: null}
									{to(p.capacityOf, format(p.perWeek, { days: figure(m.capacity, lang) }))}
									{m.skills.length > 0 ? to(p.skillsOf, m.skills.join(", "), "max-w-40") : null}
								</Row>
							);
						})}
						<Row>
							<span className={`flex items-center gap-3 ${NAME}`}>
								<Avatar name={p.agents} agent />
								{p.agents}
							</span>
							<span className="text-n-11">${spend.toFixed(2)}</span>
							<Link to="/crew/spend" className={buttonVariants()}>
								{p.spend}
							</Link>
						</Row>
					</div>
				</Card>
				{more ? (
					<>
						<div className={TABLE}>
							<DataTable<Month>
								label={e.views.spread}
								data={view.spread}
								columns={[
									{
										id: "month",
										header: e.month,
										meta: { width: "12rem" },
										cell: ({ row }) => row.original.month,
									},
									dayCol(),
									{
										id: "cost",
										header: e.cost,
										meta: { width: "9rem", numeric: true },
										cell: ({ row }) => cash(row.original.cost),
									},
								]}
								rowId={(r) => r.month}
								footer={[e.total, figure(totals.days, lang), cash(totals.cost)]}
							/>
						</div>
						<ProfileTable slug={view.slug} currency={currency} />
						{portfolio ? (
							// shortcut: one currency for the portfolio, the one of the chosen sheet. Mixed currencies need a rate.
							<div className={TABLE}>
								<DataTable<Lot>
									label={e.views.portfolio}
									data={portfolio.sheets.map(([slug, tt]) => ({
										name: names.get(slug) ?? slug,
										...tt,
									}))}
									columns={[
										{
											id: "name",
											header: e.sheet,
											meta: { width: "12rem" },
											cell: ({ row }) => row.original.name,
										},
										dayCol(),
										...amountColumns,
									]}
									rowId={(r) => r.name}
									footer={[
										e.total,
										figure(portfolio.total.days, lang),
										cash(portfolio.total.cost),
										cash(portfolio.total.price),
										cash(portfolio.total.margin),
									]}
								/>
							</div>
						) : null}
						<ProfileTable slug={null} currency={currency} />
					</>
				) : null}
			</div>
			<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-6">
				<Card className="py-2">
					<Row>
						<span className={NAME}>{e.cost}</span>
						{unrated ? (
							// The rates are set in Crew.
							<Link to="/crew/crew" className="text-17 font-semibold text-accent-text underline">
								{e.unrated}
							</Link>
						) : (
							<span className="text-17 font-semibold">{priced(totals.cost)}</span>
						)}
					</Row>
					<Row>
						<span className={NAME}>{e.marginAmount}</span>
						{unrated ? null : <span className="text-n-11">{priced(totals.margin)}</span>}
						<RightButton
							right="work.edit"
							disabled={frozen}
							aria-label={`${e.margin}: ${rate}`}
							onClick={onSheet}
						>
							{rate}
						</RightButton>
					</Row>
					<Row>
						<span className={NAME}>{e.price}</span>
						<span className="text-30 font-semibold">{priced(totals.price)}</span>
					</Row>
					<Row>
						<span className={NAME}>{e.currency}</span>
						<RightButton
							right="work.edit"
							disabled={frozen}
							aria-label={`${e.currency}: ${currency}`}
							onClick={onSheet}
						>
							{currency}
						</RightButton>
					</Row>
				</Card>
				{seal ? <SealCard state={seal} /> : null}
			</div>
		</div>
	);
}
