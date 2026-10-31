import { test } from "@playwright/test";
import { Walk } from "./walk";

// Functional lead, first hour: review a change, the constitution, open questions, decisions, the estimate, documents, slides, dashboards.
test("functional lead", async ({ page }) => {
	const w = new Walk(page, { key: "lead", label: "Functional lead" });
	await w.start();

	await w.step("Land on the proposals", "the page that opens first: Specs, Proposals", async () => {
		await w.landsOn("Specs", "Proposals");
		await w.see(page.getByRole("button", { name: /add-billing/ }), "no change in the list");
	});

	await w.step("Review a change", "the change card, the sections", async () => {
		await w.click(page.getByRole("button", { name: /add-billing/ }));
		await w.see(page.getByRole("button", { name: "Validate" }), "no way to check the change");
		await w.click(page.getByRole("button", { name: "Back" }));
	});

	await w.step("Read the constitution", "the Constitution tab", async () => {
		await w.go("Specs", "Constitution");
		await w.see(page.getByRole("heading", { name: "Constitution" }).first(), "no constitution");
		if (await page.getByText("## Principles").first().isVisible()) {
			w.confusing("the constitution opens as raw Markdown in a code editor, not as a page to read");
		}
		if (await page.getByRole("button", { name: "Split into work items" }).first().isVisible()) {
			w.confusing(
				"the inspector still shows the change from the previous page, with its Split action",
			);
		}
	});

	await w.step("List the open questions", "Questions, the Status filter", async () => {
		await w.go("Specs", "Questions");
		await w.click(page.getByRole("combobox", { name: "Status" }));
		await w.click(page.getByRole("option", { name: "open" }));
		await w.see(
			page.getByText("The forge adapter ships first"),
			"the open filter hides an open question",
		);
	});

	await w.step("Find a page with the keyboard", "Ctrl+K, the name of a page", async () => {
		await w.palette("Constitution", "the palette finds no page by its name (Constitution)");
	});

	await w.step("Read a decision", "Design, Decisions, a record", async () => {
		await w.go("Design", "Decisions");
		await w.click(page.getByRole("button", { name: /Use Tauri/ }));
		await w.see(
			page.getByRole("textbox", { name: "Context and problem statement" }),
			"the record has no readable text",
		);
	});

	await w.step("Read the estimate", "Work, Estimates, Summary", async () => {
		await w.go("Work", "Estimates");
		await w.click(page.getByRole("tab", { name: "Summary" }));
		await w.see(page.getByText("Margin").first(), "no margin on the summary");
		if (await page.getByText("€0").first().isVisible()) {
			w.confusing(
				"cost and price read €0; the only hint (Unrated) is small text at the foot of the page, and Team already holds day rates",
			);
		}
	});

	await w.step(
		"Export the functional documentation",
		"Knowledge, Documents, Export Functional documentation",
		async () => {
			await w.go("Knowledge", "Documents");
			await w.click(page.getByRole("button", { name: "Export Functional documentation" }));
			await w.see(page.getByText(/^Exported:/), "no sign that the export finished");
		},
	);

	await w.step("Open the kickoff slides", "Slides, the deck card", async () => {
		await w.go("Knowledge", "Slides");
		await w.click(page.getByRole("button", { name: /Kickoff/ }));
		await w.see(page.getByRole("button", { name: "Present" }), "no way to present the deck");
	});

	await w.step(
		"Read the dashboards",
		"Dashboards, the tiles",
		async () => {
			await w.go("Knowledge", "Dashboards");
			await w.see(page.getByRole("heading", { name: "Questions" }), "no questions tile");
			if (await page.getByText("WaitingForAnswer").first().isVisible()) {
				w.confusing(
					"the Runs tile shows state codes (WaitingForAnswer, ChangesRequested), not words",
				);
			}
			await w.click(page.getByRole("button", { name: "Pin to Home" }).first());
		},
		true,
	);
});
