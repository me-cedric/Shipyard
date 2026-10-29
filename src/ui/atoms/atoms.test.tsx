import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { IconButton } from "./icon-button";
import { type Status, StatusDot } from "./status-dot";
import { Switch } from "./switch";

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
