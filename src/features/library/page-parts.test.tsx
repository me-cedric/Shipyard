import { render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "@/lib/i18n";
import { LibraryBack } from "./back-link";
import { LibraryPage, LinkedCard, LinkedRow, ListCard, ListColumn } from "./page-parts";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, ...props }: { to: string; className?: string; children?: React.ReactNode }) => (
		<a href={to} {...props} />
	),
}));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: I18nProvider });

describe("Library page parts", () => {
	it("draws the way back once, in the page header, above the title", () => {
		render(
			<LibraryBack slug="capabilities">
				<LibraryPage title="Specs" action={<button type="button">New change</button>}>
					<p>body</p>
				</LibraryPage>
			</LibraryBack>,
		);
		const back = screen.getAllByRole("link", { name: "Library" });
		expect(back).toHaveLength(1);
		expect(back[0]).toHaveAttribute("href", "/library/home");
		const header = back[0]?.closest("[data-page-header]");
		expect(header).not.toBeNull();
		const title = within(header as HTMLElement).getByRole("heading", { level: 1, name: "Specs" });
		expect(title).toHaveClass("text-44");
		expect(back[0]?.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(within(header as HTMLElement).getByRole("button", { name: "New change" })).toBeVisible();
	});

	it("keeps the way back above a page that is not built on LibraryPage, and hides it on the home", () => {
		const { rerender } = render(
			<LibraryBack slug="api">
				<h1>API</h1>
			</LibraryBack>,
		);
		expect(screen.getByRole("link", { name: "Library" })).toBeVisible();
		rerender(
			<LibraryBack slug="home">
				<h1>Library</h1>
			</LibraryBack>,
		);
		expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
	});

	it("replaces the way back on a sub-page", () => {
		render(
			<LibraryBack slug="reports">
				<LibraryPage title="Change request" back={<a href="/library/reports">Reports</a>} />
			</LibraryBack>,
		);
		expect(screen.getByRole("link", { name: "Reports" })).toBeVisible();
		expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
	});

	it("marks the selected card of a list, as a button or as a link", () => {
		render(
			<ListColumn>
				<ListCard name="auth" />
				<ListCard name="export" selected pills={<span>1 open question</span>} />
				<ListCard name="billing" selected render={(p) => <a href="/x" {...p} />} />
			</ListColumn>,
		);
		expect(screen.getByRole("button", { name: "auth" })).toHaveAttribute("aria-pressed", "false");
		const on = screen.getByRole("button", { name: /export/ });
		expect(on).toHaveAttribute("aria-pressed", "true");
		expect(on).toHaveClass("outline-accent", "bg-accent-tint", "min-h-control");
		expect(within(on).getByText("1 open question")).toBeVisible();
		expect(screen.getByRole("link", { name: "billing" })).toHaveAttribute("aria-current", "true");
	});

	it("draws a titled card of link rows", () => {
		render(
			<LinkedCard title="Linked">
				<LinkedRow label="Test plan" render={(p) => <a href="/library/test-plans" {...p} />} />
				<LinkedRow
					label="Which formats?"
					trailing={<span>Open</span>}
					render={(p) => <a href="/library/questions" {...p} />}
				/>
			</LinkedCard>,
		);
		const card = screen.getByRole("region", { name: "Linked" });
		expect(within(card).getByRole("heading", { level: 2, name: "Linked" })).toBeVisible();
		expect(within(card).getByRole("link", { name: "Test plan" })).toHaveAttribute(
			"href",
			"/library/test-plans",
		);
		expect(within(card).getByRole("link", { name: /Which formats\?\s*Open/ })).toBeVisible();
	});
});
