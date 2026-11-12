/** The address of a run page, as router link props. `unit` is the step that the Workflow tab shows. */
export const runHref = (id: string, unit?: string) => ({
	to: "/factory/runs/$runId" as const,
	params: { runId: id },
	search: unit ? { unit } : {},
});

/** The run page of a ref: `run:<id>`, or `run:<id>/<step>` for a unit. Any other ref gives undefined. */
export function runOfRef(ref: string) {
	const m = /^run:([^/]+)(?:\/(.+))?$/.exec(ref);
	return m?.[1] ? runHref(m[1], m[2]) : undefined;
}
