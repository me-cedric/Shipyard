import { type ReactNode, useRef, useState } from "react";
import { SectionCard } from "@/features/factory/section-card";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { useAutomation } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";

type Scope = "day" | "member";

/** The budgets of the project and the state of the form that sets one (factory REQ-032). */
export function useBudgets() {
	const { t } = useI18n();
	const f = t.factory;
	const automation = useAutomation().data?.automation.budgets;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const [editing, setEditing] = useState(false);
	const [scope, setScope] = useState<Scope>("day");
	const [key, setKey] = useState("");
	const [amount, setAmount] = useState("");
	const field = useRef<HTMLInputElement>(null);
	// The configured budgets: the default `*` once, then each key of its own.
	const list = (["day", "member"] as const).flatMap((scope) =>
		Object.entries(automation?.[scope] ?? {})
			.flatMap(([k, usd]) => (usd === null ? [] : [{ k, usd }]))
			.sort((a, b) => Number(b.k === "*") - Number(a.k === "*") || a.k.localeCompare(b.k))
			.map(({ k, usd }) => ({
				id: `${scope}:${k}`,
				scope,
				key: k,
				name: k === "*" ? (scope === "day" ? f.perDay : f.perMember) : k,
				budget: usd,
			})),
	);
	const set = () =>
		void run(async () => {
			const usd = amount.trim() === "" ? null : Number(amount);
			await writes.budget(scope, key.trim(), usd);
			setKey("");
			setAmount("");
		});
	/** Opens the form on one budget. */
	const edit = (scope: Scope, key: string, amount = "") => {
		setScope(scope);
		setKey(key);
		setAmount(amount);
		setEditing(true);
	};
	return {
		list,
		error,
		editing,
		setEditing,
		scope,
		setScope,
		key,
		setKey,
		amount,
		setAmount,
		field,
		set,
		edit,
	};
}

/**
 * The budgets (picture 083): one row for each budget with its amount and Edit, and the form that
 * sets one. The form shows when no budget is set or on Edit.
 */
export function Budgets({
	budgets: b,
	price,
}: {
	budgets: ReturnType<typeof useBudgets>;
	/** A price, hidden while the prices are off. */
	price: (text: string) => ReactNode;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const form = b.editing || b.list.length === 0;
	return (
		<SectionCard
			title={f.budgets}
			flush
			toolbar={
				b.list.length > 0 ? (
					<Button
						className="min-h-control"
						aria-expanded={form}
						onClick={() => b.setEditing(!b.editing)}
					>
						{f.edit}
					</Button>
				) : undefined
			}
		>
			{b.list.length > 0 ? (
				<ul aria-label={f.budget} className="flex flex-col text-ui">
					{b.list.map((x) => (
						<li
							key={x.id}
							className="flex min-h-control flex-wrap items-center gap-3 border-b px-3 py-1 last:border-b-0"
						>
							<span className="flex-1 text-n-12">{x.name}</span>
							<span className="font-mono">{price(`$${(x.budget ?? 0).toFixed(2)}`)}</span>
							<Button
								className="min-h-control"
								aria-label={`${f.edit} ${x.name}`}
								onClick={() => b.edit(x.scope, x.key, String(x.budget ?? ""))}
							>
								{f.edit}
							</Button>
						</li>
					))}
				</ul>
			) : null}
			{form ? (
				<div className="flex flex-wrap items-end gap-2 p-3">
					<Select
						caption
						label={f.budgetScope}
						className="min-h-control"
						items={[
							{ value: "day", label: f.perDay },
							{ value: "member", label: f.perMember },
						]}
						value={b.scope}
						onValueChange={(v) => b.setScope(v === "member" ? "member" : "day")}
					/>
					<Input
						ref={b.field}
						caption
						label={f.budgetKey}
						className="min-h-control w-48"
						value={b.key}
						onChange={(e) => b.setKey(e.target.value)}
					/>
					<Input
						caption
						label={f.budgetAmount}
						type="number"
						min="0"
						step="any"
						className="min-h-control w-28"
						value={b.amount}
						onChange={(e) => b.setAmount(e.target.value)}
					/>
					<RightButton
						right="project.settings"
						variant="primary"
						className="min-h-control"
						disabled={!b.key.trim()}
						onClick={b.set}
					>
						{f.setBudget}
					</RightButton>
				</div>
			) : null}
		</SectionCard>
	);
}
