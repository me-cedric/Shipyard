import { test } from "@playwright/test";
import { Walk } from "./walk";

// Junior, first hour: the learning path, an explanation, the glossary, the handbook, the manual, a question to the assistant, Get started.
test("junior", async ({ page }) => {
	const w = new Walk(page, { key: "junior", label: "Junior" });
	await w.start();

	await w.step(
		"Land on the learning path",
		"the page that opens first: Knowledge, Learn",
		async () => {
			await w.landsOn("Knowledge", "Learn");
			await w.see(page.getByText("0/10"), "no progress on the path");
		},
	);

	await w.step("Open the first step of the path", "the step title, then the ref chip", async () => {
		await w.click(page.getByText("Use Tauri"));
		if (!(await page.getByRole("button", { name: "Explain", exact: true }).first().isVisible())) {
			w.confusing(
				"the step title looks like a link and does nothing: only the small ref chip opens the item",
			);
			await w.click(page.getByRole("button", { name: /adr:0001/ }));
		}
		await w.see(
			page.getByRole("button", { name: "Explain", exact: true }).first(),
			"no Explain action on the item",
		);
	});

	await w.step("Ask for an explanation", "Explain in the inspector", async () => {
		await w.click(page.getByRole("button", { name: "Explain", exact: true }).first());
		await w.see(page.getByText("is part of the project graph"), "the assistant gives no answer");
	});

	await w.step("Look up a word", "the Glossary card, a word and its spec", async () => {
		await w.go("Knowledge", "Learn");
		await w.see(
			page.getByText("the act of a person who proves who they are"),
			"no definition for login",
		);
		await w.click(page.getByRole("button", { name: /spec:auth/ }).first());
	});

	await w.step("Read the handbook", "Handbook, a page, Read", async () => {
		await w.go("Knowledge", "Handbook");
		await w.click(page.getByRole("button", { name: "Getting started" }));
		await w.see(
			page.getByText("first, then the architecture overview"),
			"the page does not show its text",
		);
	});

	await w.step(
		"Find the manual with the keyboard",
		"Ctrl+K, the words of the manual action",
		async () => {
			await w.palette(
				"manual",
				"the palette has no action for the manual of the page (the guide says it has)",
			);
		},
	);

	await w.step("Read the manual", "Manual, the page of the manual", async () => {
		await w.go("Knowledge", "Manual");
		await w.see(
			page.getByRole("heading", { name: "Manual", exact: true }).first(),
			"no manual page",
		);
	});

	await w.step(
		"Ask the assistant a question",
		"the Assistant button in the top bar, Message, Send",
		async () => {
			const message = page.getByRole("textbox", { name: "Message" });
			if (!(await message.isVisible()))
				await w.click(page.getByRole("button", { name: "Assistant" }).first());
			await w.fill(message, "What is the polling sync?");
			await w.click(page.getByRole("button", { name: "Send", exact: true }).last());
			await w.see(
				page.getByText("What is the polling sync?").first(),
				"the question does not appear",
			);
			const tabs = page.getByRole("navigation", { name: "Tabs" });
			if (await tabs.evaluate((n) => n.scrollWidth > n.clientWidth)) {
				w.confusing("with the assistant and the inspector open, the tab bar is cut off at 1440 px");
			}
		},
	);

	await w.step("Follow the Get started list", "Home, a step of Get started", async () => {
		await w.go("Home", "Inbox");
		await w.click(page.getByText("Connect a code host"));
		await w.until(
			() => page.url().includes("/settings/"),
			true,
			"the step does not open the setting",
		);
	});

	await w.step(
		"See the whole project",
		"Knowledge, Graph",
		async () => {
			await w.go("Knowledge", "Graph");
			await w.see(page.getByRole("button", { name: "Table view" }), "no table view of the graph");
		},
		true,
	);
});
