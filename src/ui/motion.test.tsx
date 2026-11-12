import { renderHook } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useEnter } from "./motion";

// spec:ux-declutter#REQ-023
describe("motion preference", () => {
	const still = ({ children }: { children: ReactNode }) => (
		<MotionConfig reducedMotion="always">{children}</MotionConfig>
	);

	it("useEnter does not animate when the preference is reduced", () => {
		expect(renderHook(() => useEnter(), { wrapper: still }).result.current).toBe(false);
		expect(renderHook(() => useEnter()).result.current).toBe("hidden");
	});

	it("only motion.ts reads useReducedMotion from motion/react or prefers-reduced-motion", () => {
		const files = import.meta.glob("/src/**/*.{ts,tsx}", {
			query: "?raw",
			import: "default",
			eager: true,
		}) as Record<string, string>;
		const bad = Object.entries(files)
			.filter(([p]) => !/\/src\/ui\/motion\.ts$|\.test\.tsx?$/.test(p))
			.filter(([, text]) => /\buseReducedMotion\b|prefers-reduced-motion/.test(text))
			.map(([p]) => p);
		expect(bad).toEqual([]);
	});
});
