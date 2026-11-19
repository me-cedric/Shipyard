import { screen, waitFor, within } from "@testing-library/react";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { placePath } from "./places";
import { type SectionSpace, SPACE_IDS, SPACES, type SpaceId, tabLabel } from "./spaces";

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

/** The page that wave 6 gives to an old tab: its title, and the section that has its icon. The title of each scope of Setup is "Setup" (look pass 2). */
const MOVED: Record<string, readonly [string, SectionSpace, string]> = {
	"code/changes": ["\\d+ files? to commit", "code", "now"],
	"code/pull-requests": [en.ui.place.code, "code", "now"],
	"settings/project": [en.ui.place.setup, "setup", "project"],
	"settings/connections": [en.ui.place.setup, "setup", "computer"],
	"settings/me": [en.ui.place.setup, "setup", "me"],
	"settings/agents-rules": [en.ui.place.setup, "setup", "computer"],
	"settings/extensions": [en.ui.place.setup, "setup", "project"],
	"settings/health": [en.ui.place.setup, "setup", "project"],
};

/** The title of a hosted or moved tab. The agents map of before is the live view of Crew. */
const placeTitle = (space: SpaceId, tab: string) => {
	const at = hosted(space, tab);
	if (!at) return MOVED[`${space}/${tab}`]?.[0];
	// The live rows count the agents at work in the title (app-redesign REQ-017).
	return tab === "agents-map" ? "(\\d+ agents?|Agents) at work" : en.ui.place[at.place];
};

// update-ux-declutter REQ-017: each tab shows a visible page header with its title,
// also while it loads, and a page has one level-one heading.
async function expectHeader(space: SpaceId, tab: string, title: string) {
	const router = mountApp(`/${space}/${tab}`);
	await waitFor(() => expect(router.state.status).toBe("idle"));
	// A stepper shows its value in an output: it is a status role, and no loader.
	await waitFor(() =>
		expect(
			within(screen.getByRole("main"))
				.queryAllByRole("status")
				.filter((el) => el.tagName !== "OUTPUT"),
		).toEqual([]),
	);
	// The first run draws nothing before the prefs and the list of projects load.
	const heads = await within(screen.getByRole("main")).findAllByRole("heading", { level: 1 });
	expect(heads).toHaveLength(1);
	const [h1] = heads;
	expect(h1).toHaveTextContent(new RegExp(`^${title}`));
	expect(h1?.classList.contains("sr-only")).toBe(false);
	const slot = h1?.previousElementSibling;
	// The first run is headed by its step bar, not by a tab icon.
	if (title === en.projects.job) return expect(slot).toHaveAttribute("role", "img");
	// Look pass 1: the title row has no icon tile, and a page shows one section switch at most.
	expect(slot?.querySelector("svg") ?? null).toBeNull();
	expect(
		within(screen.getByRole("main")).queryAllByRole("navigation", { name: en.nav.tabs }).length,
	).toBeLessThanOrEqual(1);
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
		// Home / Today without a project is the first run. A place that needs a project shows the
		// page "No project is open". Setup, the terminal, the manual and the other sections of Home need
		// no project.
		const home = space === "home" && tab === "today";
		const bare = space !== "home" && space !== "settings" && tab !== "terminal" && tab !== "manual";
		await expectHeader(
			space,
			tab,
			home ? en.projects.job : bare ? en.workspace.moment.noProject : title(space, tab),
		);
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
						: // Estimates says the size of the release in its title, once the estimate loads.
							space === "work" && tab === "estimates"
							? "(Estimates|.+ is .+ days of work)"
							: // Time names whose time it shows, as the design does ("My time").
								space === "work" && tab === "time"
								? "(Time|My time|.+ time)"
								: // Questions says the count of the open ones, and Test plans the open plan (Library, look pass 2).
									space === "specs" && tab === "questions"
									? "(Questions|\\d+ open questions?)"
									: space === "specs" && tab === "test-plans"
										? "(Test plans|Test plan: .+)"
										: title(space, tab),
		);
	});
});
