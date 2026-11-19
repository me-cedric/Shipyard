import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { StatePill, Stepper, Toggle, ValueButton } from "./controls";

/** A stepper that keeps its value, from 1 to 3. */
function Field({ seen }: { seen: (value: number) => void }) {
	const [value, setValue] = useState(2);
	return (
		<Stepper
			label="Agents at once"
			value={value}
			min={1}
			max={3}
			onValueChange={(v) => {
				seen(v);
				setValue(v);
			}}
		/>
	);
}

describe("the parts of the Setup pages (look pass 2)", () => {
	it("steps a number down and up, and stops at the bounds", async () => {
		const user = userEvent.setup();
		const seen = vi.fn();
		render(
			<Providers>
				<Field seen={seen} />
			</Providers>,
		);
		const group = within(await screen.findByRole("group", { name: "Agents at once" }));
		const less = group.getByRole("button", { name: "Less: Agents at once" });
		const more = group.getByRole("button", { name: "More: Agents at once" });
		for (const b of [less, more]) expect(b).toHaveClass("size-(--control-h)");
		expect(group.getByRole("status")).toHaveTextContent("2");
		await user.click(more);
		expect(group.getByRole("status")).toHaveTextContent("3");
		expect(more).toBeDisabled();
		await user.click(less);
		await user.click(less);
		expect(group.getByRole("status")).toHaveTextContent("1");
		expect(less).toBeDisabled();
		expect(seen.mock.calls.map(([v]) => v)).toEqual([3, 2, 1]);
	});

	it("draws the toggle as a switch with its name and its state", async () => {
		const user = userEvent.setup();
		const seen = vi.fn();
		render(
			<>
				<Toggle label="Auto-review" defaultChecked onCheckedChange={(on) => seen(on)} />
				<Toggle label="Sound" disabled reason="No sound device" />
			</>,
		);
		const toggle = screen.getByRole("switch", { name: "Auto-review" });
		expect(toggle).toBeChecked();
		expect(toggle).toHaveClass("h-(--control-h)");
		await user.click(toggle);
		expect(toggle).not.toBeChecked();
		expect(seen).toHaveBeenLastCalledWith(false);
		const off = screen.getByRole("switch", { name: "Sound" });
		expect(off).toHaveAttribute("aria-description", "No sound device");
		await user.click(off);
		expect(off).not.toBeChecked();
	});

	it("shows a value on a button, and a state as a pill with its words", async () => {
		const user = userEvent.setup();
		const open = vi.fn();
		render(
			<Providers>
				<ValueButton aria-label="Folder" mono onClick={open}>
					/work/alpha
				</ValueButton>
				<StatePill state="ready" />
				<StatePill state="fix" />
				<StatePill state="off">Not connected</StatePill>
			</Providers>,
		);
		const value = await screen.findByRole("button", { name: "Folder" });
		expect(value).toHaveTextContent("/work/alpha");
		expect(value).toHaveClass("min-h-control");
		await user.click(value);
		expect(open).toHaveBeenCalledOnce();
		for (const words of ["Ready", "To fix", "Not connected"])
			expect(screen.getByText(words)).toBeInTheDocument();
	});

	it("marks the pill of the open page, and gives each pill its own address", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/setup/computer");
		const pills = within(await screen.findByRole("navigation", { name: "This computer" }));
		const here = pills.getByRole("link", { name: "AI tools and connections" });
		expect(here).toHaveAttribute("aria-current", "page");
		expect(here).toHaveAttribute("href", "/setup/computer");
		expect(here).toHaveClass("min-h-control");
		const models = pills.getByRole("link", { name: "Models and rules" });
		expect(models).not.toHaveAttribute("aria-current");
		expect(models).toHaveAttribute("href", "/setup/computer?page=models");
		await user.click(models);
		await waitFor(() => expect(router.state.location.href).toBe("/setup/computer?page=models"));
		const moved = within(await screen.findByRole("navigation", { name: "This computer" }));
		await waitFor(() =>
			expect(moved.getByRole("link", { name: "Models and rules" })).toHaveAttribute(
				"aria-current",
				"page",
			),
		);
		expect(moved.getByRole("link", { name: "AI tools and connections" })).not.toHaveAttribute(
			"aria-current",
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
