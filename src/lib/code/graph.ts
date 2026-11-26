/** What one row of the history draws: the lane of its dot and the lanes that run through it. */
export type GraphRow = {
	/** The column of the dot. */
	lane: number;
	/** The columns with a line in this row. The dot's own column is in it when a line meets the dot. */
	through: number[];
	/** The number of columns that the log needs up to this row. */
	width: number;
	/** A line comes down to the dot from the row above. */
	top: boolean;
	/** A line leaves the dot for the first parent. */
	bottom: boolean;
	/** The lanes that end at this commit: each one curves into the dot from above. */
	joins: number[];
	/** The lanes of the other parents of a merge: each one curves out of the dot. */
	forks: number[];
	/** The lanes that run past this row and do not touch the dot. */
	pass: number[];
};

/**
 * The lanes of a log, newest first, from the parents of each commit. A
 * lane waits for the commit that it expects next. The first parent keeps the lane of its child. A
 * merge opens a lane for each other parent that no lane waits for.
 * `joins` and `forks` give the curves: a lane that ends at a commit, and a parent line that leaves a merge.
 */
export function graph(commits: { sha: string; parents: string[] }[]): GraphRow[] {
	const waiting: (string | null)[] = [];
	return commits.map((c) => {
		let lane = waiting.indexOf(c.sha);
		const incoming = lane >= 0;
		if (!incoming) {
			lane = waiting.indexOf(null);
			if (lane < 0) lane = waiting.length;
		}
		const through = waiting.flatMap((w, i) => (w !== null && i !== lane ? [i] : []));
		const joins = waiting.flatMap((w, i) => (w === c.sha && i !== lane ? [i] : []));
		const pass = through.filter((i) => !joins.includes(i));
		// Other lanes that waited for this commit end here: they join the dot.
		for (const i of joins) waiting[i] = null;
		waiting[lane] = c.parents[0] ?? null;
		const forks: number[] = [];
		for (const p of c.parents.slice(1)) {
			let to = waiting.indexOf(p);
			if (to < 0) {
				to = waiting.indexOf(null);
				if (to < 0) to = waiting.length;
				waiting[to] = p;
			}
			if (to !== lane) forks.push(to);
		}
		const bottom = waiting[lane] !== null;
		const meets = incoming || bottom;
		return {
			lane,
			through: meets ? [...through, lane].sort((a, b) => a - b) : through,
			width: waiting.length,
			top: incoming,
			bottom,
			joins,
			forks,
			pass,
		};
	});
}
