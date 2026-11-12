import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { commands } from "@/lib/ipc";
import { useAvatars } from ".";

describe("useAvatars", () => {
	it("asks once for each address, in lower case, and keeps only the found pictures", async () => {
		const ask = vi
			.spyOn(commands, "avatarGet")
			.mockImplementation(async (email) =>
				email === "me@example.com"
					? { status: "ok", data: "data:image/png;base64,AA" }
					: { status: "ok", data: null },
			);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(
			() => useAvatars(["Me@Example.com", "me@example.com ", "", "other@example.com"]),
			{ wrapper },
		);
		await waitFor(() =>
			expect(result.current).toEqual({ "me@example.com": "data:image/png;base64,AA" }),
		);
		expect(ask).toHaveBeenCalledTimes(2);
		ask.mockRestore();
	});
});
