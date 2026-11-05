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
			expect.arrayContaining(["data-[checked]:translate-x-[13px]", "data-[checked]:bg-accent-fg"]),
		);
		await user.click(sw);
		expect(sw).toHaveAttribute("aria-checked", "true");
		expect(thumb).toHaveAttribute("data-checked");
	});
});
