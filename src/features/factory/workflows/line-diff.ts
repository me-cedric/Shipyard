/**
 * A unified diff of two texts, as one hunk of ` `, `-` and `+` lines. The lines come from the
 * longest common subsequence. It has no file header: `DiffView` reads from the first `@@`.
 */
export function lineDiff(from: string, to: string): string {
	const a = from === "" ? [] : from.split("\n");
	const b = to === "" ? [] : to.split("\n");
	const w = b.length + 1;
	// lcs[i * w + j]: the common length of a[i..] and b[j..].
	const lcs = new Array<number>((a.length + 1) * w).fill(0);
	const at = (i: number, j: number) => lcs[i * w + j] ?? 0;
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			lcs[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
	const out = [`@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@`];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			out.push(` ${a[i]}`);
			i++;
			j++;
		} else if (i < a.length && (j === b.length || at(i + 1, j) >= at(i, j + 1))) {
			out.push(`-${a[i++]}`);
		} else out.push(`+${b[j++]}`);
	}
	return out.join("\n");
}
