import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Chip } from "./chip";
import { IconButton } from "./icon-button";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { LinkButton, linkClass } from "./link-button";
import { Progress } from "./progress";
import { Ring } from "./ring";
import { Segmented } from "./segmented";
import { Select } from "./select";
import { Skeleton } from "./skeleton";
import { StepBar } from "./step-bar";
import { Switch } from "./switch";
import { Textarea } from "./textarea";
import { Tooltip } from "./tooltip";

const atomFiles = import.meta.glob("./*.tsx", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

describe("atoms, look pass 1", () => {
	it("Button primary uses the primary token, and lg is higher with its text colour kept", () => {
		renderApp(
			<>
				<Button variant="primary">Go</Button>
				<Button variant="primary" size="lg">
					Start
				</Button>
				<Button>Plain</Button>
			</>,
		);
		expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
			"bg-primary",
			"text-primary-fg",
			"min-h-control",
		);
		expect(screen.getByRole("button", { name: "Start" })).toHaveClass(
			"min-h-13",
			"text-17",
			"text-primary-fg",
		);
		expect(screen.getByRole("button", { name: "Plain" })).toHaveClass("border-n-7", "bg-surface-1");
	});

	it("IconButton outline is a square with a border", () => {
		renderApp(
			<IconButton label="Back" variant="outline">
				x
			</IconButton>,
		);
		expect(screen.getByRole("button", { name: "Back" })).toHaveClass(
			"size-(--control-h)",
			"border-n-7",
			"bg-surface-1",
		);
	});

	it("Badge is a pill, has the variant you and can show a dot", () => {
		renderApp(
			<Badge variant="you" dot>
				Yours
			</Badge>,
		);
		const tag = screen.getByText("Yours");
		expect(tag).toHaveClass(
			"rounded-full",
			"bg-attention-subtle",
			"text-attention-text",
			"text-13",
		);
		expect(tag.querySelector("[aria-hidden]")).toHaveClass("size-2", "bg-current");
	});

	it("Avatar has two sizes and a square look for an agent", () => {
		renderApp(
			<>
				<Avatar name="Ada Lovelace" />
				<Avatar name="Small One" size="s" />
				<Avatar name="Build Agent" agent />
			</>,
		);
		expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveClass(
			"size-8",
			"rounded-full",
			"text-n-12",
			"text-12",
		);
		expect(screen.getByRole("img", { name: "Small One" })).toHaveClass("size-7", "text-11");
		expect(screen.getByRole("img", { name: "Build Agent" })).toHaveClass(
			"rounded-sm",
			"bg-primary",
			"text-primary-fg",
		);
	});

	it("Input, Textarea, Select and Checkbox share the border and the surface of the field", () => {
		renderApp(
			<>
				<Input label="Name" />
				<Textarea label="Note" />
				<Select
					label="Lang"
					value="a"
					onValueChange={() => {}}
					items={[{ value: "a", label: "A" }]}
				/>
				<Checkbox label="Pick" />
				<Switch label="Flip" />
			</>,
		);
		for (const el of [
			screen.getByRole("textbox", { name: "Name" }),
			screen.getByRole("textbox", { name: "Note" }),
			screen.getByRole("combobox", { name: "Lang" }),
			screen.getByRole("checkbox", { name: "Pick" }),
		])
			expect(el).toHaveClass("border-n-7", "bg-surface-1");
		expect(screen.getByRole("combobox", { name: "Lang" })).toHaveClass("min-h-control");
		expect(screen.getByRole("switch", { name: "Flip" })).toHaveClass("border-n-7");
	});

	it("Segmented shows the choice as a white thumb on a grey track", () => {
		renderApp(
			<Segmented
				label="Theme"
				value="a"
				onValueChange={() => {}}
				items={[
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
				]}
			/>,
		);
		const group = screen.getByRole("group", { name: "Theme" });
		expect(group).toHaveClass("bg-n-4", "rounded-md");
		expect(group.querySelector("[data-segmented-thumb]")).toHaveClass("bg-surface-1", "shadow-1");
		expect(screen.getByRole("button", { name: "A" })).toHaveClass("min-h-control");
	});

	it("Progress fills with the accent, and with the attention colour when it is over", () => {
		const { rerender } = renderApp(<Progress value={2} max={5} label="Spend" />);
		const fill = () => screen.getByRole("progressbar", { name: "Spend" }).firstElementChild;
		expect(fill()).toHaveClass("bg-accent");
		rerender(<Progress value={7} max={5} label="Spend" over />);
		expect(fill()).toHaveClass("bg-attention-strong");
	});

	it("Kbd is a key cap, and the one of a tooltip is small", async () => {
		renderApp(
			<>
				<Kbd>K</Kbd>
				<Tooltip label="Find" shortcut="F">
					<button type="button">Anchor</button>
				</Tooltip>
			</>,
		);
		expect(screen.getByText("K")).toHaveClass("h-9", "min-w-9", "bg-n-3");
		await userEvent.tab();
		expect(await screen.findByText("F")).toHaveClass("h-5");
		expect(screen.getByText("F")).not.toHaveClass("h-9");
	});

	it("Skeleton and Ring use the track token, and the ring has no gradient", () => {
		const { container } = renderApp(
			<>
				<Skeleton />
				<Ring value={1} max={4} label="Done">
					1
				</Ring>
			</>,
		);
		expect(container.firstElementChild).toHaveClass("bg-n-5");
		const ring = screen.getByRole("meter", { name: "Done" });
		expect(ring.querySelector("linearGradient")).toBeNull();
		expect(ring.querySelectorAll("circle")[1]).toHaveAttribute("stroke", "var(--accent)");
	});

	it("LinkButton is a button with the look of a link", async () => {
		const onClick = vi.fn();
		renderApp(<LinkButton onClick={onClick}>More</LinkButton>);
		const link = screen.getByRole("button", { name: "More" });
		expect(link).toHaveClass("min-h-control", "text-accent");
		expect(link).toHaveAttribute("type", "button");
		expect(linkClass).toContain("min-h-control");
		await userEvent.tab();
		await userEvent.keyboard("{Enter}");
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("Chip says its state only when it is a toggle", async () => {
		const onClick = vi.fn();
		renderApp(
			<>
				<Chip onClick={onClick}>Plain</Chip>
				<Chip selected>On</Chip>
				<Chip selected={false}>Off</Chip>
			</>,
		);
		expect(screen.getByRole("button", { name: "Plain" })).not.toHaveAttribute("aria-pressed");
		expect(screen.getByRole("button", { name: "Plain" })).toHaveClass("min-h-control", "bg-n-3");
		expect(screen.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "On" })).toHaveClass("bg-accent", "text-accent-fg");
		expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "false");
		await userEvent.click(screen.getByRole("button", { name: "Plain" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("StepBar marks the steps before the current one as done", () => {
		renderApp(<StepBar total={5} current={4} label="Step 4 of 5" />);
		const bars = [...screen.getByRole("img", { name: "Step 4 of 5" }).children];
		expect(bars.map((b) => b.getAttribute("data-step"))).toEqual([
			"done",
			"done",
			"done",
			"current",
			"todo",
		]);
		expect(bars[0]).toHaveClass("bg-primary");
		expect(bars[3]).toHaveClass("bg-accent");
	});

	it("no atom holds a hex colour or a gradient", () => {
		for (const [path, text] of Object.entries(atomFiles)) {
			if (path.endsWith(".test.tsx") || path.endsWith("brand-icon.tsx")) continue;
			expect(text, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b|gradient/);
		}
	});
});
