// The mock of the runner, provider and MCP commands. It applies the rules of the Rust commands:
// a provider address is https (or local), a start names the missing dependency, a secret field
// is write-only (the keychain is `secrets`, and no command reads it).
import type {
	McpCustom_Deserialize,
	McpDependency,
	McpServer,
	McpState,
	Provider,
	ProviderDraft,
	Runner_Serialize,
	TestOutcome,
} from "./bindings";

export type MockAgents = {
	runners: Runner_Serialize[];
	providers: Provider[];
	mcp: McpServer[];
};

const runner = (id: string, label: string, version: string | null): Runner_Serialize => ({
	id,
	label,
	state: version ? "detected" : "missing",
	path: version ? `/usr/local/bin/${id}` : null,
	version,
	install: `npm install -g ${id}`,
});

const server = (
	id: string,
	category: string,
	label: string,
	fields: McpServer["fields"] = [],
	missing: McpDependency[] = [],
): McpServer => ({
	id,
	category,
	label,
	description: "",
	custom: false,
	enabled: false,
	fields,
	filled: [],
	state: { state: "stopped" },
	missing,
});

const DOCKER: McpDependency = {
	command: "docker",
	label: "Docker",
	present: false,
	installable: true,
	url: "https://docs.docker.com/get-docker/",
};

export const seedAgents = (): MockAgents => ({
	runners: [
		runner("claude", "Claude Code", "2.1.0"),
		runner("codex", "Codex", "0.147.0"),
		runner("copilot", "GitHub Copilot", null),
		runner("gemini", "Gemini CLI", null),
		runner("opencode", "OpenCode", null),
	],
	providers: [],
	mcp: [
		server("figma", "design", "Figma", [{ key: "token", label: "Figma API token", secret: true }]),
		server("jira", "work", "Jira and Confluence", [
			{ key: "email", label: "Atlassian account email", secret: false },
			{ key: "token", label: "API token", secret: true },
		]),
		server("sonarqube", "quality", "SonarQube", [], [DOCKER]),
	],
});

const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 38);

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

function checkProvider(d: ProviderDraft) {
	if (!/^https:\/\/[^/\s@]+/.test(d.url.trim()) && !LOCAL.test(d.url.trim()))
		throw "bad address: use an https address";
	if (!d.model.trim()) throw "a provider needs a model name";
	if (!d.name.trim()) throw "a provider needs a name";
}

export function providerAdd(m: MockAgents, d: ProviderDraft): Provider {
	checkProvider(d);
	const base = `provider-${slug(d.name) || "model"}`;
	let id = base;
	for (let n = 2; m.providers.some((p) => p.id === id); n++) id = `${base}-${n}`;
	const p: Provider = {
		id,
		name: d.name.trim(),
		url: d.url.trim().replace(/\/$/, ""),
		model: d.model.trim(),
		secret: false,
		state: "untested",
	};
	m.providers.push(p);
	return p;
}

export const provider = (m: MockAgents, id: string): Provider => {
	const p = m.providers.find((x) => x.id === id);
	if (!p) throw `unknown provider: ${id}`;
	return p;
};

export function providerEdit(m: MockAgents, id: string, d: ProviderDraft): Provider {
	const p = provider(m, id);
	checkProvider(d);
	const url = d.url.trim().replace(/\/$/, "");
	if (url !== p.url) p.state = "untested";
	Object.assign(p, { name: d.name.trim(), url, model: d.model.trim() });
	return p;
}

/** A provider with the key `revoked` is refused. */
export function providerTest(m: MockAgents, secrets: Record<string, string>, id: string) {
	const p = provider(m, id);
	const out: TestOutcome =
		secrets[id] === "revoked"
			? { kind: "failed", reason: "the token was rejected: wrong, expired or revoked" }
			: { kind: "passed", account: p.name };
	p.state = out.kind === "passed" ? "passed" : "failed";
	return out;
}

export const mcpServer = (m: MockAgents, id: string): McpServer => {
	const s = m.mcp.find((x) => x.id === id);
	if (!s) throw `unknown MCP server: ${id}`;
	return s;
};

export function mcpAddCustom(m: MockAgents, d: McpCustom_Deserialize): string {
	if (!d.name.trim()) throw "the MCP server name holds 1 to 80 characters";
	if (!d.command.trim()) throw "the MCP command is invalid";
	for (const e of d.env)
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key))
			throw "an MCP environment variable name is invalid";
	const id = d.id ?? `custom-${slug(d.name)}`;
	const old = m.mcp.find((s) => s.id === id);
	const row: McpServer = {
		...server(
			id,
			"custom",
			d.name.trim(),
			d.env.map((e) => ({ key: e.key, label: e.key, secret: true })),
		),
		description: d.description.trim(),
		custom: true,
		enabled: old?.enabled ?? false,
		filled: old?.filled ?? [],
		// A dependency is the command that launches the server.
		missing: d.command.includes("ghost")
			? [{ command: d.command, label: d.command, present: false, installable: false, url: "" }]
			: [],
	};
	if (old) Object.assign(old, row);
	else m.mcp.push(row);
	return id;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A start passes through `starting`. A missing dependency stops it before any process starts. */
export async function mcpStart(m: MockAgents, id: string): Promise<null> {
	const s = mcpServer(m, id);
	if (s.state.state === "running") return null;
	if (s.missing.length) {
		const why = `missing dependency: ${s.missing.map((d) => d.label).join(", ")}`;
		s.state = { state: "failed", reason: why };
		throw why;
	}
	const absent = s.fields.filter((f) => !s.filled.includes(f.key)).map((f) => f.label);
	if (absent.length) throw `missing setting: ${absent.join(", ")}`;
	s.state = { state: "starting" };
	await wait(30);
	s.state = { state: "running" };
	return null;
}

export const mcpState = (m: MockAgents, id: string): McpState => mcpServer(m, id).state;
