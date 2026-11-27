import { useState } from "react";
import { group } from "@/features/factory/usage/machine-usage";
import { usePlainDay } from "@/features/plan/capacity";
import { useMachineSpend } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Segmented } from "@/ui/atoms/segmented";
import { Tooltip } from "@/ui/atoms/tooltip";
import { Card } from "@/ui/molecules/card";

type By = "day" | "runner" | "model" | "project";
const DAY = 86_400_000;
const BARS = 7;
const TICKS = 4;

/** Round ticks from 0 to a round top above `max`: 5 values. */
export function niceTicks(max: number): number[] {
	const raw = max / TICKS;
	const pow = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((v) => v >= raw * 0.999999) ?? pow * 10;
	return Array.from({ length: TICKS + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

/** The spend of this computer in the last 30 days, grouped (picture 083). */
export function SpendChart({ prices }: { prices: boolean }) {
	const { t } = useI18n();
	const plain = usePlainDay();
	const s = t.factory.spendPage;
	const names = {
		day: s.groupDay,
		runner: t.factory.runner,
		model: t.factory.model,
		project: s.groupProject,
	};
	const [by, setBy] = useState<By>("day");
	const spend = useMachineSpend(90);
	const since = new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10);
	const rows = ((spend.data ?? spend.partial)?.rows ?? []).filter((r) => r.day >= since);
	const lines =
		by === "day"
			? Array.from({ length: BARS }, (_, i) =>
					new Date(Date.now() - (BARS - 1 - i) * DAY).toISOString().slice(0, 10),
				).map((d) => group(rows, "day").find((l) => l.name === d) ?? { name: d, tokens: 0, usd: 0 })
			: group(rows, by).slice(0, BARS);
	// One period for every view: the 30 days.
	const total = rows.reduce((n, r) => n + (r.costUsd ?? 0), 0);
	// 0.04 at least: with no spend, each of the five ticks still shows its own cent.
	const ticks = niceTicks(Math.max(...lines.map((l) => l.usd), 0.04));
	const top = ticks[TICKS] ?? 1;
	const label = (name: string) =>
		by === "day" ? plain(name) : by === "runner" ? runnerName(name) : name;
	const amount = (usd: number) => (prices ? `$${usd.toFixed(2)}` : t.extras.usage.hidden);
	return (
		<Card pad className="flex flex-[3_1_30rem] flex-col gap-3.5">
			<div className="flex flex-wrap items-center gap-4">
				<span className="mr-auto text-44 font-semibold tracking-tight text-n-12">
					{amount(total)}
				</span>
				<div className="w-full max-w-sm">
					<Segmented
						label={s.groupBy}
						value={by}
						onValueChange={setBy}
						items={(Object.keys(names) as By[]).map((b) => ({ value: b, label: names[b] }))}
					/>
				</div>
			</div>
			<div className="flex h-50 gap-3 pt-6">
				<div aria-hidden="true" className="relative w-14 shrink-0 text-12 text-n-11">
					{ticks.map((v) => (
						<span
							key={v}
							style={{ bottom: `${(v / top) * 100}%` }}
							className="absolute right-0 translate-y-1/2 tabular-nums"
						>
							{prices ? amount(v) : ""}
						</span>
					))}
				</div>
				<ul aria-label={s.spendBy} className="relative m-0 flex min-w-0 flex-1 list-none gap-3 p-0">
					<li aria-hidden="true" className="pointer-events-none absolute inset-0">
						{ticks.map((v) => (
							<div
								key={v}
								style={{ bottom: `${(v / top) * 100}%` }}
								className="absolute inset-x-0 border-t border-n-5"
							/>
						))}
					</li>
					{lines.map((l) => {
						const text = `${label(l.name)}: ${amount(l.usd)}`;
						return (
							<li key={l.name} className="relative flex min-w-11 flex-1">
								<Tooltip label={text}>
									{/* A bar has no action: it takes the focus only so that the keyboard shows its amount. */}
									<span
										role="img"
										aria-label={text}
										// biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip of a bar needs the focus
										tabIndex={0}
										className="flex flex-1 items-end rounded-t-md"
									>
										<span
											style={{ height: `${Math.max(2, (l.usd / top) * 100)}%` }}
											className="w-full rounded-t-md bg-accent/45"
										/>
									</span>
								</Tooltip>
							</li>
						);
					})}
				</ul>
			</div>
			<div
				aria-hidden="true"
				className="flex justify-between gap-3 pl-17 text-13 font-semibold text-n-11"
			>
				{lines.map((l) => (
					<span
						key={l.name}
						className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate"
					>
						{by === "runner" ? <BrandIcon name={l.name} size={14} /> : null}
						<span className="truncate">{label(l.name)}</span>
					</span>
				))}
			</div>
		</Card>
	);
}
