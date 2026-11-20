import { test } from "@playwright/test";
import { Walk } from "./walk";

// Functional lead, first hour (the role "Product owner": no role of the team file is called functional lead): review a change, the constitution, open questions, decisions, the estimate, documents, slides, dashboards.
test("functional lead", async ({ page }) => {
	const w = new Walk(page, { key: "lead", label: "Product owner" });
	await w.start();

	await w.step(
		"Land on the list, open the changes",
		"the page that opens first: Flow, List, then the change rows",
		async () => {
			await w.landsOn("Flow", "List");
			await w.go("Flow", "List");
			await w.see(page.getByRole("button", { name: /add-billing/ }), "no change in the list");
		},
	);

	await w.step("Review a change", "the change row, Brief, Files of the change, Check", async () => {
		await w.click(page.getByRole("button", { name: /add-billing/ }));
		await w.click(
			page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Brief" }),
		);
		await w.click(page.getByRole("link", { name: "Files of the change" }));
		await w.see(
			page.getByRole("button", { name: "Check", exact: true }),
			"no way to check the change",
		);
		await w.click(page.getByRole("main").getByRole("button", { name: "Brief" }));
	});

	await w.step("Read the constitution", "the Constitution tab", async () => {
		await w.go("Library", "Project rules");
		await w.see(page.getByRole("heading", { name: "Project rules" }).first(), "no constitution");
		if (await page.getByText("## Principles").first().isVisible()) {
			w.confusing("the constitution opens as raw Markdown in a code editor, not as a page to read");
		}
		if (
			await page.getByRole("button", { name: "Next step: split into tickets" }).first().isVisible()
		) {
			w.confusing(
				"the inspector still shows the change from the previous page, with its Split action",
			);
		}
	});

	await w.step("List the open questions", "Questions, the Status filter", async () => {
		await w.go("Library", "Questions");
		// The filters are in the page menu.
		await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
		await w.click(page.getByRole("menuitem", { name: "Filters" }));
		await w.click(page.getByRole("combobox", { name: "Status" }));
		await w.click(page.getByRole("option", { name: "open" }));
		await w.see(
			page.getByText("The code host adapter ships first"),
			"the open filter hides an open question",
		);
	});

	await w.step("Find a page with the keyboard", "Ctrl+K, the name of a page", async () => {
		await w.palette("Project rules", "the palette finds no page by its name (Project rules)");
	});

	await w.step("Read a decision", "Design, Decisions, a record", async () => {
		await w.go("Library", "Decisions");
		await w.click(page.getByRole("button", { name: /Use Tauri/ }));
		await w.see(
			page.getByRole("region", { name: "Context and problem statement" }),
			"the record has no readable text",
		);
	});

	await w.step("Read the estimate", "Plan, Estimates, Costing", async () => {
		await w.go("Plan", "Estimates");
		// The amounts moved to the view Costing: the Summary shows days only.
		await w.click(page.getByRole("button", { name: "Costing", exact: true }));
		await w.see(page.getByText("Margin").first(), "no margin on the costing");
		if (await page.getByText("€0").first().isVisible()) {
			w.confusing(
				"cost and price read €0; the only hint (Unrated) is small text at the foot of the page, and Crew already holds day rates",
			);
		}
	});

	await w.step(
		"Export the functional documentation",
		"Knowledge, Documents, Export Functional documentation",
		async () => {
			await w.go("Library", "Documents");
			// The documents that Shipyard writes are in the page menu.
			await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
			await w.click(page.getByRole("menuitem", { name: "Export Functional documentation" }));
			await w.see(page.getByText(/^Exported:/), "no sign that the export finished");
		},
	);

	await w.step("Open the kickoff slides", "Slides, the deck card", async () => {
		await w.go("Library", "Slides");
		await w.click(page.getByRole("button", { name: /Kickoff/ }));
		await w.see(page.getByRole("button", { name: "Present" }), "no way to present the deck");
	});

	await w.step(
		"Read the dashboards",
		"Dashboards, the tiles",
		async () => {
			await w.go("Library", "Dashboards");
			await w.see(page.getByRole("heading", { name: "Questions" }), "no questions tile");
			if (await page.getByText("WaitingForAnswer").first().isVisible()) {
				w.confusing(
					"the Runs tile shows state codes (WaitingForAnswer, ChangesRequested), not words",
				);
			}
			await w.click(page.getByRole("button", { name: /^More / }).first());
			await w.click(page.getByRole("menuitem", { name: "Pin to Today" }));
		},
		true,
	);
});
