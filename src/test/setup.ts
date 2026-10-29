import "@testing-library/jest-dom/vitest";

// jsdom lacks these. cmdk needs them.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
window.scrollTo = () => {};
