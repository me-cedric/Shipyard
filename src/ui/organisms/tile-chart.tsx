import { type Status, StatusDot } from "../atoms/status-dot";

/** The chart kinds of a tile (`spec:library-functions#REQ-008`). Each reads the same rows: a name and a count. */
export const CHARTS = ["number", "bars", "line", "list", "stages", "spend", "health"] as const;
export type Chart = (typeof CHARTS)[number];

/**
 * The chart that a tile shows when its person picked none: the data kind picks it.
 * shortcut: mirrors `default_chart` of `crates/shipyard-core/src/tile.rs`; change both together.
 */
export function defaultChart(kind: string): Chart {
	switch (kind) {
		case "work":
		case "tracker-status":
			return "stages";
		case "impact":
			return "list";
		case "estimates":
			return "spend";
		case "quality":
			return "health";
		case "tracker-open":
			return "number";
		default:
			return "bars";
	}
}

/** The tone of a row of a health tile, from the words of its name. */
function tone(name: string): Status {
	const n = name.toLowerCase();
	if (/(fail|error|stuck|block|reject|cancel)/.test(n)) return "danger";
	if (/(wait|open|review|pending|draft|stale|paused)/.test(n)) return "warning";
	if (/(done|pass|ok|merged|accepted|answered|closed|resolved|ready|clean)/.test(n))
		return "success";
	return "idle";
}

const num = (n: string | undefined) => Number(n) || 0;

/** One chart of a tile body. `names` has the name of each chart, for the accessible name. */
export function TileChart({
	chart,
	title,
	rows,
	names,
	barsName,
}: {
	chart: Chart;
	title: string;
	rows: string[][];
	names: Record<Chart, string>;
	/** The accessible name of the bars: the label that the tile always had. */
	barsName: string;
}) {
	const counts = rows.map((r) => num(r[1]));
	const total = counts.reduce((a, b) => a + b, 0);
	const max = Math.max(1, ...counts);
	const name = (c: Chart) => `${title}, ${names[c]}`;
	if (chart === "number")
		return (
			<p
				data-chart="number"
				role="img"
				aria-label={`${title}, ${total}`}
				className="m-auto text-48 font-semibold text-n-12"
			>
				{total}
			</p>
		);
	if (chart === "line") {
		const n = counts.length;
		const at = (i: number, v: number) =>
			`${n < 2 ? 50 : (i / (n - 1)) * 100},${38 - (v / max) * 34}`;
		return (
			<svg
				data-chart="line"
				role="img"
				aria-label={name("line")}
				viewBox="0 0 100 40"
				preserveAspectRatio="none"
				className="h-full min-h-16 w-full text-accent"
			>
				<polyline
					points={counts.map((v, i) => at(i, v)).join(" ")}
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					vectorEffect="non-scaling-stroke"
				/>
				{counts.map((v, i) => {
					const [cx, cy] = at(i, v).split(",");
					return <circle key={rows[i]?.[0] ?? i} cx={cx} cy={cy} r="1.5" fill="currentColor" />;
				})}
			</svg>
		);
	}
	if (chart === "list")
		return (
			<ul data-chart="list" aria-label={name("list")} className="flex flex-col gap-1.5 text-13">
				{rows.map(([label, n]) => (
					<li key={label} className="flex items-center gap-2">
						<span className="min-w-0 flex-1 truncate text-n-12">{label}</span>
						<span className="font-semibold text-n-12">{n}</span>
					</li>
				))}
			</ul>
		);
	if (chart === "stages")
		return (
			<ol
				data-chart="stages"
				aria-label={name("stages")}
				className="flex flex-wrap items-stretch gap-2 text-13"
			>
				{rows.map(([label, n]) => (
					<li
						key={label}
						className="flex min-w-16 flex-col rounded-md bg-n-4 px-3 py-2 not-last:after:hidden"
					>
						<span className="text-17 font-semibold text-n-12">{n}</span>
						<span className="truncate text-n-10">{label}</span>
					</li>
				))}
			</ol>
		);
	if (chart === "spend")
		return (
			<div data-chart="spend" className="flex flex-col gap-2 text-13">
				<span
					role="img"
					aria-label={`${name("spend")}: ${total}`}
					className="flex h-3 overflow-hidden rounded-full bg-n-4"
				>
					{counts.map((v, i) => (
						<span
							key={rows[i]?.[0] ?? i}
							className="h-3 bg-accent"
							style={{ width: `${(v / Math.max(total, 1)) * 100}%`, opacity: 1 - (i % 4) * 0.2 }}
						/>
					))}
				</span>
				<ul aria-label={name("spend")} className="flex flex-col gap-1">
					{rows.map(([label, n]) => (
						<li key={label} className="flex items-center gap-2">
							<span className="min-w-0 flex-1 truncate text-n-10">{label}</span>
							<span className="font-semibold text-n-12">{n}</span>
						</li>
					))}
				</ul>
			</div>
		);
	if (chart === "health")
		return (
			<ul data-chart="health" aria-label={name("health")} className="flex flex-col gap-1.5 text-13">
				{rows.map(([label = "", n]) => (
					<li key={label} className="flex items-center gap-2">
						<StatusDot status={tone(label)} label={label} />
						<span className="min-w-0 flex-1 truncate text-n-12">{label}</span>
						<span className="font-semibold text-n-12">{n}</span>
					</li>
				))}
			</ul>
		);
	return (
		<ul data-chart="bars" aria-label={barsName} className="flex flex-col gap-2 text-13">
			{rows.map(([label, n]) => (
				<li key={label} className="flex items-center gap-2">
					<span className="w-28 shrink-0 truncate text-n-10">{label}</span>
					<span aria-hidden="true" className="h-2 flex-1 rounded-full bg-n-4">
						<span
							className="block h-2 rounded-full bg-accent"
							style={{ width: `${(num(n) / max) * 100}%` }}
						/>
					</span>
					<span className="w-8 text-right font-semibold text-n-12">{n}</span>
				</li>
			))}
		</ul>
	);
}
