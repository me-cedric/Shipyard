import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { cannedPrompt, itemTypeOf, PROMPT_KINDS, pageItemType } from "@/lib/assistant/prompts";
import { ShellProvider } from "@/lib/shell";
import { AskOnItem } from "./ask-menu";

describe("canned prompts", () => {
	it("types a ref and a page, and writes the prompt in the chosen language", () => {
		expect(itemTypeOf("adr:0007")).toBe("decision");
		expect(itemTypeOf("pr:conn:3")).toBe("pullRequest");
		expect(itemTypeOf("conn:x")).toBeNull();
		expect(pageItemType("/design/diagrams")).toBe("diagram");
		expect(pageItemType("/home/today")).toBeNull();
		expect(cannedPrompt("en", "decision", "review", "adr:0007")).toBe(
			"Review this decision (adr:0007). List what is unclear, wrong or missing, the most serious first.",
		);
		expect(cannedPrompt("fr", "file", "tests")).toContain("les fichiers de ce projet");
		for (const kinds of Object.values(PROMPT_KINDS)) expect(kinds.length).toBeGreaterThan(2);
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
