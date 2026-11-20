import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ShellProvider, useShell } from "./index";

const wrapper = ({ children }: { children: ReactNode }) => (
	<ShellProvider>{children}</ShellProvider>
);

describe("openRef", () => {
	// A row that a page selects keeps the side panel; a link opens the card over the page.
	it("marks a row selection as side and a link as a card", () => {
		const { result } = renderHook(() => useShell(), { wrapper });
		act(() => result.current.openRef("adr:0001", true));
		expect(result.current.selectedRef).toBe("adr:0001");
		expect(result.current.sideSelected).toBe(true);
		act(() => result.current.openRef("adr:0002"));
		expect(result.current.selectedRef).toBe("adr:0002");
		expect(result.current.sideSelected).toBe(false);
	});

	// A click handler passes its event as the second argument: only `true` means a row.
	it("takes an event as no side flag", () => {
		const { result } = renderHook(() => useShell(), { wrapper });
		act(() => (result.current.openRef as (ref: string, x: unknown) => void)("adr:0001", {}));
		expect(result.current.sideSelected).toBe(false);
	});
});
