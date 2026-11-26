import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./switch";

describe("Switch", () => {
	it("moves its thumb to the right when it is on", async () => {
		const user = userEvent.setup();
		render(<Switch label="Show prices" />);
		const sw = screen.getByRole("switch", { name: "Show prices" });
		const thumb = sw.querySelector("span") as HTMLElement;
		// Each state class is its own token: a missing space makes Tailwind skip both.
		expect(thumb.className.split(" ")).toEqual(
			expect.arrayContaining(["data-[checked]:translate-x-[25px]", "size-6"]),
		);
		await user.click(sw);
		expect(sw).toHaveAttribute("aria-checked", "true");
		expect(thumb).toHaveAttribute("data-checked");
	});

	it("draws a small track at size sm, in a 44 px target", () => {
		render(<Switch size="sm" label="Auto-commit" />);
		const sw = screen.getByRole("switch", { name: "Auto-commit" });
		expect(sw.className.split(" ")).toEqual(expect.arrayContaining(["h-6", "w-10"]));
		const thumb = sw.querySelector("span") as HTMLElement;
		expect(thumb.className.split(" ")).toEqual(
			expect.arrayContaining(["size-[18px]", "data-[checked]:translate-x-[19px]"]),
		);
		expect(sw.closest("label")).toHaveClass("min-h-control");
	});

	it("gives the reason of an off switch as its tooltip and its description", () => {
		render(<Switch label="Auto commit" disabled reason="Needs code.write" />);
		const sw = screen.getByRole("switch", { name: "Auto commit" });
		expect(sw).toHaveAttribute("aria-description", "Needs code.write");
		expect(sw.closest("label")).toHaveAttribute("title", "Needs code.write");
	});
});
