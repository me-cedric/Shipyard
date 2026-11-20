import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Select } from "@/ui/atoms/select";

/** A select that looks like the value button of the design: bold text, no chevron. The list is the same. */
export function ValueSelect({ className, ...props }: ComponentProps<typeof Select>) {
	return <Select className={cn("font-semibold [&_svg]:hidden", className)} {...props} />;
}
