import { test } from "@playwright/test";
import { Walk } from "./walk";

// Architect, first hour: diagrams, the model, decisions, API, data, flows, the graph, the dossier.
test("architect", async ({ page }) => {
	const w = new Walk(page, { key: "architect", label: "Architect" });
	await w.start();

	await w.step(
		"Land on the decisions, open the diagrams",
		"the page that opens first: Design, Decisions, then the Diagrams tab",
		async () => {
			await w.landsOn("Library", "Decisions");
			await w.go("Library", "Diagrams");
			await w.see(page.getByText("order-process"), "no diagram in the list");
		},
	);

	await w.step("Open a diagram", "the diagram list, a diagram name", async () => {
		await w.click(page.getByRole("button", { name: /network/ }));
		// A diagram opens from its card: the card of the open diagram has Open.
		await w.click(page.getByRole("button", { name: "Open", exact: true }));
		await w.see(page.getByRole("button", { name: "Save" }), "no Save button on the diagram");
		if (await page.getByRole("button", { name: "Open outside" }).isVisible()) {
			w.confusing(
				"a draw.io diagram shows an icon, not the drawing: the person must click Open outside to see or edit it",
			);
		}
	});

	await w.step(
		"Read the architecture model",
		"the Architecture tab, the system model",
		async () => {
			await w.go("Library", "Architecture");
			await w.see(
				page.getByRole("group", { name: "Models" }).getByRole("button", { name: "system" }),
				"no model on the page",
			);
			await w.see(page.getByRole("figure", { name: /Model/ }), "no picture of the model");
		},
	);

	await w.step("Accept a proposed decision", "the proposed record, the Accept button", async () => {
		await w.go("Library", "Decisions");
		await w.click(page.getByRole("button", { name: /Ship a browser mock/ }));
		const accept = page.getByRole("button", { name: "Accept", exact: true });
		const reason = page.getByRole("textbox", { name: "Reason" });
		await w.until(
			() => reason.getAttribute("aria-required"),
			"true",
			"the Reason field shows no required mark",
		);
		await w.click(accept);
		await w.until(
			() => page.getByRole("alert").filter({ hasText: "Write a reason first" }).count(),
			1,
			"Accept shows no error line while the reason is empty",
		);
		await w.fill(reason, "Agreed in the design review.");
		await w.click(accept);
		await w.until(
			() => page.getByRole("button", { name: /Ship a browser mock.*Accepted/s }).count(),
			1,
			"the list still shows the record as Proposed",
		);
	});

	await w.step("Write a new decision", "the New decision button, a name, Create", async () => {
		await w.click(page.getByRole("button", { name: "New decision" }));
		await w.fill(
			page.getByRole("dialog").getByRole("textbox", { name: "Name" }),
			"Use SQLite for the mirror",
		);
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Create" }));
		await w.see(
			page.getByRole("button", { name: /Use SQLite for the mirror/ }),
			"the new record is not in the list",
		);
		// The record opens to read: Edit opens its form.
		await w.click(page.getByRole("main").getByRole("button", { name: "Edit", exact: true }));
		await w.see(
			page.getByRole("textbox", { name: "Context and problem statement" }),
			"no form for the new record",
		);
	});

	await w.step("Read the API contract", "the API tab, the contract", async () => {
		await w.go("Library", "API");
		await w.see(page.getByRole("button", { name: /^orders\.yaml Orders API/ }), "no API contract");
	});

	await w.step("Read the data model", "the Data tab, the tables", async () => {
		await w.go("Library", "Data");
		await w.see(page.getByRole("heading", { name: "orders", exact: true }), "no table on the page");
	});

	await w.step("Read the network flows", "the Flows tab, the table, Export", async () => {
		await w.go("Library", "Network flows");
		await w.until(() => page.getByRole("table").getByRole("row").count(), 21, "no flow table");
		await w.click(page.getByRole("link", { name: "Open the full matrix" }));
		await w.see(page.getByRole("button", { name: "Export" }), "no way to export the flows");
	});

	await w.step("Find a diagram with the keyboard", "Ctrl+K, the name of a diagram", async () => {
		// "network" names the page Network flows too: the name of a diagram that no page has.
		await w.palette("context", "the palette finds no diagram by its name");
		await w.click(page.getByRole("button", { name: "Open", exact: true }));
		await w.see(
			page.getByRole("button", { name: "Save" }),
			"Enter only shows the diagram in the inspector: the page does not change and the inspector has no Open action",
		);
	});

	await w.step(
		"Find the decisions that no spec uses",
		"Design, Decisions, the Unused mark and filter",
		async () => {
			await w.go("Library", "Decisions");
			await w.see(
				page.getByRole("list", { name: "Decisions" }).getByText("No spec uses it").first(),
				"no visible mark on a decision that no spec cites",
			);
			const marked = await page
				.getByRole("list", { name: "Decisions" })
				.getByText("No spec uses it")
				.count();
			// The filter is in the page menu.
			await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
			await w.click(
				page.getByRole("menuitem", { name: "Show only the decisions that no spec uses" }),
			);
			await w.until(
				() => page.getByRole("list", { name: "Decisions" }).getByRole("button").count(),
				marked,
				"the Unused filter keeps a decision that a spec cites",
			);
		},
	);

	await w.step(
		"Hand over the dossier",
		"Knowledge, Documents, Export Architecture dossier",
		async () => {
			await w.go("Library", "Documents");
			// The documents that Shipyard writes are in the page menu.
			await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
			await w.click(page.getByRole("menuitem", { name: "Export Architecture dossier" }));
			await w.see(page.getByText(/^Exported:/), "no sign that the export finished");
		},
		true,
	);
});
