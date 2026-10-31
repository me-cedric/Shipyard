import { test } from "@playwright/test";
import { Walk } from "./walk";

// Tester, first hour: test plans and coverage, scenarios, quality checks, pull request checks, open risks.
test("tester", async ({ page }) => {
	const w = new Walk(page, { key: "tester", label: "Tester" });
	await w.start();

	await w.step(
		"Land on the test plans",
		"the page that opens first: Specs, Test plans",
		async () => {
			await w.landsOn("Specs", "Test plans");
		},
	);

	await w.step("Open the test plans", "the Test plans tab, the coverage figures", async () => {
		await w.click(
			page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Test plans" }),
		);
		await w.see(page.getByText("Scenario coverage"), "no coverage figure");
		await w.see(page.getByText("Requirements").first(), "no requirement count");
	});

	await w.step(
		"Find a requirement without a scenario",
		"the Broken marker or the Generate button",
		async () => {
			await w.see(
				page.getByRole("button", { name: "Generate scenarios for export" }),
				"no way to cover a requirement",
			);
			await w.see(
				page.getByText("No scenario").first(),
				"no visible mark on a requirement without a test",
			);
		},
	);

	await w.step("Generate the scenarios", "Generate scenarios for export", async () => {
		await w.click(page.getByRole("button", { name: "Generate scenarios for export" }));
		await w.see(page.getByText("Feature: export"), "the generated scenario does not open");
		if (await page.getByText("the requirement holds").first().isVisible()) {
			w.confusing(
				"the generated scenario is filler text (Given the context, When the user acts); the tester must rewrite it",
			);
		}
		await w.click(page.getByRole("button", { name: "Back" }));
	});

	await w.step("Write a new test plan", "New test plan, a name, Create", async () => {
		await w.click(page.getByRole("button", { name: "New test plan" }));
		await w.fill(page.getByRole("dialog").getByRole("textbox"), "checkout");
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Create" }));
		await w.until(() => page.getByRole("dialog").count(), 0, "the dialog stays open");
	});

	await w.step("Run the project checks", "Code, Quality, Run pnpm test", async () => {
		await w.go("Code", "Quality");
		await w.click(page.getByRole("button", { name: "Run pnpm test" }));
		await w.click(page.getByRole("button", { name: "Run secrets" }));
		await w.see(page.getByText("Findings").first(), "no findings list");
	});

	await w.step(
		"Check the checks of a pull request",
		"Pull requests, a row with CI failing",
		async () => {
			await w.go("Code", "Pull requests");
			await w.click(page.getByRole("button", { name: /#43 Audit the keychain use/ }));
			await w.see(
				page.getByRole("heading", { name: /Checks/ }),
				"no Checks section on the pull request",
			);
			await w.see(page.getByText("CI failing").first(), "the failing check is not named");
		},
	);

	await w.step("Find a page with the keyboard", "Ctrl+K, the name of a page", async () => {
		await w.palette("Test plans", "the palette finds no page by its name (Test plans)");
	});

	await w.step(
		"List the open risks",
		"Specs, Questions, the Risk kind and the Open status",
		async () => {
			await w.go("Specs", "Questions");
			await w.see(page.getByText("Claim stamps need a tracker comment write"), "no open risk");
		},
	);

	await w.step(
		"See what needs me",
		"Home, Needs you",
		async () => {
			await w.go("Home", "Inbox");
			await w.see(page.getByRole("heading", { name: "Needs you" }), "no inbox");
		},
		true,
	);
});
