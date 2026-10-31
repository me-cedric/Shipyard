import { test } from "@playwright/test";
import { Walk } from "./walk";

// Architect, first hour: diagrams, the model, decisions, API, data, flows, the graph, the dossier.
test("architect", async ({ page }) => {
	const w = new Walk(page, { key: "architect", label: "Architect" });
	await w.start();

	await w.step("Land on the diagrams", "the page that opens first: Design, Diagrams", async () => {
		await w.landsOn("Design", "Diagrams");
		await w.see(page.getByText("order-process"), "no diagram in the list");
	});

	await w.step("Open a diagram", "the diagram list, a diagram name", async () => {
		await w.click(page.getByRole("button", { name: /network/ }));
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
			await w.go("Design", "Architecture");
			await w.see(page.getByRole("heading", { name: "system" }), "no model on the page");
		},
	);

	await w.step("Accept a proposed decision", "the proposed record, the Accept button", async () => {
		await w.go("Design", "Decisions");
		await w.click(page.getByRole("button", { name: /Ship a browser mock/ }));
		const accept = page.getByRole("button", { name: "Accept", exact: true });
		const comment = page.getByRole("textbox", { name: "Comment" });
		await w.until(
			() => comment.getAttribute("aria-required"),
			"true",
			"the Comment field shows no required mark",
		);
		await w.until(() => accept.isDisabled(), true, "Accept is on while the comment is empty");
		await w.fill(comment, "Agreed in the design review.");
		await w.click(accept);
		await w.until(
			() => page.getByRole("button", { name: /0003.*Accepted/s }).count(),
			1,
			"the list still shows the record as Proposed",
		);
	});

	await w.step("Write a new decision", "the ADR button, a name, Create", async () => {
		await w.click(page.getByRole("button", { name: "ADR", exact: true }));
		await w.fill(
			page.getByRole("dialog").getByRole("textbox", { name: "Name" }),
			"Use SQLite for the mirror",
		);
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Create" }));
		await w.see(
			page.getByRole("button", { name: /Use SQLite for the mirror/ }),
			"the new record is not in the list",
		);
		await w.see(
			page.getByRole("textbox", { name: "Context and problem statement" }),
			"no form for the new record",
		);
	});

	await w.step("Read the API contract", "the API tab, the contract", async () => {
		await w.go("Design", "API");
		await w.see(page.getByRole("heading", { name: "Orders API" }), "no API contract");
	});

	await w.step("Read the data model", "the Data tab, the tables", async () => {
		await w.go("Design", "Data");
		await w.see(page.getByRole("heading", { name: "orders", exact: true }), "no table on the page");
	});

	await w.step("Read the network flows", "the Flows tab, the table, Export", async () => {
		await w.go("Design", "Flows");
		await w.see(page.getByText("Flows (20)"), "no flow table");
		await w.see(page.getByRole("button", { name: "Export" }), "no way to export the flows");
	});

	await w.step("Find a diagram with the keyboard", "Ctrl+K, the name of a diagram", async () => {
		await w.palette("network", "the palette finds no diagram by its name");
		await w.see(
			page.getByRole("button", { name: "Save" }),
			"Enter only shows the diagram in the inspector: the page does not change and the inspector has no Open action",
		);
	});

	await w.step(
		"Find the decisions that no spec uses",
		"Design, Decisions, the Unused mark and filter",
		async () => {
			await w.go("Design", "Decisions");
			await w.see(
				page.getByRole("list", { name: "Decisions" }).getByText("Unused").first(),
				"no visible mark on a decision that no spec cites",
			);
			await w.click(page.getByRole("button", { name: "Unused", exact: true }));
			await w.until(
				() => page.getByRole("list", { name: "Decisions" }).getByRole("button").count(),
				await page.getByRole("list", { name: "Decisions" }).getByText("Unused").count(),
				"the Unused filter keeps a decision that a spec cites",
			);
		},
	);

	await w.step(
		"Hand over the dossier",
		"Knowledge, Documents, Export Architecture dossier",
		async () => {
			await w.go("Knowledge", "Documents");
			await w.click(page.getByRole("button", { name: "Export Architecture dossier" }));
			await w.see(page.getByText(/^Exported:/), "no sign that the export finished");
		},
		true,
	);
});
