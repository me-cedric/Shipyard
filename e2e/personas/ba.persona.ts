import { test } from "@playwright/test";
import { Walk } from "./walk";

// Business analyst, first hour: read a change, write the why, validate, split, a change from a title, capabilities, questions, a document.
test("business analyst", async ({ page }) => {
	const w = new Walk(page, { key: "ba", label: "Business analyst" });
	await w.start();

	await w.step(
		"Land on the specs, open the proposals",
		"the page that opens first: Library, Specs, then Flow, List",
		async () => {
			await w.landsOn("Library", "Specs");
			await w.go("Flow", "List");
			// The change add-export is a part of the feature "Bump dependencies".
			await w.see(page.getByRole("button", { name: /Bump dependencies/ }), "no change in the list");
		},
	);

	await w.step("Open a change", "the change row, Brief, Files of the change, Edit", async () => {
		await w.click(page.getByRole("button", { name: /Bump dependencies/ }));
		await w.click(
			page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Brief" }),
		);
		await w.click(page.getByRole("link", { name: "Files of the change" }));
		await w.click(page.getByRole("button", { name: "Edit", exact: true }));
		await w.see(
			page.getByRole("button", { name: "Next step: split into tickets" }),
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

	await w.step("Check the change", "the Check button, the answer", async () => {
		await w.click(page.getByRole("button", { name: "Check", exact: true }));
		await w.see(
			page.getByRole("region", { name: /^Problems found/ }).filter({ hasNotText: "Not checked" }),
			"Validate shows no result, neither a pass nor a list of problems",
		);
	});

	await w.step("Split the change into work items", "Next step: split into tickets", async () => {
		await w.click(page.getByRole("button", { name: "Next step: split into tickets" }));
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Preview" }));
		await w.see(
			page.getByRole("dialog").getByText("Export a report"),
			"the split shows no preview of the items",
		);
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Close" }));
		await w.click(page.getByRole("main").getByRole("button", { name: "Brief" }));
	});

	await w.step(
		"Write a change from a plain title",
		"New, a title, I write the spec, Create",
		async () => {
			await w.go("Flow", "List");
			await w.click(page.getByRole("button", { name: "New", exact: true }));
			await w.fill(page.getByRole("textbox", { name: "Title" }), "Add login page");
			await w.click(page.getByRole("button", { name: "I write the spec" }));
			await w.click(page.getByRole("button", { name: "Create" }));
			await w.see(
				page
					.getByRole("complementary", { name: "Inspector" })
					.getByRole("button", { name: /^change:add-login-page/ }),
				"the new change does not open from a plain title",
			);
			await w.click(
				page
					.getByRole("complementary", { name: "Inspector" })
					.getByRole("button", { name: "Open", exact: true }),
			);
			await w.until(
				() => page.getByRole("heading", { name: "What do you want to build?" }).count(),
				0,
				"the New page stays open after the change opens",
			);
			await w.see(
				page.getByRole("heading", { name: /add.login.page/i, level: 1 }),
				"the new change has no page",
			);
		},
	);

	await w.step("Find a change with the keyboard", "Ctrl+K, the name of a change", async () => {
		await w.palette("add-export", "the palette finds no change by its name");
	});

	await w.step("Read a capability", "Capabilities, auth, the requirements", async () => {
		await w.go("Library", "Specs");
		await w.click(page.getByRole("button", { name: /^auth/ }));
		await w.see(page.getByRole("list", { name: "Requirements" }), "no requirement list");
		await w.see(
			page.getByRole("region", { name: "Linked" }),
			"no link from a requirement to its tests and items",
		);
		await w.click(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Read" }));
		await w.see(
			page
				.getByRole("group", { name: "View" })
				.getByRole("button", { name: "Read", pressed: true }),
			"the capability does not open as a page to read",
		);
	});

	await w.step("Ask a question", "Questions, New question, a title", async () => {
		await w.go("Library", "Questions");
		await w.until(
			() => page.getByRole("button", { name: "Next step: split into tickets" }).count(),
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

	await w.step("Answer an open question", "the question card, the Answer field", async () => {
		const title = "Which export formats ship first?";
		const answered = page.getByText("Answered", { exact: true });
		const before = await answered.count();
		const answer = page.getByRole("textbox", { name: `Answer: ${title}` });
		await w.see(answer, "the question has no field for the answer");
		await w.fill(answer, "CSV first, then the spreadsheet.");
		await w.click(page.getByRole("button", { name: `Answer: ${title}`, exact: true }));
		await w.until(() => answered.count(), before + 1, "the card still reads open after Answer");
	});

	await w.step(
		"Write the client document",
		"Knowledge, Documents, New document",
		async () => {
			await w.go("Library", "Documents");
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
