/** What one row of the history draws: the lane of its dot and the lanes that run through it. */
export type GraphRow = {
	/** The column of the dot. */
	lane: number;
	/** The columns with a line in this row. The dot's own column is in it when a line meets the dot. */
	through: number[];
	/** The number of columns that the log needs up to this row. */
	width: number;
};

/**
 * The lanes of a log, newest first, from the parents of each commit. A
 * lane waits for the commit that it expects next. The first parent keeps the lane of its child. A
 * merge opens a lane for each other parent that no lane waits for.
 * shortcut: a merge draws no diagonal, only its lanes. Add the curves when a design asks for them.
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
		// Other lanes that waited for this commit end here: they join the dot.
		for (let i = 0; i < waiting.length; i++)
			if (i !== lane && waiting[i] === c.sha) waiting[i] = null;
		waiting[lane] = c.parents[0] ?? null;
		for (const p of c.parents.slice(1)) {
			if (waiting.includes(p)) continue;
			const free = waiting.indexOf(null);
			if (free < 0) waiting.push(p);
			else waiting[free] = p;
		}
		const meets = incoming || waiting[lane] !== null;
		return {
			lane,
			through: meets ? [...through, lane].sort((a, b) => a - b) : through,
			width: waiting.length,
		};
	});
}
