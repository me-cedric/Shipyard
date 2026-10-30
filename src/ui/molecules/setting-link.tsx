import type { ReactNode } from "react";
import { useOpenSetting } from "@/lib/errors";

/** A sentence that opens the Settings field it names: the reason that a control is off links to the fix. */
export function SettingLink({ target, children }: { target: string; children: ReactNode }) {
	const open = useOpenSetting();
	return (
		<button
			type="button"
			onClick={() => open(target)}
			className="rounded-sm text-left text-12 text-accent-text hover:underline"
		>
			{children}
		</button>
	);
}
