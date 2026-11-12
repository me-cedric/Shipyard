import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "motion/react";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { SectionNav } from "./section-nav";

// spec:visual-cues#REQ-006
describe("SectionNav", () => {
	it("names the nav and scrolls to the section on click", async () => {
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		renderApp(
			<>
				<SectionNav label="Sections" items={[{ id: "tickets", label: "Tickets", icon: <i /> }]} />
				<section id="tickets" />
			</>,
		);
		expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("link", { name: "Tickets" }));
		expect(scroll).toHaveBeenCalledTimes(1);
		expect(scroll.mock.contexts[0]).toBe(document.getElementById("tickets"));
	});

	it("scrolls without animation when the preference is reduced", async () => {
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		renderApp(
			<MotionConfig reducedMotion="always">
				<SectionNav label="Sections" items={[{ id: "tickets", label: "Tickets", icon: <i /> }]} />
				<section id="tickets" />
			</MotionConfig>,
		);
		await userEvent.click(screen.getByRole("link", { name: "Tickets" }));
		expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
	});

	it("opens a closed details around the section first", async () => {
		Element.prototype.scrollIntoView = vi.fn();
		renderApp(
			<>
				<SectionNav label="Sections" items={[{ id: "deep", label: "Deep", icon: <i /> }]} />
				<details>
					<summary>More</summary>
					<section id="deep" />
				</details>
			</>,
		);
		await userEvent.click(screen.getByRole("link", { name: "Deep" }));
		expect(document.querySelector("details")?.open).toBe(true);
	});

	it("lists only the sections on the page", () => {
		renderApp(
			<>
				<SectionNav
					label="Sections"
					items={[
						{ id: "here", label: "Here", icon: <i /> },
						{ id: "gone", label: "Gone", icon: <i /> },
					]}
				/>
				<section id="here" />
			</>,
		);
		expect(screen.getByRole("link", { name: "Here" })).toBeInTheDocument();
		expect(screen.queryByRole("link", { name: "Gone" })).toBeNull();
	});
});
