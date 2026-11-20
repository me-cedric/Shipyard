import { expect, type Page } from "@playwright/test";
import { PLACE_IDS, sections } from "../src/features/shell/places";
import { tabLabel } from "../src/features/shell/spaces";
import { en } from "../src/lib/i18n/en";

/** The sidebar name of the place that holds a section, by the English name of the section (adr:0023). */
export function placeOf(section: string): string {
	const place = PLACE_IDS.find((p) => sections(p).some(([s, t]) => tabLabel(en, s, t) === section));
	if (!place) throw new Error(`No place holds ${section}`);
	return en.ui.place[place];
}

/** The English name of the section at a path `/place/slug`: Library has no switch that names it. */
export function sectionAt(path: string): string {
	const [, place, slug] = path.split("/");
	const view = PLACE_IDS.includes(place as never)
		? sections(place as (typeof PLACE_IDS)[number]).find(([, tab]) => tab === slug)
		: undefined;
	return view ? tabLabel(en, ...view) : "";
}

/** The address of a page of Library, by the English name of its section. */
export function libraryPath(name: string): string {
	const tab = sections("library").find(([s, t]) => tabLabel(en, s, t) === name)?.[1];
	if (!tab) throw new Error(`Library has no page ${name}`);
	return `/library/${tab}`;
}

/**
 * A page of Library: the sidebar link opens the four doors, then the chip of the page opens it.
 * A chip can carry a count ("3 open questions", "Learn, 0 of 10"): the chip is found by its address.
 */
export async function openLibrary(page: Page, name: string) {
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Library" })
		.click();
	await page
		.getByRole("main")
		.locator(`a[href="${libraryPath(name)}"]`)
		.first()
		.click();
}
/** Opens an address with no reload: the mock project lives in the memory of the page. */
export const visit = (page: Page, href: string) =>
	page.evaluate((to) => {
		window.history.pushState({}, "", to);
		window.dispatchEvent(new PopStateEvent("popstate"));
	}, href);

/** Picks an item of the More menu of Flow: a choice of the Status filter is a radio item. */
export async function pickMore(
	page: Page,
	name: string,
	role: "menuitem" | "menuitemradio" = "menuitem",
) {
	await page.getByRole("button", { name: "More", exact: true }).click();
	await page.getByRole("menu").getByRole(role, { name, exact: true }).click();
	// A radio item keeps the menu open: close it, so the next call opens it again.
	if (role === "menuitemradio") await page.keyboard.press("Escape");
	await expect(page.getByRole("menu")).toHaveCount(0);
}
