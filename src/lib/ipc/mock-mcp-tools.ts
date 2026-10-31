// The mock of the MCP test and recommended-set commands (`crates/shipyard-app/src/mcp_tools.rs`).
// A test of a server that cannot start gives a failed result with a coded error, not a throw.
import { classify } from "@/lib/i18n/errors";
import type { McpTest_Serialize } from "./bindings";
import { type MockAgents, mcpServer } from "./mock-agents";

/** The servers that suit the mock project. */
const RECOMMENDED = ["context7", "sonarqube"];

const TOOLS: Record<string, string[]> = {
	figma: ["get_file", "get_images"],
	jira: ["search_issues", "get_issue"],
	context7: ["resolve-library-id", "get-library-docs"],
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
	return { id, ok: true, tools: TOOLS[id] ?? ["list"], error: null, elapsedMs: 240 };
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
