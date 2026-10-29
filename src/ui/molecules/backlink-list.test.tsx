import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { BacklinkList } from "./backlink-list";

describe("BacklinkList", () => {
	it("groups by kind with a count and opens a chip", async () => {
		const onOpen = vi.fn();
		renderApp(
			<BacklinkList
				groups={[
					{ kind: "spec", items: [{ ref: "spec:a", title: "A" }, { ref: "spec:b" }] },
					{ kind: "diagram", items: [{ ref: "diagram:c" }] },
				]}
				onOpen={onOpen}
			/>,
		);
		expect(screen.getByRole("heading", { name: "Spec (2)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Diagram (1)" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "spec:a, A, Resolved" }));
		expect(onOpen).toHaveBeenCalledWith("spec:a");
	});

	it("shows ghost rows and no text when nothing cites", () => {
		const { container } = renderApp(<BacklinkList groups={[]} onOpen={() => {}} />);
		expect(container.textContent).toBe("");
		expect(container.querySelectorAll("[aria-hidden] > *")).toHaveLength(3);
	});
});
