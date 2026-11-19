import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { barSections, PLACE_IDS } from "../src/features/shell/places";
import { openFirstFolder, pickDarkTheme } from "./first-run";
import { visit } from "./places";

// The pages that no section switch holds: Projects, Impacts, and the pages behind the doors of Setup.
const OFF_SWITCH = [
	"/projects",
	"/flow/impacts",
	"/setup/project?page=connections",
	"/setup/project?page=tickets",
	"/setup/project?page=extensions",
	"/setup/project?page=health",
	"/setup/computer?page=models",
	"/setup/computer?page=share",
	"/setup/computer?page=health",
	"/setup/computer?page=logs",
	"/setup/me?page=look",
];

// The minimum window (`spec:app-redesign#REQ-026`): each page of the run opens at this size.
test.use({ viewport: { width: 960, height: 600 } });

/** Each control that a person clicks. */
const CONTROL =
	'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"], [role="radio"]';

/** The controls that can be under 44 px high: the selector, then the reason. */
const EXEMPT: [string, string][] = [
	[".excalidraw", "The canvas of the whiteboard sets the sizes of its tools."],
	[".react-flow", "A diagram zooms: its nodes and its zoom buttons change size with it."],
	[".xterm", "The terminal reads the keys in a hidden text area."],
];

/** The size faults of the page: a sideways scroll, and each control with a hit box under 44 px high. */
const sizeFaults = (page: Page) =>
	page.evaluate(
		([control, exempt]) => {
			const root = document.documentElement;
			const faults = new Set<string>();
			if (root.scrollWidth > root.clientWidth) {
				// The fault names the first parts that pass the right edge of the window.
				const wide = [...document.querySelectorAll<HTMLElement>("body *")]
					.filter(
						(el) =>
							el.getBoundingClientRect().right > root.clientWidth + 1 &&
							(el.parentElement?.getBoundingClientRect().right ?? 0) <= root.clientWidth + 1,
					)
					.slice(0, 3)
					.map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
				faults.add(
					`scrolls sideways: ${root.scrollWidth} > ${root.clientWidth} (${wide.join(" | ")})`,
				);
			}
			for (const el of document.querySelectorAll<HTMLElement>(control)) {
				if (el.closest('[aria-hidden="true"], [inert]') || (exempt && el.closest(exempt))) continue;
				if (!el.checkVisibility({ visibilityProperty: true })) continue;
				// The label of a small mark, such as a checkbox, is its hit box.
				const box = el.closest("label") ?? el;
				const height = Math.round(box.getBoundingClientRect().height);
				if (height === 0 || height >= 44) continue;
				const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
				faults.add(`${el.tagName.toLowerCase()}.${el.className} "${name}" is ${height} px high`);
			}
			return [...faults];
		},
		[CONTROL, EXEMPT.map(([selector]) => selector).join(", ")] as const,
	);

/** The axe violations and the size faults of the page that shows, each one with the name of the page. */
async function scan(page: Page, where: string): Promise<string[]> {
	let { violations } = await new AxeBuilder({ page }).analyze();
	// A page that still draws its data can show a mixed state, such as the face of a deck before
	// its theme: the scan runs one more time, and the second result counts.
	if (violations.length) {
		await page.waitForTimeout(500);
		({ violations } = await new AxeBuilder({ page }).analyze());
	}
	return [
		// The summary names the cause, for example the two colours and the contrast ratio.
		...violations.map(
			(v) =>
				`${where} ${v.id}: ${v.nodes.map((n) => `${n.target} (${n.failureSummary ?? ""})`).join(" | ")}`,
		),
		...(await sizeFaults(page)).map((fault) => `${where} ${fault}`),
	];
}

// The views inside a section, which the switch does not list: the link of each one is on its section.
const VIEWS: Record<string, string[]> = { "/crew/crew": ["/crew/crew?view=live"] };

// Every section of every place, on the mock project, in the light and the dark theme.
for (const scheme of ["light", "dark"] as const) {
	for (const place of PLACE_IDS) {
		// The sections of the switch: Manual is not on it.
		const tabs = barSections(place)
			.map(([, tab]) => `/${place}/${tab}`)
			.flatMap((path) => [path, ...(VIEWS[path] ?? [])]);
		test(`has no axe violation: ${place}, ${scheme} theme`, async ({ page }) => {
			test.setTimeout(90_000);
			page.setDefaultTimeout(10_000);
			await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
			await page.goto("/");
			await openFirstFolder(page);
			await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
			if (scheme === "dark") await pickDarkTheme(page);
			await page.locator(`nav a[href="/${place}"]`).first().click();
			const found: string[] = [];
			for (const tab of tabs) {
				// Library has no switch: the sidebar opens its home, and a chip of the home opens a page.
				if (place === "library") await page.locator('nav a[href="/library"]').first().click();
				if (tab !== "/library/home") await page.locator(`a[href="${tab}"]`).first().click();
				if (!tab.includes("?")) await expect(page).toHaveURL(new RegExp(`${tab}$`));
				await expect(page.locator("main")).toBeVisible();
				await page.waitForLoadState("networkidle");
				found.push(...(await scan(page, tab)));
			}
			expect(found).toEqual([]);
		});
	}
	test(`has no axe violation: the pages off the section switches, ${scheme} theme`, async ({
		page,
	}) => {
		test.setTimeout(120_000);
		page.setDefaultTimeout(10_000);
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
		await page.goto("/");
		await openFirstFolder(page);
		await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
		if (scheme === "dark") await pickDarkTheme(page);
		const found: string[] = [];
		for (const href of OFF_SWITCH) {
			await visit(page, href);
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
			await page.waitForLoadState("networkidle");
			found.push(...(await scan(page, href)));
		}
		// A feature page: the first card of the board that opens one.
		await visit(page, "/flow/flow");
		await page.getByRole("main").getByRole("button", { name: "Open" }).first().click();
		await expect(page).toHaveURL(/\/flow\/(feature|runs)\//);
		await page.waitForLoadState("networkidle");
		found.push(...(await scan(page, "/flow/feature")));
		// The full assistant.
		await page.keyboard.press("Control+j");
		await expect(page.getByRole("complementary", { name: "Assistant" })).toBeVisible();
		found.push(...(await scan(page, "assistant")));
		await page.keyboard.press("Control+j");
		// Each step of a new project.
		await visit(page, "/projects");
		await page.getByRole("button", { name: "New project" }).click();
		const steps = page
			.getByRole("dialog", { name: "New project" })
			.getByRole("navigation", { name: "Steps" })
			.getByRole("button");
		await expect(steps).toHaveCount(5);
		for (let i = 0; i < 5; i++) {
			await steps.nth(i).click();
			found.push(...(await scan(page, `new project, step ${i + 1}`)));
		}
		expect(found).toEqual([]);
	});
	// The manual is no tab since wave 2: the scan opens it by its address.
	test(`has no axe violation: the manual, ${scheme} theme`, async ({ page }) => {
		page.setDefaultTimeout(10_000);
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
		await page.goto("/knowledge/manual");
		await expect(page.getByRole("article")).toBeVisible();
		if (scheme === "dark") await pickDarkTheme(page);
		await page.waitForLoadState("networkidle");
		expect(await scan(page, "/knowledge/manual")).toEqual([]);
	});
}
