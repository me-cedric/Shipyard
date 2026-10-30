// Mock only. The client exports and the outside terminal launcher. They apply the rules of
// `crates/shipyard-app/src/reports.rs` and `terminals.rs`: a click, the read-only lock for a file in
// the project, the checks of the path, the refs and the period, and the number of a change request.
import type { ChangeRequestOut, ExportText, TerminalApp } from "./bindings";
import { checkExport, checkTitles } from "./mock-knowledge";

export type ExportKind =
	| "dossier-complete"
	| "costing"
	| "flows"
	| "raid"
	| "schedule"
	| "gantt"
	| "security"
	| "work-done";

export type MockReports = {
	exported: { kind: ExportKind; path: string }[];
	/** The ids that the change request command wrote, in order. */
	changeRequests: string[];
	/** The terminal starts: the app and the folder. */
	launched: { id: string; folder: string }[];
	/** The apps that are "installed" on this mock machine. */
	installed: TerminalApp[];
};

export const seedReports = (): MockReports => ({
	exported: [],
	changeRequests: [],
	launched: [],
	installed: [
		{ id: "apple-terminal", label: "Terminal" },
		{ id: "iterm2", label: "iTerm2" },
		{ id: "kitty", label: "kitty" },
	],
});

/** The ids of the table of `terminals.rs`. */
const KNOWN = [
	"apple-terminal",
	"iterm2",
	"warp",
	"ghostty",
	"wezterm",
	"kitty",
	"alacritty",
	"windows-terminal",
	"powershell",
];

export type Env = {
	/** The folder of the active project. */
	root: string;
	readOnly: boolean;
};

function needClick(click: boolean) {
	if (!click) throw "this change needs the click of a person";
}

/** A file in the project is a project write: the read-only lock applies. */
function write(env: Env, path: string, click: boolean) {
	needClick(click);
	if (env.readOnly && path.startsWith(`${env.root}/`))
		throw "the profile of this project is read only";
}

function file(
	r: MockReports,
	env: Env,
	kind: ExportKind,
	ext: string,
	path: string,
	click: boolean,
) {
	write(env, path, click);
	checkExport(path, ext);
	r.exported.push({ kind, path });
	return null;
}

export const exportDossierComplete = (
	r: MockReports,
	env: Env,
	text: ExportText,
	path: string,
	click: boolean,
) => {
	checkTitles(text, 7);
	return file(r, env, "dossier-complete", "docx", path, click);
};

export const exportPage = (
	r: MockReports,
	env: Env,
	kind: "costing" | "flows" | "raid" | "security",
	path: string,
	click: boolean,
) => file(r, env, kind, "xlsx", path, click);

/** `knownSlug` is the check of the plan: an unknown sheet fails as the real plan does. */
export function exportPlan(
	r: MockReports,
	env: Env,
	kind: "schedule" | "gantt",
	knownSlug: () => void,
	path: string,
	click: boolean,
) {
	write(env, path, click);
	knownSlug();
	return file(r, env, kind, kind === "gantt" ? "svg" : "xlsx", path, click);
}

const checkRef = (ref: string) => {
	const t = ref.trim();
	if (!t || t.length > 200 || t.startsWith("-")) throw `\`${t}\` is not a ref`;
	return t;
};

/** A real date: `2026-02-30` is not one. */
const isDay = (s: string) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return false;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return d.toISOString().slice(0, 10) === s;
};

export function exportWorkDone(
	r: MockReports,
	env: Env,
	base: string,
	head: string,
	from: string,
	to: string,
	path: string,
	click: boolean,
) {
	checkRef(base);
	checkRef(head);
	if (!isDay(from) || !isDay(to) || from > to)
		throw "the period needs two dates, `YYYY-MM-DD`, and the end not before the start";
	return file(r, env, "work-done", "xlsx", path, click);
}

export function exportChangeRequest(
	r: MockReports,
	env: Env,
	title: string,
	base: string,
	head: string,
	click: boolean,
): ChangeRequestOut {
	needClick(click);
	if (env.readOnly) throw "the profile of this project is read only";
	checkRef(base);
	checkRef(head);
	const t = title.trim().replace(/\s+/g, " ");
	if (!t || t.length > 200) throw "the title needs 1 to 200 characters";
	const id = `CR-${String(r.changeRequests.length + 1).padStart(3, "0")}`;
	r.changeRequests.push(id);
	const stem = `docs/delivery/change-requests/${id}`;
	return { id, markdown: `${stem}.md`, docx: `${stem}.docx` };
}

export const terminalApps = (r: MockReports) => r.installed;

/** The path is resolved: `..` cannot leave the project. */
function inside(root: string, folder: string) {
	const f = folder.trim();
	const parts = (f.startsWith("/") ? f : `${root}/${f}`).split("/");
	const out: string[] = [];
	for (const p of parts) {
		if (p === "" || p === ".") continue;
		if (p === "..") out.pop();
		else out.push(p);
	}
	const full = `/${out.join("/")}`;
	if (full !== root && !full.startsWith(`${root}/`))
		throw `${folder} is not a folder of the project`;
}

export function terminalLaunch(
	r: MockReports,
	env: Env,
	chosen: string,
	folder: string,
	click: boolean,
) {
	needClick(click);
	inside(env.root, folder);
	const id = chosen || r.installed[0]?.id;
	if (!id) throw "no terminal app was found on this machine";
	if (!KNOWN.includes(id)) throw `unknown terminal app: ${id}`;
	const app = r.installed.find((a) => a.id === id);
	if (!app) throw `the terminal app is not installed: ${id}`;
	r.launched.push({ id, folder });
	return null;
}
