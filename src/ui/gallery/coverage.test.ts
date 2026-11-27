// Each shared component has a row in the gallery, unless its file is listed here with the reason.
const NO_GALLERY_ROW: Record<string, string> = {
	"drawio-editor.tsx": "It embeds the draw.io page from the network.",
	"html-preview.tsx": "It draws a sandboxed frame: the accessibility test cannot read inside it.",
	"leave-guard.tsx": "It draws nothing: it blocks a route change and needs the router.",
	"picture-field.tsx": "It reads and writes the picture through the backend.",
	"menu-button.tsx:MenuList": "It needs an open Menu.Root; MenuButton has a row.",
	"library-page.tsx:LibraryBackLink":
		"It draws a router Link; LibraryPage has a row with a plain back link.",
};

const layers = import.meta.glob("/src/ui/{atoms,molecules,organisms,templates}/*.tsx", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

const gallery = Object.entries(
	import.meta.glob("/src/ui/gallery/*.tsx", {
		query: "?raw",
		import: "default",
		eager: true,
	}) as Record<string, string>,
)
	.filter(([path]) => !path.includes(".test."))
	.map(([, text]) => text)
	.join("\n");

describe("gallery coverage", () => {
	it("names each shared component in the gallery or in NO_GALLERY_ROW", () => {
		const missing: string[] = [];
		for (const [path, text] of Object.entries(layers)) {
			if (path.includes(".test.")) continue;
			const file = path.split("/").pop() ?? path;
			if (file in NO_GALLERY_ROW) continue; // a key is a file name, or `file:Component` for one part
			for (const [, name] of text.matchAll(/^export (?:function|const) ([A-Z][a-z]\w*)/gm)) {
				if (!name || `${file}:${name}` in NO_GALLERY_ROW) continue;
				if (!new RegExp(`\\b${name}\\b`).test(gallery)) missing.push(`${file}: ${name}`);
			}
		}
		expect(missing).toEqual([]);
	});
});
