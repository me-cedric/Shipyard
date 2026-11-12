import { render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { I18nProvider } from "@/lib/i18n";
import type { Notice } from "@/lib/notifications";
import { Toaster } from "./toaster";

// spec:ux-declutter#REQ-024
const notice = (id: string): Notice =>
	({ id, kind: "info", title: `Title ${id}`, time: Date.now(), read: false }) as Notice;

describe("Toaster", () => {
	const ui = (toasts: Notice[], motion: "always" | "never" = "always") => (
		<I18nProvider>
			<MotionConfig reducedMotion={motion}>
				<Toaster toasts={toasts} onDismiss={() => {}} />
			</MotionConfig>
		</I18nProvider>
	);

	it("keeps one polite live region and removes a toast that goes", async () => {
		const { rerender } = render(ui([notice("a")]));
		const region = screen.getByRole("status");
		expect(region).toHaveAttribute("aria-live", "polite");
		rerender(ui([notice("a"), notice("b")]));
		expect(screen.getAllByRole("status")).toHaveLength(1);
		expect(screen.getAllByText(/^Title /)).toHaveLength(2);
		rerender(ui([notice("b")]));
		await vi.waitFor(() => expect(screen.queryByText("Title a")).toBeNull());
		expect(screen.getByRole("status")).toBe(region);
	});

	it("keeps a toast that goes mounted while it slides out, then removes it", async () => {
		const { rerender } = render(ui([notice("a"), notice("b")], "never"));
		rerender(ui([notice("b")], "never"));
		expect(screen.getByText("Title a")).toBeInTheDocument();
		// a leaving toast takes no focus and no click
		expect(screen.getByText("Title a").closest("[inert]")).not.toBeNull();
		expect(screen.getByText("Title b").closest("[inert]")).toBeNull();
		await vi.waitFor(() => expect(screen.queryByText("Title a")).toBeNull());
	});
});
