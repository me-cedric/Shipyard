// The mock of the compass setup commands. It mirrors `crates/shipyard-app/src/extensions/compass_setup.rs`:
// an external source is off, current, in drift or edited; a refresh syncs the drift and keeps the
// edits; a reinstall puts the edited files back; an objective switches on the assets that fit.
import type {
	CompassApplied,
	ExternalSource,
	Objective,
	ObjectiveApplied,
	WriteReport,
} from "./bindings";

type Asset = { key: string; on: boolean; available: boolean; recommended: boolean };

export type MockCompassSetup = {
	sources: ExternalSource[];
	assets: Asset[];
	/** True when the project has `.agents/compass.json`. */
	installed: boolean;
};

const VERSION = "1.0.2";

const OBJECTIVES: [string, string[]][] = [
	["recommended", []],
	["quality", ["skill:review", "skill:ci-triage", "skill:debug", "pack:security", "pack:e2e"]],
	["specs", ["skill:spec-flow", "skill:task-flow", "skill:grill", "upstream:mattpocock"]],
	["architecture", ["skill:adr", "skill:architecture-advisor", "skill:impact-analysis"]],
	["frontend", ["skill:ui-conformance", "upstream:taste", "mcp:playwright"]],
	["mobile", ["skill:native-mobile-skills", "upstream:expo"]],
	["devops", ["pack:ci-github", "pack:env", "upstream:devops-security", "mcp:kubernetes"]],
];

const source = (
	id: string,
	more: Partial<ExternalSource> & Pick<ExternalSource, "state">,
): ExternalSource => ({
	id,
	description: `${more.skills?.length ?? 1} skills, MIT licence`,
	recommended: false,
	available: true,
	skills: [id],
	changed: [],
	edited: [],
	...more,
});

export function seedCompassSetup(): MockCompassSetup {
	const asset = (key: string, on: boolean, available = true, recommended = false): Asset => ({
		key,
		on,
		available,
		recommended,
	});
	return {
		installed: true,
		sources: [
			source("taste", {
				state: "drift",
				recommended: true,
				skills: ["taste-skill"],
				changed: [".claude/skills/taste-skill/SKILL.md"],
			}),
			source("mattpocock", {
				state: "edited",
				recommended: true,
				skills: ["grill-me", "grilling"],
				edited: [".agents/skills/grill-me/SKILL.md"],
			}),
			source("devops-security", { state: "off", skills: ["kubernetes-ops", "helm-charts"] }),
			source("expo", { state: "off", available: false, skills: ["expo-app"] }),
		],
		assets: [
			asset("skill:review", true, true, true),
			asset("skill:debug", false, true, true),
			asset("skill:ci-triage", false, true, true),
			asset("skill:spec-flow", true, true, true),
			asset("skill:task-flow", true, true, true),
			asset("skill:grill", true, true, true),
			asset("skill:adr", true, true, true),
			asset("skill:architecture-advisor", true, true, true),
			asset("skill:impact-analysis", false, true, true),
			asset("skill:ui-conformance", false, true, true),
			asset("skill:native-mobile-skills", false, false),
			asset("pack:security", true, true, true),
			asset("pack:e2e", true, true, true),
			asset("pack:ci-github", false),
			asset("pack:env", false, false),
			asset("upstream:taste", true, true, true),
			asset("upstream:mattpocock", true, true, true),
			asset("upstream:devops-security", false),
			asset("upstream:expo", false, false),
			asset("mcp:playwright", true, true, true),
			asset("mcp:kubernetes", false),
		],
	};
}

const click = (ok: boolean) => {
	if (!ok) throw "this change needs the click of a person";
};

const applied = (report: WriteReport): CompassApplied => ({ report, version: VERSION });

export const compassExternal = (m: MockCompassSetup) => m.sources;

/** A sync: the drift is written, the edited files stay. */
export function compassExternalRefresh(m: MockCompassSetup, ok: boolean): CompassApplied {
	click(ok);
	const report: WriteReport = { written: [], kept: [] };
	for (const s of m.sources.filter((x) => x.state !== "off")) {
		report.written.push(...s.changed);
		report.kept.push(...s.edited);
		s.changed = [];
		s.state = s.edited.length ? "edited" : "current";
	}
	return applied(report);
}

export function compassExternalReinstall(
	m: MockCompassSetup,
	id: string,
	ok: boolean,
): CompassApplied {
	click(ok);
	const s = m.sources.find((x) => x.id === id);
	if (!s) throw `unknown entry: ${id}`;
	if (!s.available) throw `the asset upstream:${id} is not available`;
	const written = [...s.changed, ...s.edited];
	if (s.state === "off") written.push(...s.skills.map((k) => `.agents/skills/${k}/SKILL.md`));
	Object.assign(s, { changed: [], edited: [], state: "current" });
	return applied({ written, kept: [] });
}

export function compassContractInstall(m: MockCompassSetup, ok: boolean): CompassApplied {
	click(ok);
	// With settings the call is a sync: the edited contract stays.
	const was = m.installed;
	m.installed = true;
	return was
		? applied({ written: [], kept: ["AGENTS.md"] })
		: applied({ written: [".agents/compass.json", "AGENTS.md", "CLAUDE.md"], kept: [] });
}

export function compassObjectives(m: MockCompassSetup): Objective[] {
	const find = (k: string) => m.assets.find((a) => a.key === k);
	return OBJECTIVES.map(([id, keys]) => {
		const assets = keys.length
			? keys
			: m.assets.filter((a) => a.recommended && a.available).map((a) => a.key);
		return {
			id,
			assets,
			on: assets.filter((k) => find(k)?.on),
			unavailable: assets.filter((k) => !find(k)?.available),
		};
	});
}

export function compassObjectiveApply(
	m: MockCompassSetup,
	id: string,
	ok: boolean,
): ObjectiveApplied {
	click(ok);
	const goal = compassObjectives(m).find((o) => o.id === id);
	if (!goal) throw `unknown entry: ${id}`;
	const written: string[] = [];
	for (const k of goal.assets.filter(
		(k) => !goal.on.includes(k) && !goal.unavailable.includes(k),
	)) {
		const a = m.assets.find((x) => x.key === k);
		if (a) a.on = true;
		written.push(`.agents/${k.replace(":", "/")}`);
	}
	return { report: { written, kept: [] }, skipped: goal.unavailable };
}
