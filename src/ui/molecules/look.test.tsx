import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { BackLink } from "./back-link";
import { Card } from "./card";
import { Option } from "./option";
import { PageHeader, PageSwitchContext } from "./page-header";
import { Row } from "./row";
import { TILE_GRID, Tile } from "./tile";

// update-app-redesign, look pass 1: the shared parts of `shared.css`.
describe("PageHeader", () => {
	it("draws a 44 px title, the way back above it and no icon tile", () => {
		const { container } = renderApp(
			<PageHeader icon={<svg data-icon />} title="Setup" back={<a href="/flow">Flow</a>} />,
		);
		const title = screen.getByRole("heading", { level: 1, name: "Setup" });
		expect(title).toHaveClass("text-44");
		expect(container.querySelector("[data-icon]")).toBeNull();
		const back = screen.getByRole("link", { name: "Flow" });
		expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	// The switch is the last part of the row: it stays at the right edge, so its tabs do not move
	// when the actions of a page change.
	it("draws the section switch of the place after the action, and claims it until it goes", () => {
		const release = vi.fn();
		const claim = vi.fn(() => release);
		const { unmount } = renderApp(
			<PageSwitchContext.Provider value={{ node: <nav aria-label="Scope" />, claim }}>
				<PageHeader title="Setup" action={<button type="button">Connect</button>} />
			</PageSwitchContext.Provider>,
		);
		const nav = screen.getByRole("navigation", { name: "Scope" });
		const action = screen.getByRole("button", { name: "Connect" });
		expect(action.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(claim).toHaveBeenCalledOnce();
		expect(release).not.toHaveBeenCalled();
		unmount();
		expect(release).toHaveBeenCalledOnce();
	});
});

describe("Card", () => {
	it("has no border, and takes the standard padding with `pad`", () => {
		render(
			<>
				<Card>plain</Card>
				<Card pad>padded</Card>
			</>,
		);
		expect(screen.getByText("plain")).not.toHaveClass("border");
		expect(screen.getByText("plain")).not.toHaveClass("px-6");
		expect(screen.getByText("padded")).toHaveClass("px-6", "shadow-2");
	});
});

describe("Row", () => {
	it("is a div of 60 px or more, or the element of the caller", () => {
		render(
			<>
				<Row className="py-2">value</Row>
				<Row render={(props) => <a href="/feature" {...props} />}>Open</Row>
			</>,
		);
		expect(screen.getByText("value")).toHaveClass("min-h-15", "py-2");
		const link = screen.getByRole("link", { name: "Open" });
		expect(link).toHaveAttribute("href", "/feature");
		expect(link).toHaveClass("min-h-15");
	});
});

describe("Option", () => {
	it("is a button that says its state and shows a trailing part", async () => {
		const onClick = vi.fn();
		render(
			<>
				<Option selected trailing={<span>Pick</span>} onClick={onClick}>
					The login page
				</Option>
				<Option selected={false}>The home page</Option>
			</>,
		);
		const on = screen.getByRole("button", { name: /^The login page/ });
		expect(on).toHaveAttribute("aria-pressed", "true");
		expect(on).toHaveClass(
			"min-h-15",
			"border-accent",
			"text-17",
			"text-n-12",
			"focus-visible:outline-offset-2",
		);
		expect(screen.getByRole("button", { name: "The home page" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		await userEvent.click(on);
		expect(onClick).toHaveBeenCalledOnce();
	});
});

describe("Tile", () => {
	it("is a named button with a hidden icon, and says its state", async () => {
		const onClick = vi.fn();
		render(
			<div className={TILE_GRID}>
				<Tile label="Developer" icon={<svg />} selected onClick={onClick} />
				<Tile label="Tester" selected={false} />
			</div>,
		);
		const on = screen.getByRole("button", { name: "Developer" });
		expect(on).toHaveAttribute("aria-pressed", "true");
		expect(on).toHaveClass(
			"min-h-control",
			"outline-accent",
			"text-17",
			"font-semibold",
			"text-n-12",
			"focus-visible:outline-offset-2",
		);
		expect(within(on).getByText("", { selector: "span" })).toHaveAttribute("aria-hidden", "true");
		expect(screen.getByRole("button", { name: "Tester" })).toHaveAttribute("aria-pressed", "false");
		expect(on.parentElement).toHaveClass("grid");
		await userEvent.click(on);
		expect(onClick).toHaveBeenCalledOnce();
	});
});

describe("BackLink", () => {
	it("shows a chevron and the name of the parent, on the element of the caller", () => {
		render(<BackLink label="Flow" render={(props) => <a href="/flow" {...props} />} />);
		const link = screen.getByRole("link", { name: "Flow" });
		expect(link).toHaveClass("min-h-control");
		expect(link.querySelector("svg")).not.toBeNull();
	});
});
