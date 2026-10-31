// The mock of the W12 extras: pictures (`branding.rs`), the data folder (`window.rs`), Figma
// (`figma.rs`), the git extras (`commands/git_extra.rs`) and the live trace of the assistant.
import type {
	Branch_Serialize,
	DataFolder,
	DesignToken,
	FigmaFile,
	FigView_Serialize,
	FileDiff,
	Forward,
	Image,
	Inspect_Serialize,
	Picture,
	TraceStep,
} from "./bindings";
import { codeStashApply, codeStashDrop, type MockCode } from "./mock-code";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type MockExtras = {
	pictures: Partial<Record<Picture, Image>>;
	/** The keychain entry `conn:figma/token` is set. */
	figmaToken: boolean;
	/** How far each local branch lags behind its upstream. */
	behind: Record<string, number>;
	/** The tool calls of the running turn, by thread. */
	live: Record<string, TraceStep[]>;
	/** The mail addresses that the app opened. */
	mails: string[];
};

export const seedExtras = (): MockExtras => ({
	pictures: {},
	figmaToken: false,
	behind: {},
	live: {},
	mails: [],
});

const click = (ok: boolean) => {
	if (!ok) throw "this change needs the click of a person";
};

export const pictureGet = (m: MockExtras, which: Picture): Image | null =>
	m.pictures[which] ?? null;

/** A path ending in `.png` gives a PNG picture. Another file is refused. */
export function pictureSet(m: MockExtras, which: Picture, path: string | null, ok: boolean) {
	click(ok);
	if (path === null) {
		delete m.pictures[which];
		return null;
	}
	if (!path.startsWith("/")) throw "the path is not absolute";
	if (!/\.(png|jpe?g)$/i.test(path)) throw "the picture is not a PNG or a JPEG file";
	m.pictures[which] = { mime: "image/png", bytes: [...PNG, 1, 2, 3] };
	return null;
}

export const dataFolder = (): DataFolder => ({
	path: "/Users/ada/Library/Application Support/dev.shipyard.app",
	portable: false,
});

export function feedbackMail(m: MockExtras, title: string, details: string, ok: boolean) {
	if (!ok) throw "this action needs the click of a person";
	if (!title.trim() || /[\r\n]/.test(title))
		throw "the title must be one line of 120 characters or fewer";
	const url = `mailto:?subject=${encodeURIComponent(title.trim())}&body=${encodeURIComponent(details.trim())}`;
	m.mails.push(url);
	return url;
}

const NO_TOKEN = "no Figma token: add the token of your Figma account first";
const need = (m: MockExtras) => {
	if (!m.figmaToken) throw NO_TOKEN;
};

export function figmaTokenSet(m: MockExtras, token: string, ok: boolean) {
	click(ok);
	if (!token.trim()) throw "the value is empty";
	m.figmaToken = true;
	return null;
}

export function figmaFiles(m: MockExtras, project: string): FigmaFile[] {
	need(m);
	if (!/\d+\/?$/.test(project.trim())) throw "this is not a Figma project address";
	return [
		{ key: "AbC123", name: "Checkout", lastModified: "2026-10-20T10:00:00Z" },
		{ key: "XyZ789", name: "Onboarding", lastModified: "2026-10-12T08:30:00Z" },
	];
}

export function figmaPreview(m: MockExtras, _file: string): number[] {
	need(m);
	return [...PNG, 4, 5, 6];
}

export function figmaTokens(m: MockExtras, _file: string): DesignToken[] {
	need(m);
	return [
		{ name: "color/primary", kind: "color", value: "#3355ff" },
		{ name: "space/s", kind: "float", value: "4" },
	];
}

/** A `.fig` path gives its name and a preview. */
export const figView = (path: string): FigView_Serialize => ({
	name: path.replace(/^.*\//, "").replace(/\.fig$/i, ""),
	thumbnail: [...PNG, 7, 8],
});

export function stashPop(c: MockCode, id: string, ok: boolean) {
	click(ok);
	const index = c.stashes.findIndex((s) => s.id === id);
	if (index < 0) throw `git: stash not found: ${id}`;
	codeStashApply(c, index);
	codeStashDrop(c, id);
	return null;
}

export function stashDiff(c: MockCode, id: string): FileDiff[] {
	const s = c.stashes.find((x) => x.id === id);
	if (!s) throw `git: stash not found: ${id}`;
	return Object.entries(s.files)
		.filter(([, f]) => f.work !== f.head)
		.map(([path, f]) => ({
			path,
			text: `--- a/${path}\n+++ b/${path}\n-${f.head ?? ""}+${f.work ?? ""}`,
			binary: false,
			truncated: false,
		}));
}

export const withBehind = (m: MockExtras, rows: Branch_Serialize[]): Branch_Serialize[] =>
	rows.map((b) => (b.kind === "local" ? { ...b, behind: m.behind[b.name] ?? b.behind } : b));

export function fastForward(m: MockExtras, branch: string, ok: boolean): Forward {
	click(ok);
	if (!(branch in m.behind)) return "up-to-date";
	delete m.behind[branch];
	return "moved";
}

export function linkedInspect(
	children: { id: string; cloned: boolean }[],
	child: string,
): Inspect_Serialize {
	const c = children.find((x) => x.id === child);
	if (!c) throw `no linked project \`${child}\``;
	if (!c.cloned) throw "the linked project is not cloned yet";
	return {
		branch: "main",
		ahead: 0,
		behind: 2,
		changes: 1,
		stashes: 0,
		last: "chore: deploy compass",
	};
}

export const live = (m: MockExtras, thread: string): TraceStep[] => m.live[thread] ?? [];
