// The mock of the project creator (`crates/shipyard-app/src/creator.rs`). Same rules in a short form:
// a known stack, a valid member and remote, a preview that writes nothing, and starts that follow
// the connections of the plan. The registry and the connections live in `mock.ts`.
import type {
	Brief,
	CreatorOptions_Serialize,
	CreatorPreview_Serialize,
	NewProject_Deserialize,
	ProjectFile_Serialize,
	Row_Serialize,
} from "./bindings";

const GATES: Record<string, string[]> = {
	node: ["pnpm test", "pnpm lint"],
	rust: ["cargo test", "cargo clippy"],
	python: ["pytest"],
	java: ["mvn verify"],
	go: ["go test ./...", "go vet ./..."],
	other: [],
};
const IGNORE: Record<string, string[]> = {
	node: ["node_modules/", "dist/", "coverage/"],
	rust: ["target/"],
	python: ["__pycache__/", ".venv/", "*.pyc"],
	java: ["target/", "build/", ".gradle/"],
	go: ["bin/"],
	other: [],
};
const TECH: Record<string, string> = {
	node: "Node.js",
	rust: "Rust",
	python: "Python",
	java: "Java",
	go: "Go",
};
const LANGUAGES = ["en", "fr", "de", "es", "it", "nl", "pt"];
const ROLES = ["po", "pm", "architect", "techlead", "ba", "developer", "qa", "designer", "viewer"];

export const creatorOptions = (me: string | null): CreatorOptions_Serialize => ({
	stacks: Object.entries(GATES).map(([id, gates]) => ({ id, gates })),
	languages: LANGUAGES,
	roles: ROLES,
	me,
});

export function creatorDraft(name: string, stack: string, lang: string): Brief {
	const tech = TECH[stack];
	if (lang === "fr")
		return {
			vision: `${name.trim()} aide ses utilisateurs à atteindre leur objectif plus vite.`,
			users:
				"- Responsable produit : priorise le travail.\n- Utilisateur final : utilise le produit au quotidien.",
			scope: `${tech ? `Mettre en place le projet ${tech} et ses vérifications` : "Mettre en place le projet et ses vérifications"}\nÉcrire la première spécification de la fonction principale\nAjouter l'intégration continue\nÉcrire le guide de démarrage`,
		};
	return {
		vision: `${name.trim()} helps its users reach their goal faster.`,
		users: "- Product owner: sets the priorities.\n- End user: uses the product each day.",
		scope: `${tech ? `Set up the ${tech} project and its checks` : "Set up the project and its checks"}\nWrite the first spec of the main feature\nAdd continuous integration\nWrite the getting started guide`,
	};
}

const lines = (scope: string) =>
	scope
		.split("\n")
		.map((l) =>
			l
				.trim()
				.replace(/^[-*]+/, "")
				.trim(),
		)
		.filter(Boolean)
		.slice(0, 30);

/** The connection ids of the plan, the way the Rust `check` keeps them in the project file. */
export function connectionsOf(p: NewProject_Deserialize) {
	const forge = p.remote.kind === "local" ? undefined : (p.remote.forge ?? undefined);
	return {
		...(p.tracker ? { tracker: p.tracker } : {}),
		...(forge ? { forge } : {}),
		...(p.trackerScope?.trim() ? { trackerScope: p.trackerScope.trim() } : {}),
	};
}

/** The project file of the plan. It throws the message of the Rust `check` for a bad plan. */
export function projectFile(p: NewProject_Deserialize): ProjectFile_Serialize {
	if (!(p.stack in GATES)) throw "unknown stack";
	if (!p.folder.startsWith("/")) throw `${p.folder} is not a full path`;
	if (!/^[A-Z][A-Z0-9]{0,9}$/.test(p.key.trim())) throw `key: \`${p.key}\` is not valid`;
	if (!p.name.trim()) throw "name: `` is not valid";
	if (p.members.some((m) => !m.name.trim() || !ROLES.includes(m.role)))
		throw "each member needs a name and a role";
	if (p.remote.kind === "existing" && !/^\S+$/.test(p.remote.url.trim()))
		throw "the remote address is not valid";
	if ([p.brief.vision, p.brief.users, p.brief.scope].some((t) => t.length > 10_000))
		throw "the brief is too long";
	if (p.members.length > 50) throw "each member needs a name and a role";
	if (
		p.remote.kind === "create" &&
		(!/^[\w.-]+(\/[\w.-]+)+$/.test(p.remote.slug) ||
			p.remote.slug.split("/").some((s) => s === "." || s === ".."))
	)
		throw `\`${p.remote.slug}\` is not owner/name`;
	const connections = connectionsOf(p);
	return {
		name: p.name.trim(),
		key: p.key.trim(),
		paths: {},
		defaultWorkflow: null,
		gates: GATES[p.stack] ?? [],
		languages: { docs: p.docsLang, pulls: p.pullsLang },
		...(Object.keys(connections).length ? { connections } : {}),
	};
}

export function creatorPreview(p: NewProject_Deserialize): CreatorPreview_Serialize {
	const f = projectFile(p);
	const heads =
		p.docsLang === "fr" ? ["Vision", "Utilisateurs", "Périmètre"] : ["Vision", "Users", "Scope"];
	const items = lines(p.brief.scope);
	const conns = f.connections
		? `connections:\n${Object.entries(f.connections)
				.map(([k, v]) => `  ${k}: ${v}\n`)
				.join("")}`
		: "";
	const files: [string, string][] = [
		[
			".shipyard/project.yaml",
			`name: ${f.name}\nkey: ${f.key}\ngates:\n${f.gates.map((g) => `  - ${g}\n`).join("")}languages:\n  docs: ${p.docsLang}\n  pulls: ${p.pullsLang}\n${conns}`,
		],
		[".gitignore", `${[".DS_Store", ...(IGNORE[p.stack] ?? [])].join("\n")}\n`],
		[
			"AGENTS.md",
			`# ${f.name}\n\nStart from \`docs/brief.md\`.\n\n## Rules\n\n- Keep code, identifiers, code comments and commit messages in English.\n`,
		],
		["README.md", `# ${f.name}\n\n${p.brief.vision.trim()}\n`],
		[
			"docs/brief.md",
			`# ${f.name}\n\n## ${heads[0]}\n\n${p.brief.vision.trim()}\n\n## ${heads[1]}\n\n${p.brief.users.trim()}\n\n## ${heads[2]}\n\n${items.map((l) => `- ${l}\n`).join("")}`,
		],
		...(p.members.length
			? [
					[
						".shipyard/team.yaml",
						`members:\n${p.members.map((m) => `  - name: ${m.name.trim()}\n    role: ${m.role}\n`).join("")}`,
					] as [string, string],
				]
			: []),
	];
	const issues: Row_Serialize[] = items.map((title, i) => ({
		reference: `est:starter-${f.key.toLowerCase()}#s${i + 1}`,
		kind: "story",
		title,
		description: `From the scope of \`docs/brief.md\`: ${title}`,
		days: null,
		parent: null,
	}));
	const c = f.connections;
	return {
		files: files.map(([path, content]) => ({ path, state: "new", content })),
		issues,
		starts: [c?.forge && "run", c?.tracker && "issues", "later"].filter(
			(s): s is string => typeof s === "string",
		),
	};
}
