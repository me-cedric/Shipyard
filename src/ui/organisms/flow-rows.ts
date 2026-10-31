type CoreField = "source" | "destination" | "network" | "protocol" | "port" | "action";
/** Columns that show only when the caller names them in `labels`: the name, the bricks and the subnet. */
export type ExtraField = "name" | "sourceName" | "destinationName" | "subnet";
export type FlowField = CoreField | ExtraField;
export type FlowRow = { id: string } & Record<CoreField, string> &
	Partial<Record<ExtraField, string>>;
export type FlowFilter = { network: string; protocol: string; action: string; query: string };

/** The filter value that matches every row. */
export const ALL = "*";
export const NO_FILTER: FlowFilter = { network: ALL, protocol: ALL, action: ALL, query: "" };

/** The rows that match every filter. The text matches any field, ignoring case. */
export function filterFlows(rows: FlowRow[], f: FlowFilter): FlowRow[] {
	const q = f.query.trim().toLowerCase();
	return rows.filter(
		(r) =>
			(f.network === ALL || r.network === f.network) &&
			(f.protocol === ALL || r.protocol === f.protocol) &&
			(f.action === ALL || r.action === f.action) &&
			(!q ||
				[
					r.source,
					r.destination,
					r.network,
					r.protocol,
					r.port,
					r.action,
					r.name,
					r.sourceName,
					r.destinationName,
					r.subnet,
				].some((v) => v?.toLowerCase().includes(q))),
	);
}

/** The distinct values of one field, in order of first use. */
export const distinct = (rows: FlowRow[], field: FlowField): string[] => [
	...new Set(rows.map((r) => r[field] ?? "").filter(Boolean)),
];
