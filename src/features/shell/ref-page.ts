import type { Messages } from "@/lib/i18n";
import { DOC_DIR } from "@/lib/knowledge";
import { type PlaceId, type PlacePath, sectionView } from "./places";
import { tabLabel } from "./spaces";

/** The page that lists the entities of each ref kind. A run and a pull request are not here: each has its own page (`runOfRef`, `pullOfRef`). */
const PAGE: Record<string, PlacePath | "/projects"> = {
	adr: "/library/decisions",
	diagram: "/library/diagrams",
	model: "/library/architecture",
	api: "/library/api",
	data: "/library/data",
	flow: "/library/flows",
	screen: "/library/screens",
	change: "/flow/list",
	spec: "/library/capabilities",
	q: "/library/questions",
	test: "/library/test-plans",
	wi: "/flow/list",
	est: "/plan/estimates",
	member: "/crew/crew",
	wf: "/crew/recipes",
	commit: "/code/history",
	doc: "/library/documents",
	conn: "/setup/project",
	project: "/projects",
};

/** The page and the open item of a `doc:` ref, by the folder of the file. */
const DOC_PAGE = [
	[DOC_DIR.handbook, "/library/handbook"],
	[DOC_DIR.documents, "/library/documents"],
	[DOC_DIR.slides, "/library/slides"],
] as const;

export function docTarget(ref: string): { page: PlacePath; scope: string; id: string } | undefined {
	if (!ref.startsWith("doc:")) return undefined;
	const id = ref.slice(4);
	const hit = DOC_PAGE.find(([dir]) => id.startsWith(`${dir}/`));
	return hit && { page: hit[1], scope: `knowledge:${hit[0]}`, id };
}

/** A change or a ticket has no list page: a change opens as a feature on its Brief, a ticket on its page. */
export const featureOfRef = (ref: string) =>
	/^(change|wi):.+/.test(ref)
		? {
				to: "/flow/feature/$featureId" as const,
				params: { featureId: ref },
				search: ref.startsWith("wi:") ? { ticket: true as const } : { section: "brief" as const },
			}
		: undefined;

export const refPage = (ref: string): PlacePath | "/projects" | undefined =>
	PAGE[ref.slice(0, ref.indexOf(":"))];

/**
 * The open item that the page of the ref remembers (`useTabSelection`): its scope and its id. A
 * Design tab keeps its scope under its own title, so the title comes from the language.
 */
export function refSelection(t: Messages, ref: string): [scope: string, id: string] | undefined {
	const page = refPage(ref);
	if (!page) return undefined;
	const [kind = "", rest = ""] = ref.split(/:(.*)/s);
	const [, place = "", tab = ""] = page.split("/");
	if (sectionView(place as PlaceId, tab)?.[0] === "design")
		return [`design:${tabLabel(t, "design", tab)}`, ref];
	if (kind === "spec") return ["specs:capabilities", rest.split("#")[0] ?? rest];
	return undefined;
}
