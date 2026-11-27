import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button, type ButtonProps } from "@/ui/atoms/button";
import { Switch, type SwitchProps } from "@/ui/atoms/switch";

/** The white button that shows the value of a setting. It opens the select, the menu or the dialog of the value. */
export function ValueButton({ mono, className, ...props }: ButtonProps & { mono?: boolean }) {
	return (
		<Button
			variant="secondary"
			className={cn("min-w-0 shrink", mono && "font-mono text-ui font-normal", className)}
			{...props}
		/>
	);
}

/** The switch of the design with no visible words: the row shows the words; `label` is the name. */
export function Toggle(props: Omit<SwitchProps, "iconOnly" | "size">) {
	return <Switch iconOnly {...props} />;
}

const STATE = { ready: "success", fix: "you", off: "neutral" } as const;

/** The state of a tool or a connection, as a soft pill: ready, to fix or off. The children replace the default words. */
export function StatePill({
	state,
	children,
}: {
	state: keyof typeof STATE;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<Badge variant={STATE[state]} dot={false}>
			{children ?? t.settings.parts[state]}
		</Badge>
	);
}
