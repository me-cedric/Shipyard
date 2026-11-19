import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { CommandPalette, type PaletteGroup } from "./command-palette";

function Bar({
	groups,
	onSubmit = () => {},
	onOpenChange = () => {},
	answered,
}: {
	answered?: boolean;
	groups: PaletteGroup[];
	onSubmit?: (text: string) => unknown;
	onOpenChange?: (open: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const ref = useRef<HTMLInputElement>(null);
	return (
		<>
			<button type="button">before</button>
			<CommandPalette
				open={open}
				onOpenChange={(o) => {
					setOpen(o);
					onOpenChange(o);
				}}
				groups={groups}
				answer={
					<>
						<p>the answer</p>
						<input aria-label="Reply" />
					</>
				}
				answered={answered}
				text={text}
				onTextChange={setText}
				onSubmit={onSubmit}
				inputRef={ref}
				shortcut="Ctrl+K"
			/>
		</>
	);
}

const field = () => screen.getByRole("combobox", { name: "Ask or tell Shipyard" });
const go = (onSelect = () => {}): PaletteGroup[] => [
	{
		id: "g",
		heading: "Go to",
		items: [
			{ id: "a", label: "Alpha", onSelect },
			{ id: "b", label: "Beta", onSelect: () => {} },
		],
	},
];

describe("CommandPalette", () => {
	it("opens the panel on focus, with the answer, the headings and the shortcut", async () => {
		renderApp(<Bar groups={go()} />);
		expect(screen.queryByText("the answer")).toBeNull();
		expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
		await userEvent.click(field());
		expect(screen.getByText("the answer")).toBeInTheDocument();
		expect(screen.getByText("Go to")).toBeInTheDocument();
	});

	it("selects an item by a click and clears the text", async () => {
		const onSelect = vi.fn();
		renderApp(<Bar groups={go(onSelect)} />);
		await userEvent.type(field(), "alp");
		await userEvent.click(screen.getByText("Alpha"));
		expect(onSelect).toHaveBeenCalledOnce();
		expect(field()).toHaveValue("");
		expect(screen.queryByText("the answer")).toBeNull();
	});

	it("runs the item that an arrow key chose with Enter", async () => {
		const onSelect = vi.fn();
		const onSubmit = vi.fn();
		renderApp(<Bar groups={go(onSelect)} onSubmit={onSubmit} />);
		await userEvent.click(field());
		await userEvent.keyboard("{ArrowDown}{Enter}");
		expect(onSelect).toHaveBeenCalledOnce();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("sends the text with Enter when no item was chosen", async () => {
		const onSelect = vi.fn();
		const onSubmit = vi.fn();
		renderApp(<Bar groups={go(onSelect)} onSubmit={onSubmit} />);
		await userEvent.type(field(), "al{Enter}");
		expect(onSubmit).toHaveBeenCalledWith("al");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("closes on Escape and returns the focus", async () => {
		renderApp(<Bar groups={[]} />);
		const before = screen.getByRole("button", { name: "before" });
		before.focus();
		await userEvent.tab();
		expect(field()).toHaveFocus();
		await userEvent.keyboard("{Escape}");
		expect(screen.queryByText("the answer")).toBeNull();
		expect(before).toHaveFocus();
	});

	it("does not return the focus to the control of an earlier open", async () => {
		renderApp(<Bar groups={[]} />);
		const before = screen.getByRole("button", { name: "before" });
		before.focus();
		await userEvent.tab();
		await userEvent.keyboard("{Escape}");
		expect(before).toHaveFocus();
		// The second open comes from no control: the focus was on the page.
		before.blur();
		await userEvent.click(field());
		expect(screen.getByText("the answer")).toBeInTheDocument();
		await userEvent.keyboard("{Escape}");
		expect(screen.queryByText("the answer")).toBeNull();
		expect(before).not.toHaveFocus();
		expect(document.body).toHaveFocus();
	});

	it("covers the page area when open, with the large field and the Escape hint", async () => {
		const { container } = renderApp(<Bar groups={go()} />);
		expect(container.querySelector("[data-ask-layer]")).toBeNull();
		await userEvent.click(field());
		const layer = container.querySelector("[data-ask-layer]");
		expect(layer).toHaveClass("absolute", "inset-0");
		// The field is the same element: it keeps the focus.
		expect(layer).toContainElement(field());
		expect(field()).toHaveFocus();
		expect(screen.getByText("esc")).toBeInTheDocument();
		expect(screen.queryByText("Ctrl+K")).toBeNull();
	});

	it("draws each group as rows in one list, with the Enter hint on the active row", async () => {
		const groups = [
			...go(),
			{ id: "d", heading: "Do", items: [{ id: "c", label: "Gamma", onSelect: () => {} }] },
		];
		renderApp(<Bar groups={groups} />);
		await userEvent.click(field());
		const list = within(screen.getByRole("listbox"));
		expect(within(list.getByRole("group", { name: "Go to" })).getAllByRole("option")).toHaveLength(
			2,
		);
		expect(within(list.getByRole("group", { name: "Do" })).getAllByRole("option")).toHaveLength(1);
		expect(screen.queryByText("↵")).toBeNull();
		await userEvent.keyboard("{ArrowDown}");
		expect(within(list.getByRole("option", { name: "Alpha" })).getByText("↵")).toBeInTheDocument();
		await userEvent.keyboard("{ArrowDown}");
		expect(within(list.getByRole("option", { name: "Beta" })).getByText("↵")).toBeInTheDocument();
	});

	it("keeps the keys of a field of the answer out of the list, and closes on Escape", async () => {
		const onSelect = vi.fn();
		renderApp(<Bar groups={go(onSelect)} />);
		await userEvent.click(field());
		await userEvent.keyboard("{ArrowDown}");
		const reply = screen.getByRole("textbox", { name: "Reply" });
		await userEvent.click(reply);
		expect(reply).toHaveFocus();
		await userEvent.keyboard("ok{Enter}");
		expect(onSelect).not.toHaveBeenCalled();
		expect(reply).toHaveValue("ok");
		await userEvent.keyboard("{Escape}");
		expect(screen.queryByText("the answer")).toBeNull();
	});

	it("keeps each item under an answer, whatever the text", async () => {
		renderApp(<Bar groups={go()} answered />);
		await userEvent.type(field(), "what blocks");
		expect(screen.getAllByRole("option")).toHaveLength(2);
	});
});
