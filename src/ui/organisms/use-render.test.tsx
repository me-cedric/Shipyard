import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { LineError, useRender } from "./use-render";

const render = async (s: string) => {
	if (s.startsWith("bad")) throw new LineError("boom", 3);
	return s.toUpperCase();
};

describe("useRender", () => {
	it("keeps the last good result and reports the error with its line", async () => {
		const onError = vi.fn();
		const { result, rerender } = renderHook(({ s }) => useRender(s, render, onError, 0), {
			initialProps: { s: "ok" },
		});
		await waitFor(() => expect(result.current).toBe("OK"));
		rerender({ s: "bad" });
		await waitFor(() => expect(onError).toHaveBeenLastCalledWith({ message: "boom", line: 3 }));
		expect(result.current).toBe("OK");
		rerender({ s: "fine" });
		await waitFor(() => expect(result.current).toBe("FINE"));
		expect(onError).toHaveBeenLastCalledWith(null);
	});
});
