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
});
