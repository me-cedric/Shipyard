/** A figure with its name: the day count, the price. The figure is in the mono face. */
export function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-24 flex-col gap-0.5">
			<dt className="text-12 text-n-11">{label}</dt>
			<dd className="font-mono text-16">{value}</dd>
		</div>
	);
}
