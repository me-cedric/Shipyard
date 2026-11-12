import { showAnchor } from "./targets";

describe("showAnchor", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("scrolls to the block once it is on the page", () => {
		const el = document.createElement("div");
		el.id = "block";
		el.scrollIntoView = vi.fn();
		document.body.append(el);
		showAnchor("block");
		expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
		el.remove();
	});

	it("waits for a block that mounts late", () => {
		vi.useFakeTimers();
		const el = document.createElement("div");
		el.id = "late";
		el.scrollIntoView = vi.fn();
		showAnchor("late");
		document.body.append(el);
		vi.advanceTimersByTime(150);
		expect(el.scrollIntoView).toHaveBeenCalled();
		el.remove();
	});

	it("does nothing when the window is already gone", () => {
		vi.useFakeTimers();
		showAnchor("missing");
		vi.stubGlobal("document", undefined);
		expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
	});
});
