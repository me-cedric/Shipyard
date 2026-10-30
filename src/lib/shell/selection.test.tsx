import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mountKnowledge } from "@/features/knowledge/harness";
import { useTabSelection } from "./selection";

describe("useTabSelection", () => {
	it("gives the first item, keeps a choice for the next mount and drops a choice that left the list", () => {
		const first = renderHook(({ ids }) => useTabSelection("t", ids), {
			initialProps: { ids: ["a", "b"] },
		});
		expect(first.result.current[0]).toBe("a");
		act(() => first.result.current[1]("b"));
		expect(first.result.current[0]).toBe("b");
		first.unmount();
		const again = renderHook(({ ids }) => useTabSelection("t", ids), {
			initialProps: { ids: ["a", "b"] },
		});
		expect(again.result.current[0]).toBe("b");
		again.rerender({ ids: ["c"] });
		expect(again.result.current[0]).toBe("c");
		again.rerender({ ids: [] });
		expect(again.result.current[0]).toBeNull();
	});

	it("selects nothing by default without a list: a card overview stays", () => {
		const { result } = renderHook(() => useTabSelection("cards"));
		expect(result.current[0]).toBeNull();
		act(() => result.current[1]("x"));
		expect(result.current[0]).toBe("x");
	});
});

describe("List-detail views", () => {
	it("open the first page by default and keep the choice of each tab", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		const pages = await screen.findByRole("navigation", { name: "Handbook" });
		const buttons = within(pages).getAllByRole("button");
		const [top] = buttons;
		const last = buttons.at(-1) as HTMLElement;
		const name = last.textContent ?? "";
		expect(buttons.length).toBeGreaterThan(1);
		expect(top).toHaveAttribute("aria-current", "true");
		expect(await screen.findByRole("article")).toBeInTheDocument();
		await user.click(last);
		await waitFor(() => expect(last).toHaveAttribute("aria-current", "true"));
		expect(top).not.toHaveAttribute("aria-current");
		await user.click(screen.getByRole("link", { name: "Documents" }));
		await screen.findByRole("navigation", { name: "Documents" });
		await user.click(screen.getByRole("link", { name: "Handbook" }));
		const back = await screen.findByRole("navigation", { name: "Handbook" });
		expect(within(back).getByRole("button", { name })).toHaveAttribute("aria-current", "true");
	});
});
