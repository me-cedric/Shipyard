import "@testing-library/jest-dom/vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import { configure } from "@testing-library/react";
import { installMockIpc, resetMock } from "@/lib/ipc/mock";
import { clearTabSelections } from "@/lib/shell/selection";

// A cold first mount of the whole app can take over one second on a busy machine.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks these. cmdk needs them.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
window.scrollTo = () => {};

// A fixed Wednesday: day rules (the Thursday timesheet reminder) give the same result every day.
// Only Date is mocked; timers stay real.
vi.setSystemTime(new Date("2026-10-28T10:00:00"));

// Each test starts with an empty app data folder and the mock IPC.
beforeEach(() => {
	resetMock();
	installMockIpc();
	clearTabSelections();
});
afterEach(clearMocks);
