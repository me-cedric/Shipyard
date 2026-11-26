import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { barSections, PLACE_IDS } from "../src/features/shell/places";
import { openFirstFolder, pickDarkTheme } from "./first-run";
import { visit } from "./places";

// The pages that no section switch holds: Projects, Impacts, the pages behind the doors of Setup and the full pages of Library.
const OFF_SWITCH = [
	"/projects",
	"/flow/impacts",
	"/flow/new",
	"/setup/project?page=connections",
	"/setup/project?page=tickets",
	"/setup/project?page=extensions",
	"/setup/project?page=health",
	"/setup/computer?page=models",
	"/setup/computer?page=share",
	"/setup/computer?page=health",
	"/setup/computer?page=logs",
	"/setup/me?page=look",
	// The pages of Library with a back link: no chip of the home opens them.
	"/library/flows/matrix",
	"/library/dashboards/team/edit",
	"/library/test-plans/coverage",
	"/library/reports/change-request",
	"/library/graph?source=code",
];

// The sub-pages of Crew and Plan (look pass 2): each one has its own address.
const SUB_PAGES = [
	"/crew/crew?member=ada",
	"/crew/recipes?recipe=feature",
	"/crew/recipes?recipe=feature&step=build",
	"/crew/sessions?page=ended",
	"/crew/rights?page=team",
	"/crew/rights?page=levels",
	"/crew/spend?page=how",
	"/crew/spend?page=budgets",
	"/crew/spend?page=usage",
	"/plan/timeline?page=dates",
	"/plan/people?page=send",
	"/plan/time?page=entries",
	"/plan/time?page=team",
	"/plan/estimates?tab=summary",
	"/plan/estimates?tab=costing",
	"/plan/estimates?page=import",
];

// The minimum window (`spec:app-redesign#REQ-026`): each page of the run opens at this size.
test.use({ viewport: { width: 960, height: 600 } });

/** Each control that a person clicks. */
const CONTROL =
	'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="radio"], [role="treeitem"], [role="combobox"], [role="row"][tabindex]';

/** The controls that can be under 44 px high: the selector, then the reason. */
const EXEMPT: [string, string][] = [
	[".excalidraw", "The canvas of the whiteboard sets the sizes of its tools."],
	[".react-flow", "A diagram zooms: its nodes and its zoom buttons change size with it."],
	[".xterm", "The terminal reads the keys in a hidden text area."],
	["[data-line-action]", 'The "+" of a diff line fills one text line of the diff, 44 px wide.'],
	["[data-gantt-bar]", "A bar of the timeline is a mark on a time scale, 20 px high in its row."],
];

/** The size faults of the page: a sideways scroll, and each control with a hit box under 44 px high. */
const sizeFaults = (page: Page) =>
	page.evaluate(
		([control, exempt]) => {
			const root = document.documentElement;
			const faults = new Set<string>();
			// The window, and `main`: the content of a page scrolls inside it, so the root never grows.
			for (const box of [root, document.querySelector<HTMLElement>("main")]) {
				if (!box || box.scrollWidth <= box.clientWidth + 1) continue;
				const edge = (box === root ? 0 : box.getBoundingClientRect().left) + box.clientWidth + 1;
				// The fault names the first parts that pass the right edge of the box.
				const wide = [...box.querySelectorAll<HTMLElement>("*")]
					.filter(
						(el) =>
							el.getBoundingClientRect().right > edge &&
							(el.parentElement?.getBoundingClientRect().right ?? 0) <= edge,
					)
					.slice(0, 3)
					.map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
				faults.add(
					`${box.tagName.toLowerCase()} scrolls sideways: ${box.scrollWidth} > ${box.clientWidth} (${wide.join(" | ")})`,
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

/** Waits for the opening move of a popup: a box that still grows reads a few px too small. */
async function settled(popup: Locator) {
	// The popup opens from 95 %: wait until it leaves its starting style and each transition ends.
	await expect
		.poll(() =>
			popup.evaluate((el) => {
				// The positioner holds the popup: only its own transitions count, not a spinner of the page.
				const root = el.closest<HTMLElement>("[data-side]") ?? el;
				return (
					!root.matches("[data-starting-style]") &&
					!root.querySelector("[data-starting-style]") &&
					root.getAnimations({ subtree: true }).every((a) => a.playState !== "running")
				);
			}),
		)
		.toBe(true);
	let last = -1;
	await expect
		.poll(async () => {
			const height = (await popup.boundingBox())?.height ?? 0;
			const same = height === last;
			last = height;
			return same;
		})
		.toBe(true);
}

/** The axe violations and the size faults of the page that shows, each one with the name of the page. */
async function scan(page: Page, where: string): Promise<string[]> {
	// A page that still changes gives a mixed reading: the deck theme of Slides loads after the
	// page, and axe then pairs the background of before with the text colour of after.
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				let timer = setTimeout(done, 250);
				const observer = new MutationObserver(() => {
					clearTimeout(timer);
					timer = setTimeout(done, 250);
				});
				observer.observe(document.body, { attributes: true, childList: true, subtree: true });
				setTimeout(done, 5000);
			}),
	);
	const { violations } = await new AxeBuilder({ page }).analyze();
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
	test(`has no axe violation: the sub-pages of Crew and Plan, ${scheme} theme`, async ({
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
		for (const href of SUB_PAGES) {
			await visit(page, href);
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
			await page.waitForLoadState("networkidle");
			found.push(...(await scan(page, href)));
		}
		expect(found).toEqual([]);
	});
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
		// Each section of the feature page.
		const parts = page.getByRole("navigation", { name: "Sections" }).getByRole("button");
		for (let i = 0; i < (await parts.count()); i++) {
			await parts.nth(i).click();
			await page.waitForLoadState("networkidle");
			found.push(...(await scan(page, `/flow/feature, section ${i + 1}`)));
		}
		// An open menu: its items are controls too. Only the sizes: axe counts a popup, which is
		// drawn at the end of the page, as content outside a landmark.
		await page.getByRole("button", { name: /^Account/ }).click();
		await expect(page.getByRole("menu")).toBeVisible();
		await settled(page.getByRole("menu"));
		found.push(...(await sizeFaults(page)).map((fault) => `account menu ${fault}`));
		await page.keyboard.press("Escape");
		// The full assistant, then an open select list.
		await page.keyboard.press("Control+j");
		const assistant = page.getByRole("complementary", { name: "Assistant" });
		await expect(assistant).toBeVisible();
		found.push(...(await scan(page, "assistant")));
		await assistant
			.getByRole("group", { name: "Mode" })
			.getByRole("button", { name: "Do" })
			.click();
		await assistant.getByRole("combobox", { name: "Permission", exact: true }).click();
		await expect(page.getByRole("listbox")).toBeVisible();
		await settled(page.getByRole("listbox"));
		found.push(...(await sizeFaults(page)).map((fault) => `assistant, permission list ${fault}`));
		await page.keyboard.press("Escape");
		await page.keyboard.press("Control+j");
		// Each step of a new project.
		await visit(page, "/projects");
		await page.getByRole("button", { name: "New project" }).click();
		const steps = page.getByRole("navigation", { name: "Steps" }).getByRole("button");
		await expect(steps).toHaveCount(5);
		for (let i = 0; i < 5; i++) {
			await steps.nth(i).click();
			found.push(...(await scan(page, `new project, step ${i + 1}`)));
		}
		await page.getByRole("button", { name: "All steps" }).click();
		await expect(page.getByRole("heading", { level: 1, name: "New project" })).toBeVisible();
		found.push(...(await scan(page, "new project, all steps")));
		expect(found).toEqual([]);
	});
	// The manual is no tab since wave 2: the scan opens it by its address.
	test(`has no axe violation: the manual, ${scheme} theme`, async ({ page }) => {
		page.setDefaultTimeout(10_000);
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
		await page.goto("/knowledge/manual");
		// The page has two articles: the lead has no name, the text has the name of the page.
		await expect(page.getByRole("article", { name: "Start" })).toBeVisible();
		if (scheme === "dark") await pickDarkTheme(page);
		await page.waitForLoadState("networkidle");
		expect(await scan(page, "/knowledge/manual")).toEqual([]);
	});
}
