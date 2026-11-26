import { act, renderHook } from "@testing-library/react";
import { errorMessage } from "@/lib/i18n/errors";
import { toFailure } from "@/lib/ipc";
import { useGuard } from "./guard";

describe("useGuard", () => {
	it("is busy while a run is in progress, and keeps the reason of a failure", async () => {
		const { result } = renderHook(() => useGuard());
		let finish = () => {};
		let done: Promise<boolean> = Promise.resolve(true);
		act(() => {
			done = result.current.run(() => new Promise<void>((r) => (finish = r)));
		});
		expect(result.current.busy).toBe(true);
		await act(async () => {
			finish();
			await done;
		});
		expect(result.current.busy).toBe(false);
		await act(async () => {
			await result.current.run(() => Promise.reject(new Error("no answer")));
		});
		expect(result.current.busy).toBe(false);
		expect(result.current.error).toBe("no answer");
	});

	it("shows the plain sentence of a raw error text", async () => {
		const { result } = renderHook(() => useGuard());
		await act(async () => {
			await result.current.run(() => Promise.reject("no project is open"));
		});
		expect(result.current.error).toBe(errorMessage(toFailure("no project is open")));
		expect(result.current.error).not.toBe("no project is open");
	});
});
