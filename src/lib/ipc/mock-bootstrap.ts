// The mock of the Doctor bootstrap form. Rules of the Rust commands: a valid name and key, a known
// stack and agent, a click for the write, and a file that exists is never replaced.
import type { BootstrapAnswers, BootstrapPlan, ToolCheck } from "./bindings";

const STACKS = ["rust", "node", "python", "other"];
const AGENTS = ["claude", "codex"];
const GATES: Record<string, string[]> = {
	rust: ["cargo test", "cargo clippy"],
	node: ["pnpm test", "pnpm lint"],
	python: ["pytest"],
	other: [],
};

export type MockBootstrap = { files: Set<string> };
export const seedBootstrap = (): MockBootstrap => ({ files: new Set() });

function needed(stack: string, agent: string): string[] {
	const ids = ["git"];
	if (stack === "rust") ids.push("rust");
	if (stack === "node") ids.push("node", "pnpm");
	ids.push(agent === "codex" ? "codex" : "claude");
	return ids;
}

export function bootstrapPlan(
	b: MockBootstrap,
	a: BootstrapAnswers,
	tools: ToolCheck[],
): BootstrapPlan {
	const name = a.name.trim();
	if (!name || name.length > 80) throw "name is not valid";
	if (!/^[A-Z][A-Z0-9]{0,9}$/.test(a.key.trim())) throw "key is not valid";
	if (a.summary.length > 2000) throw "the summary is too long";
	if (!STACKS.includes(a.stack) || !AGENTS.includes(a.agent)) throw "unknown stack or agent";
	const checks = GATES[a.stack]?.join(", ") || "the checks of the stack";
	const content: Record<string, string> = {
		".shipyard/project.yaml": `name: ${name}\nkey: ${a.key.trim()}\n`,
		"AGENTS.md": `# ${name}\n\n${a.summary.trim()}\n`,
		"BOOTSTRAP_PROMPT.md": `# Build ${name}\n\n${a.summary.trim()}\n\nStack: ${a.stack}. Agent: ${a.agent}. Checks: ${checks}.\n`,
		"agent-compass.answers.json": `${JSON.stringify(a, null, 2)}\n`,
	};
	const wanted = needed(a.stack, a.agent);
	return {
		files: Object.entries(content).map(([path, text]) => ({
			path,
			state: b.files.has(path) ? "exists" : "new",
			content: text,
		})),
		tools: tools.filter((t) => wanted.includes(t.id)),
	};
}

export function bootstrapApply(
	b: MockBootstrap,
	a: BootstrapAnswers,
	tools: ToolCheck[],
	click: boolean,
): string[] {
	if (!click) throw "this change needs the click of a person";
	const written = bootstrapPlan(b, a, tools)
		.files.filter((f) => f.state === "new")
		.map((f) => f.path);
	for (const p of written) b.files.add(p);
	return written;
}
