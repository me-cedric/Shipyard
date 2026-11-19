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

	it("renders the first text at once and waits for the next one", async () => {
		const fn = vi.fn(async (s: string) => s.toUpperCase());
		const { result, rerender } = renderHook(({ s }) => useRender(s, fn, undefined, 5_000), {
			initialProps: { s: "" },
		});
		// A file that loads gives an empty text first, then its text: no pause for either.
		rerender({ s: "abc" });
		await waitFor(() => expect(result.current).toBe("ABC"), { timeout: 1_000 });
		// A change while typing waits for the pause.
		rerender({ s: "abcd" });
		await new Promise((r) => setTimeout(r, 50));
		expect(fn).not.toHaveBeenCalledWith("abcd");
	});
});
