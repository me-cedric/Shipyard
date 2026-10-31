import type { Messages } from "@/lib/i18n";
import { type TabPath, tabLabel } from "./spaces";

/** The page that lists the entities of each ref kind. */
const PAGE: Record<string, TabPath> = {
	adr: "/design/decisions",
	diagram: "/design/diagrams",
	model: "/design/architecture",
	api: "/design/api",
	data: "/design/data",
	flow: "/design/flows",
	screen: "/design/screens",
	change: "/specs/changes",
	spec: "/specs/capabilities",
	q: "/specs/questions",
	test: "/specs/test-plans",
	wi: "/work/backlog",
	est: "/work/estimates",
	member: "/work/team",
	run: "/factory/runs",
	wf: "/factory/workflows",
	pr: "/code/pull-requests",
	commit: "/code/history",
	doc: "/knowledge/documents",
	conn: "/settings/connections",
	project: "/home/projects",
};

export const refPage = (ref: string): TabPath | undefined => PAGE[ref.slice(0, ref.indexOf(":"))];

/**
 * The open item that the page of the ref remembers (`useTabSelection`): its scope and its id. A
 * Design tab keeps its scope under its own title, so the title comes from the language.
 */
export function refSelection(t: Messages, ref: string): [scope: string, id: string] | undefined {
	const page = refPage(ref);
	if (!page) return undefined;
	const [kind = "", rest = ""] = ref.split(/:(.*)/s);
	const [, space = "", tab = ""] = page.split("/");
	if (space === "design") return [`design:${tabLabel(t, "design", tab)}`, ref];
	if (kind === "change") return ["specs:changes", rest];
	if (kind === "spec") return ["specs:capabilities", rest.split("#")[0] ?? rest];
	if (kind === "pr") return ["code:pull-requests", ref];
	return undefined;
}
