import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { AskBar } from "./ask-bar";
import { AttentionCard } from "./attention-card";
import { Door } from "./door";
import { PlaceMenu } from "./place-menu";
import { SectionSwitch } from "./section-switch";
import { SettingsRow } from "./settings-row";
import { StageLine } from "./stage-line";

const PLACES = [
	{ id: "today", label: "Today", icon: <i />, current: true },
	{ id: "flow", label: "Flow", icon: <i />, count: 3 },
];

// app-redesign REQ-026, REQ-028: shared components of the redesign. A control is 44 px high or more (`min-h-control`).
describe("PlaceMenu", () => {
	it("lists the places, marks the current one, shows a count and puts the end entry last", () => {
		renderApp(<PlaceMenu items={PLACES} end={{ id: "setup", label: "Setup", icon: <i /> }} />);
		const nav = screen.getByRole("navigation", { name: "Places" });
		const links = within(nav).getAllByRole("link");
		expect(links.map((l) => l.textContent)).toEqual(["Today", "Flow 3", "Setup"]);
		expect(links[0]).toHaveAttribute("aria-current", "page");
		expect(links[1]).not.toHaveAttribute("aria-current");
		for (const l of links) expect(l).toHaveClass("min-h-control");
	});

	it("keeps the names for assistive tools in the narrow form", () => {
		renderApp(<PlaceMenu narrow items={PLACES} />);
		expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
		expect(screen.getByText("Today")).toHaveClass("sr-only");
	});

	it("draws the link with the render prop of the caller", () => {
		renderApp(
			<PlaceMenu
				items={PLACES}
				renderLink={(p, props) => (
					<a href={`/${p.id}`} {...props}>
						{props.children}
					</a>
				)}
			/>,
		);
		expect(screen.getByRole("link", { name: "Flow 3" })).toHaveAttribute("href", "/flow");
	});
});

describe("AskBar", () => {
	it("has one named field, sends the text on Enter and clears it", async () => {
		const onSubmit = vi.fn();
		renderApp(<AskBar onSubmit={onSubmit} />);
		const field = screen.getByRole("textbox", { name: "Ask or tell Shipyard" });
		expect(field).toHaveClass("min-h-control");
		await userEvent.type(field, "   {Enter}");
		expect(onSubmit).not.toHaveBeenCalled();
		await userEvent.type(field, "plan the release{Enter}");
		expect(onSubmit).toHaveBeenCalledWith("plan the release");
		expect(field).toHaveValue("");
	});

	it("lets a shortcut focus the field", () => {
		const ref = createRef<HTMLInputElement>();
		const onFocus = vi.fn();
		renderApp(<AskBar onSubmit={() => {}} inputRef={ref} onFocus={onFocus} />);
		ref.current?.focus();
		expect(onFocus).toHaveBeenCalled();
		expect(screen.getByRole("textbox")).toHaveFocus();
	});
});

describe("StageLine", () => {
	it("names the five stages, the done ones and the current one in text", () => {
		renderApp(<StageLine stage="build" />);
		const list = screen.getByRole("list", { name: "Stages" });
		const items = within(list).getAllByRole("listitem");
		expect(items.map((i) => i.textContent)).toEqual([
			"Idea done",
			"Spec done",
			"Build current",
			"Review",
			"Ready",
		]);
		expect(items[2]).toHaveAttribute("aria-current", "step");
		// The shape tells the state too: a check for a done stage, none for the others.
		expect(items.map((i) => i.querySelectorAll("svg").length)).toEqual([1, 1, 0, 0, 0]);
	});

	it("shows a mark as text with a shape", () => {
		renderApp(<StageLine stage="review" mark="needs_you" />);
		expect(screen.getByText("Review, needs you")).toBeInTheDocument();
		renderApp(<StageLine stage="review" mark="blocked" />);
		expect(screen.getByText("Review, blocked")).toBeInTheDocument();
		expect(screen.queryByText("Stopped")).toBeNull();
	});
});

describe("AttentionCard", () => {
	it("shows who asks, the title and the answer controls, in the attention colour", () => {
		renderApp(
			<AttentionCard who="Ana" title="Approve the plan">
				<button type="button">Approve</button>
			</AttentionCard>,
		);
		const card = screen.getByRole("article");
		expect(card).toHaveClass("outline-attention");
		expect(within(card).getByText("Ana")).toBeInTheDocument();
		expect(within(card).getByRole("heading", { name: "Approve the plan" })).toBeInTheDocument();
		expect(within(card).getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});
});

describe("SectionSwitch", () => {
	const items = [
		{ id: "a", label: "Alpha", current: true },
		{ id: "b", label: "Beta" },
	];

	it("is one segmented control of buttons that wraps and marks the current one", async () => {
		const onSelect = vi.fn();
		renderApp(<SectionSwitch label="Views" items={items} onSelect={onSelect} />);
		const nav = screen.getByRole("navigation", { name: "Views" });
		expect(within(nav).getByRole("list")).toHaveClass("flex-wrap");
		expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
		const beta = screen.getByRole("button", { name: "Beta" });
		expect(beta).toHaveClass("min-h-control");
		await userEvent.click(beta);
		expect(onSelect).toHaveBeenCalledWith("b");
	});

	it("draws links with the render prop", () => {
		renderApp(
			<SectionSwitch
				label="Views"
				items={items}
				renderItem={(i, props) => (
					<a href={`/${i.id}`} {...props}>
						{i.label}
					</a>
				)}
			/>,
		);
		expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("aria-current", "page");
		expect(screen.getByRole("link", { name: "Beta" })).toHaveClass("min-h-control");
	});
});

describe("Door", () => {
	it("is a large tile with a name and the count of items that wait", async () => {
		const onClick = vi.fn();
		renderApp(<Door label="Specs" icon={<i />} count={4} onClick={onClick} />);
		const tile = screen.getByRole("button", { name: "Specs 4" });
		expect(tile).toHaveClass("min-h-control");
		await userEvent.click(tile);
		expect(onClick).toHaveBeenCalled();
	});

	it("shows no count when nothing waits", () => {
		renderApp(<Door label="Specs" icon={<i />} count={0} />);
		expect(screen.getByRole("button", { name: "Specs" })).toBeInTheDocument();
	});

	it("draws the tile with the render prop", () => {
		renderApp(
			<Door
				label="Specs"
				icon={<i />}
				render={(props) => (
					<a href="/specs" {...props}>
						{props.children}
					</a>
				)}
			/>,
		);
		expect(screen.getByRole("link", { name: "Specs" })).toHaveAttribute("href", "/specs");
	});
});

describe("value row (SettingsRow)", () => {
	it("is a row of 60 px or more with a name, a value and an action at the end", () => {
		renderApp(
			<SettingsRow label="Branch">
				<span>main</span>
				<button type="button">Change</button>
			</SettingsRow>,
		);
		const row = screen.getByRole("group", { name: "Branch" });
		expect(row).toHaveClass("min-h-15");
		expect(within(row).getByText("main")).toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Change" })).toBeInTheDocument();
	});
});
