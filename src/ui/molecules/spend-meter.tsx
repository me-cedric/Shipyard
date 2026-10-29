import { StatusDot } from "../atoms/status-dot";

type SpendStatus = "success" | "warning" | "danger";

/** Warning from 80 % of the budget, danger from 100 %. No budget: no status. */
export function spendStatus(usd: number, budget: number | null): SpendStatus | null {
	if (budget === null || budget <= 0) return null;
	return usd >= budget ? "danger" : usd >= budget * 0.8 ? "warning" : "success";
}

const BAR: Record<SpendStatus, string> = {
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
};

/** Spend against a budget: a bar, and a shape and colour for the status. */
export function SpendMeter({
	usd,
	budget,
	label,
}: {
	usd: number;
	budget: number | null;
	label: string;
}) {
	const status = spendStatus(usd, budget);
	if (status === null || budget === null) return null;
	return (
		<span className="flex items-center gap-2">
			{/* biome-ignore lint/a11y/useSemanticElements: a <meter> cannot take the bar colour of the status */}
			<span
				role="meter"
				aria-label={label}
				aria-valuemin={0}
				aria-valuemax={budget}
				aria-valuenow={usd}
				className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-n-4"
			>
				<span
					className={`block h-full ${BAR[status]}`}
					style={{ width: `${Math.min(100, (usd / budget) * 100)}%` }}
				/>
			</span>
			<StatusDot status={status} />
		</span>
	);
}
