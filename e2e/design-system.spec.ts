import { type ChildProcess, spawn } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The gallery route exists in the dev build only, and the e2e web server is a release build.
// This file starts its own dev server for the gallery, and uses the release server for the absence check.
const DEV = "http://localhost:4175";
const LAYERS = ["Tokens", "Atoms", "Molecules", "Organisms", "Templates"];

test.describe("gallery in the dev build", () => {
	test.use({ baseURL: DEV });
	let dev: ChildProcess;

	test.beforeAll(async () => {
		dev = spawn("pnpm", ["exec", "vite", "--port", "4175", "--strictPort"], { stdio: "ignore" });
		for (let i = 0; i < 120; i++) {
			if (
				await fetch(DEV).then(
					(r) => r.ok,
					() => false,
				)
			)
				return;
			await new Promise((r) => setTimeout(r, 500));
		}
		throw new Error("The dev server did not start");
	});
	test.afterAll(() => {
		dev.kill();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto("/dev/gallery");
		await expect(page.getByRole("button", { name: "Tokens" })).toBeVisible();
	});

	test("shows a page for each atomic layer", async ({ page }) => {
		for (const layer of LAYERS) {
			const button = page.getByRole("button", { name: layer });
			await button.click();
			await expect(button).toHaveAttribute("aria-current", "page");
			await expect(page.locator("main, #root").getByText(/\S/).first()).toBeVisible();
		}
		await page.getByRole("button", { name: "Atoms" }).click();
		for (const atom of [
			"Button",
			"IconButton",
			"Input",
			"Select",
			"Badge",
			"StatusDot",
			"Skeleton",
		])
			await expect(page.getByText(atom, { exact: true }).first()).toBeVisible();
	});

	test("reaches every layer button with Tab and shows a focus ring", async ({ page }) => {
		await page.getByRole("button", { name: LAYERS[0] }).focus();
		for (const [i, layer] of LAYERS.entries()) {
			if (i > 0) await page.keyboard.press("Tab");
			const focused = page.getByRole("button", { name: layer });
			await expect(focused).toBeFocused();
			const outline = await focused.evaluate((el) => {
				const s = getComputedStyle(el);
				return { style: s.outlineStyle, width: Number.parseFloat(s.outlineWidth) };
			});
			expect(outline.style).not.toBe("none");
			expect(outline.width).toBeGreaterThanOrEqual(2);
		}
		await page.keyboard.press("Shift+Tab");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("button", { name: "Organisms" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("switches the theme and the language", async ({ page }) => {
		// exact: the context bar also has a "Theme: Dark" button.
		await page.getByRole("button", { name: "Dark", exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await page.getByRole("button", { name: "Language" }).click();
		await expect(page.locator("html")).toHaveAttribute("lang", "fr");
		await expect(page.getByRole("button", { name: "Jetons" })).toBeVisible();
	});

	for (const theme of ["Light", "Dark"]) {
		for (const layer of LAYERS) {
			test(`has no axe violation: ${layer}, ${theme} theme`, async ({ page }) => {
				await page.getByRole("button", { name: theme, exact: true }).click();
				await page.getByRole("button", { name: layer }).click();
				// The nested Shell demo adds a second main and nav to the page: the landmark rules skip it, and
				// the real shell is checked on the real pages. label-content-name-mismatch: see Q-095.
				const { violations } = await new AxeBuilder({ page })
					.exclude("[data-shell-demo]")
					.disableRules([
						"label-content-name-mismatch",
						"landmark-no-duplicate-main",
						"landmark-main-is-top-level",
						"landmark-unique",
					])
					.analyze();
				expect(
					violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
				).toEqual([]);
			});
		}
	}
});

test("the release build has no gallery route", async ({ page }) => {
	await page.goto("/dev/gallery");
	await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Atoms" })).toHaveCount(0);
});
