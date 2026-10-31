// The mock of the Code commands. It keeps one small working copy in memory and applies the same
// rules as the Rust commands: staged files only in a commit, the summary rule, the branch name
// rule, a switch that names the files it would overwrite.
import type {
	BlameLine,
	Branch_Serialize,
	Changes_Serialize,
	CommitDetail_Serialize,
	CommitInfo,
	ConflictFile,
	DiffSide,
	FactorySend_Serialize,
	FileChange_Serialize,
	FileDiff,
	FileView,
	LogPage,
	MergeOutcome,
	PullOutcome,
	RebaseOutcome,
	Resolution,
	Stash,
	WatchNotice_Serialize,
} from "./bindings";

type MockFile = { head: string | null; index: string | null; work: string | null };
type Commit = { info: CommitInfo; changes: Record<string, [string | null, string | null]> };

export type MockCode = {
	branch: string;
	/** Each local branch: its log, newest first, and the files that it changes. */
	branches: Record<string, { log: string[]; touches: string[] }>;
	remoteBranches: string[];
	files: Record<string, MockFile>;
	commits: Record<string, Commit>;
	stashes: { id: string; message: string; files: Record<string, MockFile> }[];
	conflicts: ConflictFile[];
	/** A merge is in progress: the person resolves the conflicts or aborts it. */
	merging: boolean;
	/** A rebase is in progress: the person resolves the conflicts and continues, or aborts it. */
	rebasing: boolean;
	notice: WatchNotice_Serialize | null;
	/** Minutes between two fetches of the project (default 15, 1 to 1440). */
	watchMinutes: number;
	/** The paths that a delete moved to the system trash. Nothing is removed for good. */
	trash: string[];
	counter: number;
};

const TYPES = ["feat", "fix", "chore", "docs", "refactor", "test"];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TYPE_LIST = `type: ${TYPES.join(", ")}`;

const commit = (n: number, summary: string, changes: Commit["changes"]): Commit => {
	const sha = `${String(n).padStart(7, "0")}${"a".repeat(33)}`;
	return {
		info: {
			sha,
			short: sha.slice(0, 7),
			summary,
			description: "",
			author_name: "Ada Lovelace",
			author_email: "ada@example.com",
			time: 1_760_000_000 + n * 3600,
			parents: [],
			labels: [],
		},
		changes,
	};
};

/** A fresh working copy: one file of each kind of change, three commits and two branches. */
export function seedCode(): MockCode {
	const log = [
		commit(3, "fix(auth): refuse an empty token", { "src/app.ts": ["a\nb\n", "a\nb\nc\n"] }),
		commit(2, "feat(api): add the health route", { "src/lib/util.ts": [null, "x\n"] }),
		commit(1, "chore: first commit", {
			"docs/guide.md": [null, "g\n"],
			"src/app.ts": [null, "a\nb\n"],
		}),
	];
	const commits = Object.fromEntries(log.map((c) => [c.info.sha, c]));
	const [c3, c2, c1] = log.map((c) => c.info);
	if (!(c3 && c2 && c1)) throw new Error("seed");
	c3.parents = [c2.sha];
	c2.parents = [c1.sha];
	c3.labels = [
		{ name: "main", kind: "branch" },
		{ name: "origin/main", kind: "remote" },
	];
	return {
		branch: "main",
		branches: {
			main: { log: [c3.sha, c2.sha, c1.sha], touches: [] },
			"feat/auth/login": { log: [c2.sha, c1.sha], touches: ["src/app.ts"] },
		},
		remoteBranches: ["origin/main"],
		files: {
			"src/app.ts": { head: "a\nb\nc\n", index: "a\nb\nc\n", work: "a\nB\nc\n" },
			"src/lib/util.ts": { head: "x\n", index: "x\ny\n", work: "x\ny\nz\n" },
			"docs/guide.md": { head: "g\n", index: "g\n", work: "g2\n" },
			"README.md": { head: null, index: null, work: "# Readme\n" },
		},
		commits,
		stashes: [],
		conflicts: [],
		merging: false,
		rebasing: false,
		notice: null,
		watchMinutes: 15,
		trash: [],
		counter: 4,
	};
}

/** The lines of a text. A missing text has none. */
const lines = (t: string | null) => (t === null ? [] : t.replace(/\n$/, "").split("\n"));

/** A unified diff with one hunk: the common start and end are context. */
export function unifiedDiff(path: string, a: string | null, b: string | null): string {
	const x = lines(a);
	const y = lines(b);
	let start = 0;
	while (start < x.length && start < y.length && x[start] === y[start]) start++;
	let end = 0;
	while (end < x.length - start && end < y.length - start && x.at(-1 - end) === y.at(-1 - end))
		end++;
	const from = Math.max(0, start - 3);
	const tail = Math.min(end, 3);
	const body = [
		...x.slice(from, start).map((l) => ` ${l}`),
		...x.slice(start, x.length - end).map((l) => `-${l}`),
		...y.slice(start, y.length - end).map((l) => `+${l}`),
		...x.slice(x.length - end, x.length - end + tail).map((l) => ` ${l}`),
	];
	const old = x.length - end + tail - from;
	const now = y.length - end + tail - from;
	return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -${from + 1},${old} +${from + 1},${now} @@\n${body.join("\n")}\n`;
}

const within = (path: string, scope: string[]) =>
	scope.some((p) => path === p || path.startsWith(`${p}/`));

const inHead = (f: MockFile) => f.head !== null || f.index !== null;

export function codeStatus(c: MockCode): Changes_Serialize {
	const all = Object.entries(c.files).sort(([a], [b]) => a.localeCompare(b));
	const make = (path: string, state: FileChange_Serialize["state"]): FileChange_Serialize => ({
		path,
		old_path: null,
		state,
	});
	const conflicted = c.conflicts.map((k) => make(k.path, "conflicted"));
	const skip = new Set(conflicted.map((f) => f.path));
	return {
		branch: c.branch,
		head: c.branches[c.branch]?.log[0] ?? null,
		upstream: c.branch === "main" ? "origin/main" : null,
		ahead: 0,
		behind: 0,
		staged: all
			.filter(([p, f]) => f.index !== f.head && !skip.has(p))
			.map(([p, f]) =>
				make(p, f.head === null ? "added" : f.index === null ? "deleted" : "modified"),
			),
		unstaged: all
			.filter(([p, f]) => inHead(f) && f.work !== f.index && !skip.has(p))
			.map(([p, f]) => make(p, f.work === null ? "deleted" : "modified")),
		untracked: all
			.filter(([, f]) => !inHead(f) && f.work !== null)
			.map(([p]) => make(p, "untracked")),
		conflicted,
		merging: c.merging,
		rebasing: c.rebasing,
	};
}

export function codeDiff(c: MockCode, path: string, side: DiffSide): FileDiff {
	const f = c.files[path];
	if (!f) return { path, text: "", binary: false, truncated: false };
	const text =
		side === "staged"
			? f.index === f.head
				? ""
				: unifiedDiff(path, f.head, f.index)
			: f.work === f.index
				? ""
				: unifiedDiff(path, f.index, f.work);
	return { path, text, binary: false, truncated: false };
}

/** A file for the viewer: the working copy, or at a commit (else the head). Same path rule as Rust. */
export function codeFileRead(c: MockCode, path: string, rev: string | null): FileView {
	if (!path || path.startsWith("/") || path.split("/").includes(".."))
		throw `not a path inside the project: ${path}`;
	const f = c.files[path];
	const at = rev ? c.commits[rev] : undefined;
	const text = rev ? (at ? (at.changes[path]?.[1] ?? null) : (f?.head ?? null)) : (f?.work ?? null);
	if (text === null) throw `no such file: ${path}`;
	return { path, size: text.length, binary: false, truncated: false, text };
}

/** The files of the working copy for the file drawer, sorted by path, like Rust `code_file_list`. */
export const codeFileList = (c: MockCode): string[] =>
	Object.entries(c.files)
		.filter(([, f]) => f.work !== null)
		.map(([p]) => p)
		.sort();

/** The path rule of Rust `files::resolve`: inside the project, never `.git`, one `Normal` part at least. */
function filePath(path: string): string {
	const parts = path.trim().split("/");
	if (
		parts.some((p) => !p || p === "." || p === ".." || p.toLowerCase() === ".git") ||
		path.startsWith("/")
	)
		throw `${path} is not a path of the project`;
	return parts.join("/");
}

/** The four actions of the file drawer. Each needs a click; the caller checks the read-only lock. */
export function filesAction(
	c: MockCode,
	click: boolean,
	kind: "file" | "folder" | "rename" | "delete",
	path: string,
	to = "",
) {
	if (!click) throw "this change needs the click of a person";
	const p = filePath(path);
	const family = Object.keys(c.files).filter((f) => f === p || f.startsWith(`${p}/`));
	if (kind === "file" || kind === "folder") {
		if (family.length) throw `${p} already exists`;
		if (kind === "file") c.files[p] = { head: null, index: null, work: "" };
		return;
	}
	if (!family.length) throw `${p} does not exist`;
	if (kind === "delete") {
		for (const f of family) delete c.files[f];
		c.trash.push(p);
		return;
	}
	const dst = filePath(to);
	if (Object.keys(c.files).some((f) => f === dst || f.startsWith(`${dst}/`)))
		throw `${dst} already exists`;
	if (dst.startsWith(`${p}/`)) throw "a folder does not move into itself";
	for (const f of family) {
		const file = c.files[f];
		if (!file) continue;
		delete c.files[f];
		c.files[dst + f.slice(p.length)] = file;
	}
}

export function codeWatchIntervalSet(c: MockCode, minutes: number): number {
	if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
		throw "the interval is 1 to 1440 minutes";
	c.watchMinutes = minutes;
	return minutes;
}

export function codeStage(c: MockCode, paths: string[]) {
	for (const [p, f] of Object.entries(c.files)) {
		if (!within(p, paths)) continue;
		f.index = f.work;
		if (f.index === null && f.head === null) delete c.files[p];
	}
}

export function codeUnstage(c: MockCode, paths: string[]) {
	for (const [p, f] of Object.entries(c.files)) if (within(p, paths)) f.index = f.head;
}

export function codeDiscard(c: MockCode, paths: string[], untracked: boolean) {
	for (const [p, f] of Object.entries(c.files)) {
		if (!within(p, paths)) continue;
		if (inHead(f)) f.work = f.index;
		else if (untracked) delete c.files[p];
	}
}

/** The summary rule of `shipyard-core`: `<type>(<scope>): <subject>`. */
function checkSummary(summary: string) {
	const s = summary.trim();
	if (!s) throw "the summary is empty";
	const m = /^([a-z]+)(?:\(([^)]*)\))?:(.*)$/.exec(s);
	if (!(m?.[1] && TYPES.includes(m[1])) || m[2]?.trim() === "")
		throw `the summary must be \`<type>(<scope>): <subject>\`, ${TYPE_LIST}`;
	if (!m[3]?.trim()) throw "the subject is empty";
}

export function codeCommit(c: MockCode, summary: string, description: string): string {
	checkSummary(summary);
	if (c.conflicts.length) throw `conflicts in: ${c.conflicts.map((k) => k.path).join(", ")}`;
	const changes: Commit["changes"] = {};
	for (const [p, f] of Object.entries(c.files))
		if (f.index !== f.head) changes[p] = [f.head, f.index];
	if (!Object.keys(changes).length) throw "nothing is staged";
	const made = commit(c.counter++, summary.trim(), changes);
	made.info.description = description.trim();
	const branch = c.branches[c.branch];
	if (!branch) throw "HEAD is detached";
	made.info.parents = branch.log.slice(0, 1);
	// The branch label moves from the old tip to the new commit.
	const old = c.commits[branch.log[0] ?? ""]?.info;
	if (old) old.labels = old.labels.filter((l) => l.name !== c.branch);
	made.info.labels = [{ name: c.branch, kind: "branch" }];
	c.commits[made.info.sha] = made;
	branch.log.unshift(made.info.sha);
	branch.touches.push(...Object.keys(changes));
	c.merging = false;
	for (const [p, f] of Object.entries(c.files)) {
		f.head = f.index;
		if (f.head === null && f.work === null) delete c.files[p];
	}
	return made.info.sha;
}

export function codeLog(c: MockCode, skip: number, limit: number): LogPage {
	const all = c.branches[c.branch]?.log ?? [];
	const page = all.slice(skip, skip + limit);
	return {
		commits: page.map((s) => c.commits[s]?.info).filter((i): i is CommitInfo => i !== undefined),
		has_more: all.length > skip + limit,
	};
}

const commitOf = (c: MockCode, sha: string) => {
	const k = c.commits[sha];
	if (!k) throw `bad commit id: ${sha}`;
	return k;
};

export function codeCommitDetail(c: MockCode, sha: string): CommitDetail_Serialize {
	const k = commitOf(c, sha);
	return {
		info: k.info,
		files: Object.entries(k.changes).map(([path, [a, b]]) => ({
			path,
			old_path: null,
			state: a === null ? "added" : b === null ? "deleted" : "modified",
		})),
	};
}

export function codeCommitDiff(c: MockCode, sha: string, path: string): FileDiff {
	const [a, b] = commitOf(c, sha).changes[path] ?? [null, null];
	return { path, text: unifiedDiff(path, a, b), binary: false, truncated: false };
}

export function codeBranches(c: MockCode): Branch_Serialize[] {
	const tip = (name: string) => c.branches[name]?.log[0] ?? "";
	return [
		...Object.keys(c.branches).map(
			(name): Branch_Serialize => ({
				name,
				kind: "local",
				is_head: name === c.branch,
				upstream: c.remoteBranches.includes(`origin/${name}`) ? `origin/${name}` : null,
				ahead: 0,
				behind: 0,
				tip: tip(name),
			}),
		),
		...c.remoteBranches.map(
			(name): Branch_Serialize => ({
				name,
				kind: "remote",
				is_head: false,
				upstream: null,
				ahead: 0,
				behind: 0,
				tip: tip("main"),
			}),
		),
	];
}

export function codeBranchCreate(c: MockCode, name: string) {
	const [type, area, subject, extra] = name.split("/");
	if (
		!(type && TYPES.includes(type) && area && KEBAB.test(area) && subject && KEBAB.test(subject)) ||
		extra !== undefined
	)
		throw `the branch must be \`<type>/<area>/<kebab>\`, ${TYPE_LIST}`;
	if (c.branches[name]) throw `branch already exists: ${name}`;
	const from = c.branches[c.branch];
	c.branches[name] = { log: [...(from?.log ?? [])], touches: [] };
	c.branch = name;
}

export function codeBranchSwitch(c: MockCode, name: string) {
	if (c.merging) throw "the repository is busy with a merge";
	const target =
		c.branches[name] ?? (c.remoteBranches.includes(name) ? c.branches.main : undefined);
	if (!target) throw `branch not found: ${name}`;
	const local = c.branches[name] ? name : (name.split("/").slice(1).join("/") ?? name);
	const dirty = Object.entries(c.files)
		.filter(
			([p, f]) =>
				inHead(f) && (f.work !== f.head || f.index !== f.head) && target.touches.includes(p),
		)
		.map(([p]) => p);
	if (dirty.length) throw `uncommitted changes would be overwritten: ${dirty.join(", ")}`;
	if (!c.branches[local]) c.branches[local] = { log: [...target.log], touches: [] };
	c.branch = local;
}

/** The rules of `conflict_to_factory`: a click, a conflict, a label `wf:<id>`. */
export function conflictToFactory(
	c: MockCode,
	workflow: string,
	click: boolean,
): FactorySend_Serialize {
	if (!click) throw "this change needs the click of a person";
	if (!c.conflicts.length) throw "no file is in conflict";
	return {
		item: {
			reference: "doc:conflict/merge",
			action: "create",
			key: "SHIP-200",
			error: null,
			skipped: [],
		},
		label: `wf:${workflow}`,
	};
}

/** The rules of `Repo::merge_branch`: no tracked change, fast-forward, a merge commit, or conflicts. */
export function codeBranchMerge(c: MockCode, name: string): MergeOutcome {
	if (c.merging) throw "the repository is busy with a merge";
	const dirty = Object.entries(c.files)
		.filter(([, f]) => inHead(f) && (f.work !== f.head || f.index !== f.head))
		.map(([p]) => p);
	if (dirty.length) throw `uncommitted changes would be overwritten: ${dirty.join(", ")}`;
	const ours = c.branches[c.branch];
	const theirs =
		c.branches[name] ?? (c.remoteBranches.includes(name) ? c.branches.main : undefined);
	if (!(ours && theirs)) throw `branch not found: ${name}`;
	if (theirs.log.every((sha) => ours.log.includes(sha))) return "up-to-date";
	if (ours.log.every((sha) => theirs.log.includes(sha))) {
		ours.log = [...theirs.log];
		ours.touches.push(...theirs.touches);
		return "fast-forwarded";
	}
	const clash = [...new Set(theirs.touches)].filter((p) => ours.touches.includes(p));
	if (clash.length) {
		c.merging = true;
		c.conflicts = clash.map((path) => ({
			path,
			text: true,
			segments: [
				{ kind: "text", text: "a\n" },
				{ kind: "block", ours: "ours\n", base: "base\n", theirs: "theirs\n" },
			],
		}));
		return { conflicts: clash };
	}
	const made = commit(c.counter++, `Merge branch '${name}' into ${c.branch}`, {});
	made.info.parents = [ours.log[0] ?? "", theirs.log[0] ?? ""];
	made.info.labels = [{ name: c.branch, kind: "branch" }];
	c.commits[made.info.sha] = made;
	ours.log = [made.info.sha, ...new Set([...ours.log, ...theirs.log])];
	ours.touches.push(...theirs.touches);
	return { merged: made.info.sha };
}

export function codeMergeAbort(c: MockCode) {
	if (!c.merging) throw "git: no merge is in progress";
	c.merging = false;
	c.conflicts = [];
}

/** The rules of `Repo::rebase_branch`: no tracked change, up to date, done, or conflicts. */
export function codeBranchRebase(c: MockCode, name: string): RebaseOutcome {
	if (c.merging || c.rebasing) throw "the repository is busy with a merge";
	const dirty = Object.entries(c.files)
		.filter(([, f]) => inHead(f) && (f.work !== f.head || f.index !== f.head))
		.map(([p]) => p);
	if (dirty.length) throw `uncommitted changes would be overwritten: ${dirty.join(", ")}`;
	const ours = c.branches[c.branch];
	const theirs =
		c.branches[name] ?? (c.remoteBranches.includes(name) ? c.branches.main : undefined);
	if (!(ours && theirs)) throw `branch not found: ${name}`;
	if (theirs.log.every((sha) => ours.log.includes(sha))) return "up-to-date";
	const clash = [...new Set(theirs.touches)].filter((p) => ours.touches.includes(p));
	if (clash.length) {
		c.rebasing = true;
		c.conflicts = clash.map((path) => ({
			path,
			text: true,
			segments: [{ kind: "block", ours: "ours\n", base: "base\n", theirs: "theirs\n" }],
		}));
		return { conflicts: clash };
	}
	return rebased(c, ours, theirs);
}

function rebased(
	c: MockCode,
	ours: MockCode["branches"][string],
	theirs: MockCode["branches"][string],
): RebaseOutcome {
	const own = ours.log.filter((sha) => !theirs.log.includes(sha));
	ours.log = [...own, ...theirs.log];
	ours.touches.push(...theirs.touches);
	c.rebasing = false;
	return "done";
}

export function codeRebaseContinue(c: MockCode): RebaseOutcome {
	if (!c.rebasing) throw "git: no rebase is in progress";
	if (c.conflicts.length) throw `conflicts: ${c.conflicts.map((f) => f.path).join(", ")}`;
	const ours = c.branches[c.branch];
	if (!ours) throw "no branch";
	c.rebasing = false;
	return "done";
}

export function codeRebaseAbort(c: MockCode) {
	if (!c.rebasing) throw "git: no rebase is in progress";
	c.rebasing = false;
	c.conflicts = [];
}

/** One line per line of the file. The head commit of the branch is the author of every line. */
export function codeBlame(c: MockCode, path: string): BlameLine[] {
	const f = c.files[path];
	if (!(f && inHead(f))) throw `git: ${path} is not in HEAD`;
	const sha = c.branches[c.branch]?.log[0] ?? "";
	const info = c.commits[sha]?.info;
	return (f.head ?? "")
		.split("\n")
		.filter((_, i, a) => i < a.length - 1 || a[i] !== "")
		.map((_, i) => ({
			line: i + 1,
			sha,
			author: info?.author_name ?? "",
			time: info?.time ?? 0,
		}));
}

export function codeBranchDelete(c: MockCode, name: string, force: boolean) {
	if (name === c.branch) throw `the working branch cannot be deleted: ${name}`;
	const branch = c.branches[name];
	if (!branch) throw `branch not found: ${name}`;
	const merged = branch.log.every((s) => c.branches.main?.log.includes(s));
	if (!(merged || force)) throw `the branch is not merged: ${name}`;
	delete c.branches[name];
}

export function codeStashPush(c: MockCode, message: string | null): string {
	const files = structuredClone(c.files);
	const id = `${c.counter++}`.padStart(40, "b");
	c.stashes.unshift({ id, message: message?.trim() || `WIP on ${c.branch}`, files });
	for (const [p, f] of Object.entries(c.files)) {
		if (inHead(f)) {
			f.index = f.head;
			f.work = f.head;
		} else delete c.files[p];
	}
	return id;
}

export const codeStashList = (c: MockCode): Stash[] =>
	c.stashes.map((s, index) => ({ index, message: s.message, id: s.id }));

export function codeStashApply(c: MockCode, index: number) {
	const s = c.stashes[index];
	if (!s) throw `stash not found: ${index}`;
	for (const [p, f] of Object.entries(s.files)) c.files[p] = { ...f, index: f.head };
}

export function codeStashDrop(c: MockCode, id: string) {
	const index = c.stashes.findIndex((s) => s.id === id);
	if (index < 0) throw `stash not found: ${id}`;
	c.stashes.splice(index, 1);
}

/** The resolved text of a file: each block takes its chosen side. */
export function codeResolve(c: MockCode, path: string, how: Resolution) {
	const k = c.conflicts.find((x) => x.path === path);
	if (!k) throw `not conflicted: ${path}`;
	let text = "";
	if (how.kind === "blocks") {
		const blocks = k.segments.filter((g) => g.kind === "block").length;
		if (how.choices.length !== blocks) throw `the file has ${blocks} blocks`;
		let i = 0;
		for (const g of k.segments) {
			if (g.kind === "text") text += g.text;
			else {
				const pick = how.choices[i++];
				if (pick === "ours" || pick === "both") text += g.ours;
				if (pick === "theirs" || pick === "both") text += g.theirs;
			}
		}
	} else if (how.kind === "whole") {
		for (const g of k.segments)
			text += g.kind === "text" ? g.text : how.side === "ours" ? g.ours : g.theirs;
	} else if (how.kind === "text") {
		if (/^(<<<<<<<|>>>>>>>)/m.test(how.text)) throw `${path} still holds a conflict marker`;
		text = how.text;
	} else text = "resolved by hand\n";
	const f = c.files[path] ?? { head: "", index: null, work: null };
	f.work = text;
	f.index = text;
	c.files[path] = f;
	c.conflicts = c.conflicts.filter((x) => x !== k);
}

export function codePull(c: MockCode): PullOutcome {
	const dirty = Object.entries(c.files).filter(
		([, f]) => inHead(f) && (f.work !== f.head || f.index !== f.head),
	);
	if (dirty.length)
		throw `uncommitted changes would be overwritten: ${dirty.map(([p]) => p).join(", ")}`;
	c.notice = null;
	return "up-to-date";
}

/** Publishes the working branch: it gets a remote branch and an upstream (REQ-014). */
export function codePush(c: MockCode) {
	const remote = `origin/${c.branch}`;
	if (!c.remoteBranches.includes(remote)) c.remoteBranches.push(remote);
}
