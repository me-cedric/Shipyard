import { screen } from "@testing-library/react";
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

describe("RefChip behaviour", () => {
	it("opens on click, and an unresolved chip opens nothing", async () => {
		const onOpen = vi.fn();
		const { unmount } = renderApp(<RefChip refId="wi:KEY-1" state="resolved" onOpen={onOpen} />);
		await userEvent.click(document.querySelector("button") as HTMLElement);
		expect(onOpen).toHaveBeenCalledOnce();
		unmount();
		renderApp(<RefChip refId="wi:KEY-2" state="unresolved" onOpen={onOpen} />);
		await userEvent.click(document.querySelector("button") as HTMLElement);
		expect(onOpen).toHaveBeenCalledOnce();
	});

	it("names the ref, the title and the state, and shows the title and state on focus", async () => {
		renderApp(<RefChip refId="pr:github:42" state="resolved" title="Add login" />);
		await userEvent.tab();
		const chip = document.querySelector("button") as HTMLElement;
		expect(chip).toHaveAccessibleName("pr:github:42, Add login, Resolved");
		expect(await screen.findByText("Add login · Resolved")).toBeInTheDocument();
	});
});
