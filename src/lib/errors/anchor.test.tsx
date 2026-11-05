import { act, render, screen } from "@testing-library/react";
import { arriveAt } from "./anchor";

const mount = () =>
	render(
		<details>
			<summary>More</summary>
			<div id="row">
				<span>Label</span>
				<button type="button">Control</button>
			</div>
		</details>,
	);

const motion = (reduce: boolean) =>
	vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }));

describe("arriveAt", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Element.prototype.scrollIntoView = vi.fn();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("scrolls the row into view, focuses its control and rings it for 2 s", () => {
		motion(false);
		mount();
		expect(arriveAt("row")).toBe(true);
		expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
			block: "center",
			behavior: "smooth",
		});
		expect(screen.getByRole("button", { name: "Control" })).toHaveFocus();
		const row = document.getElementById("row");
		expect(row).toHaveAttribute("data-anchor-hit");
		act(() => vi.advanceTimersByTime(2000));
		expect(row).not.toHaveAttribute("data-anchor-hit");
	});

	it("opens a closed group that holds the row", () => {
		motion(false);
		mount();
		arriveAt("row");
		expect(document.querySelector("details")).toHaveAttribute("open");
	});

	it("jumps with no smooth scroll under reduced motion", () => {
		motion(true);
		mount();
		arriveAt("row");
		expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
			block: "center",
			behavior: "auto",
		});
	});

	it("returns false for an id that is not in the page", () => {
		expect(arriveAt("nothing")).toBe(false);
	});
});
