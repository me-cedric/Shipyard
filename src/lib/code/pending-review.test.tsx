import { act, renderHook } from "@testing-library/react";
import { resetPendingReview, usePendingReview } from "./pending-review";

const note = (path: string, line: number, body: string) => ({
	path,
	line,
	body,
	headSha: "abc1234",
});

beforeEach(() => {
	localStorage.clear();
	resetPendingReview();
});

describe("the pending review", () => {
	it("adds, updates, removes and clears comments", () => {
		const { result } = renderHook(() => usePendingReview("pr:c:1"));
		act(() => result.current.add(note("a.ts", 2, "one")));
		act(() => result.current.add(note("b.ts", 5, "two")));
		expect(result.current.comments.map((c) => [c.path, c.line, c.body])).toEqual([
			["a.ts", 2, "one"],
			["b.ts", 5, "two"],
		]);
		const [first] = result.current.comments;
		act(() => result.current.update(first?.id ?? "", "edited"));
		expect(result.current.comments[0]?.body).toBe("edited");
		act(() => result.current.remove(first?.id ?? ""));
		expect(result.current.comments.map((c) => c.path)).toEqual(["b.ts"]);
		act(() => result.current.clear());
		expect(result.current.comments).toEqual([]);
		expect(localStorage.length).toBe(0);
	});

	it("is one store for every component", () => {
		const a = renderHook(() => usePendingReview("pr:c:1"));
		const b = renderHook(() => usePendingReview("pr:c:1"));
		act(() => a.result.current.add(note("a.ts", 1, "x")));
		expect(b.result.current.comments).toHaveLength(1);
	});

	it("survives a restart and keeps each pull request apart", () => {
		const a = renderHook(() => usePendingReview("pr:c:1"));
		act(() => a.result.current.add(note("a.ts", 1, "x")));
		a.unmount();
		resetPendingReview();
		const again = renderHook(() => usePendingReview("pr:c:1"));
		expect(again.result.current.comments.map((c) => c.body)).toEqual(["x"]);
		const other = renderHook(() => usePendingReview("pr:c:2"));
		expect(other.result.current.comments).toEqual([]);
	});

	it("keeps a comment in memory and says why when the storage refuses, then clears the error", () => {
		const { result } = renderHook(() => usePendingReview("pr:c:1"));
		const full = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("The quota is exceeded");
		});
		act(() => result.current.add(note("a.ts", 1, "typed")));
		expect(result.current.comments.map((c) => c.body)).toEqual(["typed"]);
		expect(result.current.storageError).toBe("The quota is exceeded");
		full.mockRestore();
		act(() => result.current.add(note("a.ts", 2, "again")));
		expect(result.current.storageError).toBeNull();
		expect(result.current.comments).toHaveLength(2);
		expect(localStorage.length).toBe(1);
	});

	it("ignores a corrupt stored value and says so until the next good write", () => {
		const first = renderHook(() => usePendingReview("pr:c:1"));
		act(() => first.result.current.add(note("a.ts", 1, "x")));
		const key = localStorage.key(0) ?? "";
		first.unmount();
		localStorage.setItem(key, "{oops");
		resetPendingReview();
		const { result } = renderHook(() => usePendingReview("pr:c:1"));
		expect(result.current.comments).toEqual([]);
		expect(result.current.unreadable).toBe(true);
		act(() => result.current.add(note("a.ts", 2, "new")));
		expect(result.current.unreadable).toBe(false);
	});

	it("settle keeps only the comments that the code host did not take, with their text", () => {
		const { result } = renderHook(() => usePendingReview("pr:c:1"));
		act(() => result.current.add(note("a.ts", 1, "sent")));
		act(() => result.current.add(note("a.ts", 2, "lost\nmore")));
		let ids: string[] = [];
		act(() => {
			ids = result.current.settle([note("a.ts", 2, "lost\nmore")]);
		});
		expect(result.current.comments.map((c) => c.body)).toEqual(["lost\nmore"]);
		expect(ids).toEqual(result.current.comments.map((c) => c.id));
		act(() => void result.current.settle([]));
		expect(result.current.comments).toEqual([]);
	});
});
