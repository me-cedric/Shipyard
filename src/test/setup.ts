import "@testing-library/jest-dom/vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import { installMockIpc, resetMock } from "@/lib/ipc/mock";

// jsdom lacks these. cmdk needs them.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
window.scrollTo = () => {};

// Each test starts with an empty app data folder and the mock IPC.
beforeEach(() => {
	resetMock();
	installMockIpc();
});
afterEach(clearMocks);
