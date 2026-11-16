import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { CommandPalette, type PaletteGroup } from "./command-palette";

function Bar({
	groups,
	onSubmit = () => {},
	onOpenChange = () => {},
}: {
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
				answer={<p>the answer</p>}
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
});
