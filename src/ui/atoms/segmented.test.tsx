import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { Segmented } from "./segmented";

const items = [
	{ value: "a", label: "A" },
	{ value: "b", label: "B" },
	{ value: "c", label: "C" },
] as const;

describe("Segmented", () => {
	it("slides the thumb with a transform of 180 ms that reduced motion stops", async () => {
		const seen: string[] = [];
		renderApp(
			<Segmented label="Pick" value="a" onValueChange={(v) => seen.push(v)} items={[...items]} />,
		);
		const thumb = screen
			.getByRole("group", { name: "Pick" })
			.querySelector("[data-segmented-thumb]");
		expect(thumb).toHaveStyle({ transform: "translateX(0%)" });
		expect(thumb?.className).toContain("transition-transform");
		expect(thumb?.className).toContain("duration-(--duration-thumb)");
		expect(thumb?.className).toContain("motion-reduce:transition-none");
		await userEvent.click(screen.getByRole("button", { name: "C" }));
		expect(seen).toEqual(["c"]);
		// A pressed choice stays pressed.
		await userEvent.click(screen.getByRole("button", { name: "A" }));
		expect(seen).toEqual(["c"]);
	});

	it("moves the thumb to the new choice", () => {
		const { rerender } = renderApp(
			<Segmented label="Pick" value="a" onValueChange={() => {}} items={[...items]} />,
		);
		rerender(<Segmented label="Pick" value="c" onValueChange={() => {}} items={[...items]} />);
		const thumb = screen
			.getByRole("group", { name: "Pick" })
			.querySelector("[data-segmented-thumb]");
		expect(thumb).toHaveStyle({ transform: "translateX(200%)" });
	});

	it("fits each choice to its label with no thumb, and keeps the reason of a choice that is off", () => {
		renderApp(
			<Segmented
				fit
				label="Pick"
				value="a"
				onValueChange={() => {}}
				items={[...items, { value: "d", label: "D", disabled: true, reason: "Needs a code host" }]}
			/>,
		);
		const group = screen.getByRole("group", { name: "Pick" });
		expect(group.querySelector("[data-segmented-thumb]")).toBeNull();
		expect(screen.getByRole("button", { name: "A", pressed: true }).className).toContain(
			"data-[pressed]:bg-surface-1",
		);
		const off = screen.getByRole("button", { name: "D" });
		expect(off).toBeDisabled();
		expect(off).toHaveAttribute("aria-description", "Needs a code host");
	});
});
