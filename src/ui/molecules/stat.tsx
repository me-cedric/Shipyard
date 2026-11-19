/** A figure with its name: the day count, the price. */
export function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-24 flex-col gap-0.5">
			<dt className="text-13 text-n-11">{label}</dt>
			<dd className="text-20 font-semibold text-n-12">{value}</dd>
		</div>
	);
}
