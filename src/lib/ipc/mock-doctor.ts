// The mock of Doctor tools, the findings ledger and the MCP server for outside agents. Rules of
// the Rust commands: an install finds the tool afterwards, a port is 1024 or more, a tool name is
// known, and the token is shown only after the server was on.
import type {
	CertStatus,
	Elsewhere,
	LedgerEntry,
	McpGates_Deserialize,
	McpOutside_Serialize,
	ToolCheck,
} from "./bindings";

const OUTSIDE_TOOLS = [
	"project_list_files",
	"project_read_file",
	"project_write_file",
	"git_status",
	"git_log",
	"git_diff",
	"forge_remote",
	"run_check",
	"delivery_diff",
];

const GROUP_OF: Record<string, keyof McpGates_Deserialize> = {
	project_list_files: "reads",
	project_read_file: "reads",
	project_write_file: "writes",
	git_status: "git",
	git_log: "git",
	git_diff: "git",
	forge_remote: "forge",
	run_check: "exec",
	delivery_diff: "delivery",
};

type Gates = Required<McpGates_Deserialize>;

export type MockDoctor = {
	tools: ToolCheck[];
	ledger: LedgerEntry[];
	gates: Gates;
	wired: boolean;
	elsewhere: Elsewhere[];
	imported: string[];
	certs: number;
};

const tool = (id: string, group: string, version: string, canInstall = true): ToolCheck => ({
	id,
	group,
	installed: version !== "",
	version,
	canInstall,
});

export const seedDoctor = (): MockDoctor => ({
	tools: [
		tool("git", "base", "git version 2.46.0"),
		tool("node", "base", "v22.4.0"),
		tool("pnpm", "base", ""),
		tool("rust", "base", "cargo 1.90.0"),
		tool("gh", "forge", "gh version 2.60.0"),
		tool("glab", "forge", ""),
		tool("claude", "agent", "2.1.0"),
		tool("codex", "agent", "0.147.0"),
		tool("copilot", "agent", ""),
		tool("gemini", "agent", ""),
		tool("opencode", "agent", ""),
		tool("osv-scanner", "scanner", ""),
		tool("semgrep", "scanner", ""),
		tool("skillspector", "scanner", "", false),
	],
	ledger: [
		{
			at: "2026-10-29T09:00:00Z",
			items: [{ id: "tools.gh", code: "tools.gh", severity: "warning" }],
			added: 1,
			resolved: 0,
		},
	],
	gates: {
		enabled: false,
		reads: false,
		writes: false,
		git: false,
		forge: false,
		exec: false,
		delivery: false,
		port: 47821,
		allowedTools: [],
	},
	wired: false,
	elsewhere: [
		{
			source: "Claude Code",
			name: "git",
			command: "uvx",
			args: ["mcp-server-git"],
			envKeys: [],
		},
	],
	imported: [],
	certs: 0,
});

export function doctorInstall(d: MockDoctor, id: string): ToolCheck[] {
	const t = d.tools.find((x) => x.id === id);
	if (!t) throw `unknown tool: ${id}`;
	if (!t.canInstall) throw `no package manager found to install \`${id}\``;
	t.installed = true;
	t.version = `${id} 1.0.0`;
	return d.tools;
}

/** A snapshot is added when the findings changed: here, when the missing tools changed. */
export function doctorLedger(d: MockDoctor): LedgerEntry[] {
	const items = d.tools
		.filter((t) => !t.installed && t.group !== "scanner")
		.map((t) => ({ id: `tools.${t.id}`, code: `tools.${t.id}`, severity: "warning" }));
	const before = d.ledger[0]?.items.map((i) => i.id) ?? [];
	const added = items.filter((i) => !before.includes(i.id)).length;
	const resolved = before.filter((id) => !items.some((i) => i.id === id)).length;
	if (added + resolved > 0)
		d.ledger.unshift({ at: `${new Date().toISOString().slice(0, 19)}Z`, items, added, resolved });
	return d.ledger;
}

export function outsideStatus(d: MockDoctor): McpOutside_Serialize {
	const g = d.gates;
	const on = OUTSIDE_TOOLS.filter(
		(n) =>
			g[GROUP_OF[n] as keyof Gates] && (g.allowedTools.length === 0 || g.allowedTools.includes(n)),
	);
	return {
		gates: g,
		running: g.enabled,
		url: g.enabled ? `http://127.0.0.1:${g.port}/mcp` : "",
		error: "",
		tools: OUTSIDE_TOOLS,
		active: on,
	};
}

export function outsideSet(d: MockDoctor, gates: McpGates_Deserialize): McpOutside_Serialize {
	const next: Gates = { ...d.gates, ...gates } as Gates;
	if (next.port < 1024) throw "the port must be 1024 or more";
	const bad = next.allowedTools.find((n) => !OUTSIDE_TOOLS.includes(n));
	if (bad) throw `unknown tool: ${bad}`;
	d.gates = next;
	return outsideStatus(d);
}

export function outsideWire(d: MockDoctor, project: string | null): string {
	if (!d.gates.enabled) throw "turn the server on first";
	if (!project) throw "no active project";
	d.wired = true;
	return `${project}/.mcp.json`;
}

export function outsideToken(d: MockDoctor): string {
	if (!d.gates.enabled) throw "turn the server on first";
	return "0".repeat(64);
}

export function elsewhereImport(d: MockDoctor, source: string, name: string): string {
	if (!d.elsewhere.some((e) => e.source === source && e.name === name))
		throw "the server is gone from that file";
	d.imported.push(name);
	return `custom-${name}`;
}

/** The rules of the Rust commands: a click, a file with a PEM certificate. The mock counts a file named `*.pem`. */
export function certsImport(d: MockDoctor, path: string, click: boolean): CertStatus {
	if (!click) throw "this change needs the click of a person";
	if (!path.endsWith(".pem")) throw "the file holds no PEM certificate";
	d.certs = 1;
	return certsStatus(d);
}

export function certsRemove(d: MockDoctor, click: boolean): CertStatus {
	if (!click) throw "this change needs the click of a person";
	d.certs = 0;
	return certsStatus(d);
}

export const certsStatus = (d: MockDoctor): CertStatus => ({ added: d.certs > 0, count: d.certs });
