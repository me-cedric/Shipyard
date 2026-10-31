// The mock of the MCP test and recommended-set commands (`crates/shipyard-app/src/mcp_tools.rs`).
// A test of a server that cannot start gives a failed result with a coded error, not a throw.
import { classify } from "@/lib/i18n/errors";
import type { Connection_Serialize, McpTest_Serialize } from "./bindings";
import { type MockAgents, mcpAddCustom, mcpServer } from "./mock-agents";

/** The servers that suit the mock project. */
const RECOMMENDED = ["context7", "sonarqube"];

const TOOLS: Record<string, string[]> = {
	figma: ["get_file", "get_images"],
	jira: ["search_issues", "get_issue"],
	context7: ["resolve-library-id", "get-library-docs"],
	"custom-gitlab": ["list_issues", "get_merge_request", "search"],
};

export function mcpTest(m: MockAgents, id: string): McpTest_Serialize {
	const s = mcpServer(m, id);
	const absent = s.fields.filter((f) => !s.filled.includes(f.key)).map((f) => f.label);
	const why = s.missing.length
		? `missing dependency: ${s.missing.map((d) => d.label).join(", ")}`
		: absent.length
			? `missing setting: ${absent.join(", ")}`
			: null;
	if (why)
		return { id, ok: false, tools: [], error: { ...classify(why), details: why }, elapsedMs: 12 };
	const tools = TOOLS[id] ?? TOOLS[id.split("-").slice(0, 2).join("-")] ?? ["list"];
	return { id, ok: true, tools, error: null, elapsedMs: 240 };
}

export const mcpTestAll = (m: MockAgents) =>
	m.mcp.filter((s) => s.enabled).map((s) => mcpTest(m, s.id));

export const mcpRecommended = (m: MockAgents) =>
	RECOMMENDED.filter((id) => m.mcp.some((s) => s.id === id));

export function mcpRecommendedEnable(m: MockAgents, click: boolean): string[] {
	if (!click) throw "this change needs the click of a person";
	const done = mcpRecommended(m).filter((id) => !mcpServer(m, id).enabled);
	for (const id of done) mcpServer(m, id).enabled = true;
	return done;
}

/** The switch of the GitLab tools: the entry holds the address and no token (`gitlab_mcp_set_on`). */
export function gitlabMcpSetOn(
	m: MockAgents,
	c: Connection_Serialize,
	on: boolean,
	click: boolean,
	readOnly: boolean,
): null {
	if (!click) throw "this change needs the click of a person";
	if (readOnly) throw "the profile of this project is read only";
	const id = `custom-gitlab-${c.id}`;
	if (!on) {
		mcpServer(m, id).enabled = false;
		return null;
	}
	if (c.kind !== "gitlab") throw "the GitLab tools need a GitLab connection";
	if (!c.scopes.includes("mcp")) throw "the GitLab sign-in has no mcp scope: sign in again";
	mcpAddCustom(m, {
		id,
		name: `GitLab ${c.name}`,
		description: "",
		command: `${c.url.replace(/\/$/, "")}/api/v4/mcp`,
		args: ["--header", `Authorization:\${GITLAB_AUTH}`],
		env: [],
	});
	mcpServer(m, id).enabled = true;
	return null;
}
