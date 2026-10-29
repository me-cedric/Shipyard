import { screen } from "@testing-library/react";
import { ArrowPathIcon } from "../icons";
import { renderApp } from "../test-utils";
import { AnimatedIcon } from "./animated-icon";
import { LiveDot } from "./live-dot";
import { Progress } from "./progress";
import { Sparkline, sparkPoints } from "./sparkline";

describe("visual language v2 atoms (ADR 0014)", () => {
	it("Sparkline scales the values into the 100 x 24 box, lowest at the bottom", () => {
		expect(sparkPoints([0, 5, 10])).toEqual(["0,23", "50,12", "100,1"]);
		// A flat line stays inside the box.
		expect(sparkPoints([3, 3])).toEqual(["0,23", "100,23"]);
	});

	it("Sparkline is decoration and needs two values", () => {
		const { container, rerender } = renderApp(<Sparkline values={[1]} />);
		expect(container.querySelector("svg")).toBeNull();
		rerender(<Sparkline values={[1, 2]} />);
		expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	it("Progress names its value against the max", () => {
		renderApp(<Progress value={2} max={5} label="Steps" />);
		const bar = screen.getByRole("progressbar", { name: "Steps" });
		expect(bar).toHaveAttribute("aria-valuenow", "2");
		expect(bar).toHaveAttribute("aria-valuemax", "5");
	});

	it("LiveDot has a name and breathes", () => {
		renderApp(<LiveDot label="Live" />);
		expect(screen.getByRole("img", { name: "Live" }).className).toContain("animate-live");
	});

	it("AnimatedIcon spins only while the task runs", () => {
		const { container, rerender } = renderApp(<AnimatedIcon icon={ArrowPathIcon} spin={false} />);
		const span = () => container.firstElementChild as HTMLElement;
		expect(span().className).not.toContain("animate-spin");
		expect(span()).toHaveAttribute("aria-hidden", "true");
		rerender(<AnimatedIcon icon={ArrowPathIcon} spin />);
		expect(span().className).toContain("animate-spin");
	});
});
