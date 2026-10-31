import { test } from "@playwright/test";
import { Walk } from "./walk";

// Business analyst, first hour: read a change, write the why, validate, split, a change from a title, capabilities, questions, a document.
test("business analyst", async ({ page }) => {
	const w = new Walk(page, { key: "ba", label: "Business analyst" });
	await w.start();

	await w.step("Land on the proposals", "the page that opens first: Specs, Proposals", async () => {
		await w.landsOn("Specs", "Proposals");
		await w.see(page.getByRole("button", { name: /add-export/ }), "no change in the list");
	});

	await w.step("Open a change", "the change card, then the Proposal section", async () => {
		await w.click(page.getByRole("button", { name: /add-export/ }));
		await w.see(
			page.getByRole("button", { name: "Split into work items" }),
			"no way to split the change",
		);
		await w.see(page.getByRole("textbox", { name: "Why" }), "no field for the reason");
	});

	await w.step("Write the reason of the change", "the Why field, Save", async () => {
		await w.fill(
			page.getByRole("textbox", { name: "Why" }),
			"Clients ask for the plan as a spreadsheet.",
		);
		await w.click(page.getByRole("button", { name: "Save", exact: true }));
	});

	await w.step("Check the change", "the Validate button, the answer", async () => {
		await w.click(page.getByRole("button", { name: "Validate" }));
		await w.see(
			page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /\S/ }),
			"Validate shows no result, neither a pass nor a list of problems",
		);
	});

	await w.step("Split the change into work items", "Split into work items", async () => {
		await w.click(page.getByRole("button", { name: "Split into work items" }));
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Preview" }));
		await w.see(
			page.getByRole("dialog").getByText("Export a report"),
			"the split shows no preview of the items",
		);
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Close" }));
		await w.click(page.getByRole("button", { name: "Back" }));
	});

	await w.step("Write a change from a plain title", "New change, a title, Create", async () => {
		await w.click(page.getByRole("button", { name: "New change" }));
		await w.fill(page.getByRole("dialog").getByRole("textbox"), "Add login page");
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Create" }));
		await w.until(() => page.getByRole("dialog").count(), 0, "the dialog stays open");
		await w.see(
			page.getByRole("heading", { name: "Add login page" }),
			"the new change does not open from a plain title",
		);
	});

	await w.step("Find a change with the keyboard", "Ctrl+K, the name of a change", async () => {
		await w.palette("add-export", "the palette finds no change by its name");
	});

	await w.step("Read a capability", "Capabilities, auth, the requirements", async () => {
		await w.go("Specs", "Capabilities");
		await w.click(page.getByRole("button", { name: /^auth/ }));
		await w.see(page.getByText("REQ-001"), "no requirement list");
		await w.see(page.getByText("Backlinks"), "no link from a requirement to its tests and items");
		await w.click(page.getByRole("tab", { name: "Spec", exact: true }));
		await w.see(
			page.getByRole("article", { name: "Spec" }),
			"the capability does not open as a page to read",
		);
	});

	await w.step("Ask a question", "Questions, New question, a title", async () => {
		await w.go("Specs", "Questions");
		await w.until(
			() => page.getByRole("button", { name: "Split into work items" }).count(),
			0,
			"the inspector still shows the change from the previous page, with its Split action",
		);
		await w.click(page.getByRole("button", { name: "New question" }));
		const dialog = page.getByRole("dialog");
		await w.fill(
			dialog.getByRole("textbox", { name: "Title" }),
			"Who signs off the export format?",
		);
		await w.click(dialog.getByRole("button", { name: /Create|Save/ }));
		await w.until(() => page.getByRole("dialog").count(), 0, "the dialog stays open");
	});

	await w.step("Answer an open question", "the question row, the Status field", async () => {
		const dialog = page.getByRole("dialog");
		const answered = page.getByText("answered", { exact: true });
		const before = await answered.count();
		await w.click(page.getByText("Which export formats ship first?"));
		await w.click(dialog.getByRole("combobox", { name: "Status" }));
		await w.click(page.getByRole("option", { name: "answered" }));
		const answer = dialog.getByRole("textbox", { name: "Answer" });
		await w.see(answer, "the question has no field for the answer");
		await w.until(
			() => answer.evaluate((e) => e === document.activeElement),
			true,
			"the cursor is not in the Answer field",
		);
		await w.fill(answer, "CSV first, then the spreadsheet.");
		await w.click(dialog.getByRole("button", { name: "Save" }));
		await w.until(() => answered.count(), before + 1, "the card still reads open after Save");
	});

	await w.step(
		"Write the client document",
		"Knowledge, Documents, New document",
		async () => {
			await w.go("Knowledge", "Documents");
			await w.click(page.getByRole("button", { name: "New document" }));
			await w.fill(page.getByRole("dialog").getByRole("textbox"), "Functional scope");
			await w.click(page.getByRole("dialog").getByRole("button", { name: "Create" }));
			await w.see(
				page.getByRole("button", { name: /Functional scope/ }),
				"the new document is not in the list",
			);
		},
		true,
	);
});
