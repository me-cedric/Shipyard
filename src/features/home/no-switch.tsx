import { type ReactNode, useContext, useMemo } from "react";
import { PageSwitchContext } from "@/ui/molecules/page-header";

/** A page below this draws no section switch: its header still claims the slot, so the place adds no bar. */
export function NoSwitch({ children }: { children: ReactNode }) {
	const slot = useContext(PageSwitchContext);
	const own = useMemo(() => ({ node: null, claim: slot?.claim ?? (() => () => {}) }), [slot]);
	return <PageSwitchContext.Provider value={own}>{children}</PageSwitchContext.Provider>;
}
