import { screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { placePath } from "./places";
import { SPACE_IDS, SPACES, type SpaceId, tabIcon, tabLabel } from "./spaces";

const TABS = SPACE_IDS.flatMap((space) => SPACES[space].map((tab) => [space, tab] as const));

/**
 * An old tab that Flow hosts has the header of Flow (the place name, the icon of its view); Health
 * keeps the header of the Quality page, which wave 3 does not change.
 */
function hosted(space: SpaceId, tab: string) {
	const [, place, slug] = (placePath(`/${space}/${tab}`) ?? "").split("/");
	return place === "flow" && slug && slug !== "health" && slug !== "impacts" ? slug : undefined;
}

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
	const slug = hosted(space, tab);
	const Icon = slug ? tabIcon("flow", slug) : tabIcon(space, tab);
	// An animated icon sets inline styles, so compare the shapes.
	const shapes = (html: string | undefined) => {
		const probe = document.createElement("div");
		probe.innerHTML = html ?? "";
		return [...probe.querySelectorAll("path")].map((p) => p.getAttribute("d"));
	};
	expect(shapes(slot?.innerHTML)).toEqual(shapes(Icon && renderToStaticMarkup(<Icon size={16} />)));
	expect(shapes(slot?.innerHTML).length).toBeGreaterThan(0);
}

describe("a page header on every tab (REQ-017)", () => {
	// Code / Terminal opens the drawer and lands on Changes. The manual is off the bar, with its icon.
	const named = TABS.filter(([, tab]) => tab !== "terminal");
	it.each(named)("shows the header of %s / %s with no project", async (space, tab) => {
		// Home / Today without a project is the welcome page, headed by the logo.
		const home = space === "home" && tab === "today";
		await expectHeader(
			space,
			tab,
			home ? en.ui.welcome : hosted(space, tab) ? en.ui.place.flow : tabLabel(en, space, tab),
		);
	});
	it.each(named)("shows the header of %s / %s with a project", async (space, tab) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		// Today with a project is titled with the count of what needs the person (app-redesign REQ-007).
		const today = space === "home" && tab === "today";
		await expectHeader(
			space,
			tab,
			today
				? "(Today|\\d+ things? needs? you)"
				: hosted(space, tab)
					? en.ui.place.flow
					: tabLabel(en, space, tab),
		);
	});
});
