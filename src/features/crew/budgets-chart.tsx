import { useState } from "react";
import { group } from "@/features/factory/usage/machine-usage";
import { useMachineSpend } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Segmented } from "@/ui/atoms/segmented";
import { Card } from "@/ui/molecules/card";

type By = "day" | "runner" | "model" | "project";
const DAY = 86_400_000;
const BARS = 7;

/** The spend of this computer in the last 30 days, grouped (picture 083). */
export function SpendChart({ prices }: { prices: boolean }) {
	const { t, lang } = useI18n();
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
	const total = rows.reduce((n, r) => n + (r.costUsd ?? 0), 0);
	const lines =
		by === "day"
			? Array.from({ length: BARS }, (_, i) =>
					new Date(Date.now() - (BARS - 1 - i) * DAY).toISOString().slice(0, 10),
				).map((d) => group(rows, "day").find((l) => l.name === d) ?? { name: d, tokens: 0, usd: 0 })
			: group(rows, by).slice(0, BARS);
	const max = Math.max(...lines.map((l) => l.usd), 0.01);
	const label = (name: string) =>
		by === "day"
			? new Date(`${name}T00:00:00Z`).toLocaleDateString(lang, {
					day: "numeric",
					month: "short",
					timeZone: "UTC",
				})
			: by === "runner"
				? runnerName(name)
				: name;
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
			<div role="img" aria-label={s.spendBy} className="flex h-50 items-end gap-3 pt-6">
				{lines.map((l) => (
					<div
						key={l.name}
						title={`${label(l.name)}: ${amount(l.usd)}`}
						style={{ height: `${Math.max(2, (l.usd / max) * 100)}%` }}
						className="min-w-0 flex-1 rounded-t-md bg-accent/45"
					/>
				))}
			</div>
			<div
				aria-hidden="true"
				className="flex justify-between gap-3 text-13 font-semibold text-n-11"
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
