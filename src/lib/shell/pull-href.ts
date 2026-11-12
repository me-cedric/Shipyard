/** The address of a pull request page, as router link props. `pr:github:44` gives the id `github-44`: a colon would show as `%3A`. */
export const pullHref = (reference: string) => ({
	to: "/code/pull-requests/$pullId" as const,
	params: { pullId: reference.replace(/^pr:/, "").replace(/:(\d+)$/, "-$1") },
	search: {},
});

/** The pull request page of a `pr:<connection>:<number>` ref. Any other ref gives undefined. */
export const pullOfRef = (ref: string) => (/^pr:.+:\d+$/.test(ref) ? pullHref(ref) : undefined);

/** The number of a pull request page id: the digits after the last dash. */
export const pullNumberOf = (pullId: string) => Number(pullId.slice(pullId.lastIndexOf("-") + 1));
