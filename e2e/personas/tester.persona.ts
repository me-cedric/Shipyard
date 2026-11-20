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
			await w.landsOn("Library", "Test plans");
		},
	);

	await w.step("Open the test plans", "the Test plans tab, the coverage figures", async () => {
		await w.go("Library", "Test plans");
		// The coverage figures are on the page "What is tested".
		await w.click(page.getByRole("link", { name: "What is tested" }));
		await w.see(page.getByRole("heading", { name: /^Passing \d+$/ }), "no coverage figure");
		await w.see(page.getByRole("heading", { name: /^Not covered \d+$/ }), "no requirement count");
	});

	await w.step(
		"Find a requirement without a scenario",
		"the Broken marker or the Generate button",
		async () => {
			// Requirements that no plan cites sit in the card "Not covered".
			await w.see(
				page.getByRole("region", { name: "Not covered" }).getByRole("button").first(),
				"no visible mark on a requirement without a test",
			);
			await w.see(
				page.getByRole("button", { name: "Write the missing tests" }),
				"no way to cover a requirement",
			);
		},
	);

	await w.step("Generate the scenarios", "Write the missing tests", async () => {
		await w.click(page.getByRole("button", { name: "Write the missing tests" }));
		// A plan opens as cards to read: the switch Text shows its text.
		await w.click(page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Text" }));
		await w.see(page.getByText("Feature: export"), "the generated scenario does not open");
		if (await page.getByText("the requirement holds").first().isVisible()) {
			w.confusing(
				"the generated scenario is filler text (Given the context, When the user acts); the tester must rewrite it",
			);
		}
		await w.click(page.getByRole("main").getByRole("link", { name: "Library", exact: true }));
	});

	await w.step("Write a new test plan", "New test plan, a name, Create", async () => {
		// New test plan is in the page menu.
		await w.go("Library", "Test plans");
		await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
		await w.click(page.getByRole("menuitem", { name: "New test plan" }));
		await w.fill(page.getByRole("dialog").getByRole("textbox"), "checkout");
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Create" }));
		await w.until(() => page.getByRole("dialog").count(), 0, "the dialog stays open");
	});

	await w.step("Run the project checks", "Flow, Health, Run Tests", async () => {
		await w.go("Flow", "Health");
		await w.click(page.getByRole("button", { name: "Run Tests" }));
		await w.click(page.getByRole("button", { name: "Run secrets" }));
		await w.see(page.getByText("Findings").first(), "no findings list");
	});

	await w.step(
		"Check the checks of a pull request",
		"Code, Now, a row with CI failing",
		async () => {
			await w.go("Code", "Now");
			await w.click(page.getByRole("link", { name: /^Audit the keychain use/ }));
			const checks = page
				.getByRole("navigation", { name: "Sections" })
				.getByRole("button", { name: "Checks", exact: true });
			await w.see(checks, "no Checks section on the pull request");
			await w.click(checks);
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
			await w.go("Library", "Questions");
			await w.see(
				page.getByText("Claim stamps need an issue tracker comment write"),
				"no open risk",
			);
		},
	);

	await w.step(
		"See what needs me",
		"Home, Needs you",
		async () => {
			await w.go("Today", "Needs you");
			await w.see(
				page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
				"no inbox",
			);
		},
		true,
	);
});
