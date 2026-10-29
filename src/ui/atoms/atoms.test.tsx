import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { IconButton } from "./icon-button";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { Select } from "./select";
import { Skeleton } from "./skeleton";
import { type Status, StatusDot } from "./status-dot";
import { Switch } from "./switch";
import { Tooltip } from "./tooltip";

describe("atoms", () => {
	it("Button calls onClick", async () => {
		const onClick = vi.fn();
		renderApp(<Button onClick={onClick}>Go</Button>);
		await userEvent.click(screen.getByRole("button", { name: "Go" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("IconButton has an accessible name", () => {
		renderApp(<IconButton label="Close">x</IconButton>);
		expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
	});

	it("Checkbox toggles with the keyboard", async () => {
		renderApp(<Checkbox label="Pick" />);
		const box = screen.getByRole("checkbox", { name: "Pick" });
		await userEvent.tab();
		expect(box).toHaveFocus();
		await userEvent.keyboard(" ");
		expect(box).toBeChecked();
		await userEvent.keyboard(" ");
		expect(box).not.toBeChecked();
	});

	it("Switch toggles with the keyboard", async () => {
		renderApp(<Switch label="Flip" />);
		const sw = screen.getByRole("switch", { name: "Flip" });
		await userEvent.tab();
		await userEvent.keyboard(" ");
		expect(sw).toBeChecked();
	});

	it("StatusDot has a distinct shape per status", () => {
		const statuses: Status[] = ["success", "warning", "danger", "info", "active", "idle"];
		const shapes = statuses.map((status) => {
			const { unmount, container } = renderApp(<StatusDot status={status} />);
			const shape = container.querySelector("svg")?.getAttribute("data-shape");
			unmount();
			return shape;
		});
		expect(new Set(shapes).size).toBe(statuses.length);
	});
});

const atomFiles = import.meta.glob("./*.tsx", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

describe("atoms (REQ-004, REQ-014)", () => {
	it("Button has all its variants, and a disabled one ignores the keyboard", async () => {
		const onClick = vi.fn();
		renderApp(
			<>
				<Button variant="primary">P</Button>
				<Button variant="ghost">G</Button>
				<Button variant="danger">D</Button>
				<Button disabled onClick={onClick}>
					Off
				</Button>
			</>,
		);
		expect(screen.getAllByRole("button")).toHaveLength(4);
		expect(screen.getByRole("button", { name: "Off" })).toBeDisabled();
		await userEvent.tab();
		await userEvent.tab();
		await userEvent.tab();
		await userEvent.keyboard("{Enter}");
		expect(onClick).not.toHaveBeenCalled();
	});

	it("Button is reached by Tab and fires on Enter and Space", async () => {
		const onClick = vi.fn();
		renderApp(<Button onClick={onClick}>Go</Button>);
		await userEvent.tab();
		expect(screen.getByRole("button", { name: "Go" })).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await userEvent.keyboard(" ");
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	it("IconButton shows the name and the shortcut in its tooltip, and nothing else", async () => {
		renderApp(
			<IconButton label="Search" shortcut="⌘K">
				x
			</IconButton>,
		);
		await userEvent.tab();
		const tip = await screen.findByText("Search", { selector: "[data-popup-open], div" });
		expect(tip).toHaveTextContent(/^Search⌘K$/);
	});

	it("Tooltip shows its label on focus", async () => {
		renderApp(
			<Tooltip label="Tip">
				<button type="button">Anchor</button>
			</Tooltip>,
		);
		await userEvent.tab();
		expect(await screen.findByText("Tip")).toBeInTheDocument();
	});

	it("Input takes the keyboard, has an accessible name and a disabled state", async () => {
		renderApp(
			<>
				<Input label="Name" />
				<Input label="Locked" disabled />
			</>,
		);
		await userEvent.tab();
		expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
		await userEvent.keyboard("abc");
		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("abc");
		expect(screen.getByRole("textbox", { name: "Locked" })).toBeDisabled();
	});

	it("Input caption shows the noun without a second accessible name", () => {
		renderApp(<Input label="Name" caption />);
		expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
		expect(screen.getAllByText("Name")).toHaveLength(1);
	});

	it("Select opens with the keyboard and picks an item", async () => {
		const onValueChange = vi.fn();
		renderApp(
			<Select
				label="Language"
				value="a"
				onValueChange={onValueChange}
				items={[
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
				]}
			/>,
		);
		await userEvent.tab();
		expect(screen.getByRole("combobox", { name: "Language" })).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await userEvent.click(await screen.findByRole("option", { name: "B" }));
		expect(onValueChange).toHaveBeenCalledWith("b");
	});

	it("Checkbox and Switch show checked, unchecked and disabled states", () => {
		renderApp(
			<>
				<Checkbox label="On" defaultChecked />
				<Checkbox label="Off" />
				<Checkbox label="Locked" disabled />
				<Switch label="On2" defaultChecked />
				<Switch label="Locked2" disabled />
			</>,
		);
		expect(screen.getByRole("checkbox", { name: "On" })).toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Off" })).not.toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Locked" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(screen.getByRole("switch", { name: "On2" })).toBeChecked();
		expect(screen.getByRole("switch", { name: "Locked2" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});

	it("Switch can hide its text and keep its name", () => {
		renderApp(<Switch label="Flip" iconOnly />);
		expect(screen.getByRole("switch", { name: "Flip" })).toBeInTheDocument();
		expect(screen.queryByText("Flip")).toBeNull();
	});

	it("Badge renders every variant", () => {
		renderApp(
			<>
				{(["neutral", "accent", "success", "warning", "danger", "info"] as const).map((v) => (
					<Badge key={v} variant={v}>
						{v}
					</Badge>
				))}
			</>,
		);
		expect(screen.getAllByText(/neutral|accent|success|warning|danger|info/)).toHaveLength(6);
	});

	it("StatusDot names each status for assistive tools", () => {
		renderApp(<StatusDot status="danger" />);
		expect(screen.getByRole("img")).toHaveAccessibleName();
	});

	it("StatusDot loops only for an active run", () => {
		const looping = (status: Status) => {
			const { unmount, container } = renderApp(<StatusDot status={status} />);
			const loops = container.querySelector("svg")?.classList.contains("animate-status-pulse");
			unmount();
			return loops;
		};
		expect(looping("active")).toBe(true);
		for (const s of ["success", "warning", "danger", "info", "idle"] as const)
			expect(looping(s), s).toBe(false);
	});

	it("Avatar shows initials and names the person", () => {
		renderApp(<Avatar name="Cédric Meyer" />);
		expect(screen.getByRole("img", { name: "Cédric Meyer" })).toHaveTextContent("CM");
	});

	it("Kbd renders a kbd element", () => {
		renderApp(<Kbd>⌘K</Kbd>);
		expect(screen.getByText("⌘K").tagName).toBe("KBD");
	});

	it("Skeleton is hidden from assistive tools and does not animate", () => {
		const { container } = renderApp(<Skeleton className="h-row" />);
		const el = container.firstElementChild as HTMLElement;
		expect(el).toHaveAttribute("aria-hidden", "true");
		expect(el.className).not.toMatch(/animate-/);
	});

	it("no atom removes the focus ring or uses a shadow", () => {
		expect(Object.keys(atomFiles).length).toBeGreaterThanOrEqual(12);
		for (const [path, text] of Object.entries(atomFiles)) {
			if (path.endsWith(".test.tsx")) continue;
			expect(text, path).not.toMatch(/outline-none|outline-0|focus:outline|\bshadow/);
		}
	});
});
