import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { RefChip, type RefState } from "./ref-chip";

describe("RefChip", () => {
	it("shows a distinct shape per state", () => {
		const states: RefState[] = ["resolved", "unresolved", "broken"];
		const shapes = states.map((state) => {
			const { unmount, container } = renderApp(<RefChip refId="wi:KEY-1" state={state} />);
			const shape = container.querySelector("[data-shape]")?.getAttribute("data-shape");
			unmount();
			return shape;
		});
		expect(new Set(shapes).size).toBe(3);
	});

	it("calls onOpen on Enter", async () => {
		const onOpen = vi.fn();
		renderApp(<RefChip refId="wi:KEY-1" state="resolved" onOpen={onOpen} />);
		await userEvent.tab();
		await userEvent.keyboard("{Enter}");
		expect(onOpen).toHaveBeenCalledWith("wi:KEY-1");
	});
});
