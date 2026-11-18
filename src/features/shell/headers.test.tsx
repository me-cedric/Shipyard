import { screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { placePath } from "./places";
import { type SectionSpace, SPACE_IDS, SPACES, type SpaceId, tabIcon, tabLabel } from "./spaces";

const TABS = SPACE_IDS.flatMap((space) => SPACES[space].map((tab) => [space, tab] as const));

/**
 * An old tab that Flow or Crew hosts has the header of its place (the place name, the icon of
 * its section); Health keeps the header of the Quality page, which wave 3 does not change.
 */
function hosted(space: SpaceId, tab: string) {
	const [, place, slug] = (placePath(`/${space}/${tab}`) ?? "").split("/");
	if (!slug || slug === "health" || slug === "impacts") return undefined;
	return place === "flow" || place === "crew" ? ({ place, slug } as const) : undefined;
}

/** The page that wave 6 gives to an old tab: its title, and the section that has its icon. */
const MOVED: Record<string, readonly [string, SectionSpace, string]> = {
	"code/changes": [en.ui.place.code, "code", "now"],
	"code/pull-requests": [en.ui.place.code, "code", "now"],
	"settings/project": [en.tabs.setup.project, "setup", "project"],
	"settings/connections": [en.tabs.setup.computer, "setup", "computer"],
	"settings/me": [en.tabs.setup.me, "setup", "me"],
};

/** The title of a hosted or moved tab. The agents map of before is the live view of Crew. */
const placeTitle = (space: SpaceId, tab: string) => {
	const at = hosted(space, tab);
	if (!at) return MOVED[`${space}/${tab}`]?.[0];
	return tab === "agents-map" ? en.crewPlace.atWork : en.ui.place[at.place];
};

// update-ux-declutter REQ-017: each tab shows a visible page header with its icon and its title,
// also while it loads, and a page has one level-one heading.
async function expectHeader(space: SpaceId, tab: string, title: string) {
	const router = mountApp(`/${space}/${tab}`);
	await waitFor(() => expect(router.state.status).toBe("idle"));
	await waitFor(() => expect(within(screen.getByRole("main")).queryByRole("status")).toBeNull());
	const heads = within(screen.getByRole("main")).getAllByRole("heading", { level: 1 });
	expect(heads).toHaveLength(1);
	const [h1] = heads;
	expect(h1).toHaveTextContent(new RegExp(`^${title}`));
	expect(h1?.classList.contains("sr-only")).toBe(false);
	const slot = h1?.previousElementSibling;
	// The first-run welcome page carries the logo, not a tab icon.
	if (title === en.ui.welcome) return expect(slot?.querySelector("img")).not.toBeNull();
	const at = hosted(space, tab);
	const moved = MOVED[`${space}/${tab}`];
	const Icon = at
		? tabIcon(at.place, at.slug)
		: moved
			? tabIcon(moved[1], moved[2])
			: tabIcon(space, tab);
	// An animated icon sets inline styles, so compare the shapes.
	const shapes = (html: string | undefined) => {
		const probe = document.createElement("div");
		probe.innerHTML = html ?? "";
		return [...probe.querySelectorAll("path")].map((p) => p.getAttribute("d"));
	};
	expect(shapes(slot?.innerHTML)).toEqual(shapes(Icon && renderToStaticMarkup(<Icon size={16} />)));
	expect(shapes(slot?.innerHTML).length).toBeGreaterThan(0);
}

// Wave 6: a page behind a door of Setup, Projects and Impacts are no tabs, and each has its one heading.
describe("a page header on every page off the section switches (REQ-017)", () => {
	it.each([
		"/projects",
		"/flow/impacts",
		"/setup/start",
		"/setup/project?page=connections",
		"/setup/project?page=tickets",
		"/setup/project?page=extensions",
		"/setup/project?page=health",
		"/setup/computer?page=models",
		"/setup/computer?page=share",
		"/setup/computer?page=health",
		"/setup/computer?page=logs",
		"/setup/me?page=look",
	])("shows one level-one heading at %s", async (path) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp(path);
		await waitFor(() => expect(router.state.status).toBe("idle"));
		await waitFor(() =>
			expect(within(screen.getByRole("main")).getAllByRole("heading", { level: 1 })).toHaveLength(
				1,
			),
		);
	});
});

describe("a page header on every tab (REQ-017)", () => {
	// Code / Terminal is a page (`spec:app-redesign#REQ-022`). The manual is off the bar, with its icon.
	const named = TABS;
	const title = (space: SpaceId, tab: string) => placeTitle(space, tab) ?? tabLabel(en, space, tab);
	it.each(named)("shows the header of %s / %s with no project", async (space, tab) => {
		// Home / Today without a project is the welcome page, headed by the logo.
		const home = space === "home" && tab === "today";
		await expectHeader(space, tab, home ? en.ui.welcome : title(space, tab));
	});
	it.each(named)("shows the header of %s / %s with a project", async (space, tab) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		// Today with a project is titled with the count of what needs the person (app-redesign REQ-007).
		const today = space === "home" && tab === "today";
		// Health with a project is titled with the count of gates to fix (app-redesign REQ-023).
		const health = space === "code" && tab === "quality";
		await expectHeader(
			space,
			tab,
			today
				? "(Today|\\d+ things? needs? you)"
				: health
					? "(Quality|\\d+ gates? needs? a fix|No gate needs a fix)"
					: // Plan says when the release ends in its title (app-redesign REQ-018).
						space === "work" && tab === "plan"
						? ".+ ends "
						: title(space, tab),
		);
	});
});
