import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { cannedPrompt, itemTypeOf, PROMPT_KINDS, pageItemType } from "@/lib/assistant/prompts";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { AskOnItem } from "./ask-menu";

describe("canned prompts", () => {
	it("types a ref and a page, and writes the prompt in the chosen language", () => {
		expect(itemTypeOf("adr:0007")).toBe("decision");
		expect(itemTypeOf("pr:conn:3")).toBe("pullRequest");
		expect(itemTypeOf("conn:x")).toBeNull();
		expect(pageItemType("/design/diagrams")).toBe("diagram");
		expect(pageItemType("/home/inbox")).toBeNull();
		expect(cannedPrompt("en", "decision", "review", "adr:0007")).toBe(
			"Review this decision (adr:0007). List what is unclear, wrong or missing, the most serious first.",
		);
		expect(cannedPrompt("fr", "file", "tests")).toContain("les fichiers de ce projet");
		for (const kinds of Object.values(PROMPT_KINDS)) expect(kinds.length).toBeGreaterThan(2);
	});
});

describe("Ask menu", () => {
	it("opens the assistant with a canned prompt in the language of the preference", async () => {
		const user = userEvent.setup();
		mockState().prefs.promptLang = "fr";
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/design/decisions");
		await user.click(await screen.findByRole("button", { name: "Ask the assistant" }));
		await user.click(await screen.findByRole("menuitem", { name: "Explain" }));
		await waitFor(
			() =>
				expect(
					(screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).value,
				).toContain("les décisions de ce projet"),
			{ timeout: 10_000 },
		);
	}, 20_000);

	it("has no Ask button on a page of no item type", async () => {
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByRole("button", { name: "Ask the assistant" })).toBeNull();
	});
});

describe("Ask on a focused item", () => {
	it("opens on Shift+F10 and puts a prompt about the item in the draft", async () => {
		const user = userEvent.setup();
		const seen: string[] = [];
		render(
			<Providers>
				<ShellProvider>
					<button type="button" data-ask="adr:0007">
						item
					</button>
					<AskOnItem />
				</ShellProvider>
			</Providers>,
		);
		const item = await screen.findByRole("button", { name: "item" });
		item.focus();
		await user.keyboard("{Shift>}{F10}{/Shift}");
		const menu = await screen.findByRole("menu", { name: "Ask the assistant" });
		expect(menu).toBeVisible();
		seen.push(...screen.getAllByRole("menuitem").map((m) => m.textContent ?? ""));
		expect(seen).toEqual(["Explain", "Review", "Improve", "Risks"]);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(item).toHaveFocus());
	});
});
