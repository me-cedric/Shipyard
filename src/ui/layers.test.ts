// Atomic design (`spec:design-system#REQ-005`): a layer imports only the layers under it, and no
// shared part imports a feature. The order: tokens, atoms, molecules, organisms, templates.
const LAYERS = ["tokens", "atoms", "molecules", "organisms", "templates"];

const sources = import.meta.glob(
	"/src/ui/{tokens,atoms,molecules,organisms,templates}/**/*.{ts,tsx}",
	{
		query: "?raw",
		import: "default",
		eager: true,
	},
) as Record<string, string>;

describe("atomic layers", () => {
	it("imports no higher layer and no feature", () => {
		const faults: string[] = [];
		let files = 0;
		for (const [path, text] of Object.entries(sources)) {
			if (path.includes(".test.")) continue;
			files += 1;
			const own = LAYERS.indexOf(path.split("/")[3] ?? "");
			for (const [, target] of text.matchAll(/from "([^"]+)"/g)) {
				if (!target) continue;
				if (target.startsWith("@/features")) faults.push(`${path} imports ${target}`);
				const layer = /^(?:@\/ui|\.\.)\/(\w+)\//.exec(target)?.[1];
				if (layer && LAYERS.indexOf(layer) > own) faults.push(`${path} imports ${target}`);
			}
		}
		expect(files).toBeGreaterThan(100);
		expect(faults).toEqual([]);
	});
});
