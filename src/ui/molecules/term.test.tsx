import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { glossaryEn } from "@/lib/i18n/glossary";
import { renderApp } from "../test-utils";
import { Term, Terms } from "./term";

describe("Term", () => {
	it("shows one sentence on keyboard focus, and Tab reaches the link to the manual (REQ-008)", async () => {
		renderApp(
			<p>
				Link a <Term id="code-host">code host</Term> first.
			</p>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		await userEvent.tab();
		const word = screen.getByRole("button", { name: "code host" });
		expect(word).toHaveFocus();
		expect(word).toHaveAccessibleDescription(glossaryEn.terms["code-host"]);
		const popup = await screen.findByRole("dialog");
		expect(within(popup).getByText(glossaryEn.terms["code-host"])).toBeInTheDocument();
		await userEvent.tab();
		const link = within(popup).getByRole("link", { name: "Manual" });
		expect(link).toHaveAttribute("href", "/knowledge/manual");
		expect(link).toHaveFocus();
		await userEvent.tab({ shift: true });
		expect(word).toHaveFocus();
		await userEvent.tab();
		await userEvent.tab();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("shows the sentence on hover", async () => {
		renderApp(<Term id="issue-tracker">issue tracker</Term>);
		await userEvent.hover(screen.getByText("issue tracker"));
		const popup = await screen.findByRole("dialog");
		expect(within(popup).getByText(glossaryEn.terms["issue-tracker"])).toBeInTheDocument();
	});

	it("marks each glossary word of a text, with its ending", () => {
		renderApp(<Terms>Pull requests go to the code host. Specific text stays.</Terms>);
		expect(screen.getByRole("button", { name: "Pull requests" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "code host" })).toBeInTheDocument();
		expect(screen.getAllByRole("button")).toHaveLength(2);
	});

	it("has a sentence in each language for each term", async () => {
		const { glossaryFr } = await import("@/lib/i18n/glossary");
		const { glossaryDe } = await import("@/lib/i18n/de/glossary");
		const { glossaryEs } = await import("@/lib/i18n/es/glossary");
		for (const g of [glossaryFr, glossaryDe, glossaryEs])
			expect(Object.keys(g.terms).sort()).toEqual(Object.keys(glossaryEn.terms).sort());
	});
});
