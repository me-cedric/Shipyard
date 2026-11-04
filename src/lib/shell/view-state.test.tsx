import { act, renderHook } from "@testing-library/react";
import {
	clearViewState,
	forgetView,
	readView,
	setViewProject,
	useViewState,
	VIEW_CAP,
	writeView,
} from "./view-state";

afterEach(() => {
	setViewProject("");
	clearViewState();
});

describe("view state", () => {
	it("keeps a value for each project and reads it back after a restart", () => {
		setViewProject("a");
		const first = renderHook(() => useViewState("mode", "read"));
		act(() => first.result.current[1]("edit"));
		expect(first.result.current[0]).toBe("edit");
		first.unmount();
		expect(renderHook(() => useViewState("mode", "read")).result.current[0]).toBe("edit");
		act(() => setViewProject("b"));
		expect(readView("b", "mode", "read")).toBe("read");
	});

	it("reads storage again when the key changes", () => {
		setViewProject("a");
		writeView("a", "mode:/x", "edit");
		const hook = renderHook(({ k }) => useViewState(k, "read"), { initialProps: { k: "mode:/x" } });
		expect(hook.result.current[0]).toBe("edit");
		hook.rerender({ k: "mode:/y" });
		expect(hook.result.current[0]).toBe("read");
		hook.rerender({ k: "mode:/x" });
		expect(hook.result.current[0]).toBe("edit");
	});

	it("keeps the newest entries of a project and forgets a removed project", () => {
		for (let i = 0; i <= VIEW_CAP; i++) writeView("a", `k${i}`, i);
		writeView("b", "k", 1);
		expect(readView("a", "k0", -1)).toBe(-1);
		expect(readView("a", "k1", -1)).toBe(1);
		expect(readView("a", `k${VIEW_CAP}`, -1)).toBe(VIEW_CAP);
		forgetView("a");
		expect(readView("a", "k1", -1)).toBe(-1);
		expect(readView("b", "k", -1)).toBe(1);
		writeView("a", "n", 2);
		expect(readView("a", "n", -1)).toBe(2);
	});

	it("does not throw when the storage fails", () => {
		const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("full");
		});
		try {
			expect(() => writeView("a", "k", 1)).not.toThrow();
		} finally {
			spy.mockRestore();
		}
	});
});
