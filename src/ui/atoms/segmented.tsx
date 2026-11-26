import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@/lib/utils";

/** The thumb of every segmented control: it slides with a transform, and stays still under reduced motion. */
export const THUMB =
	"pointer-events-none absolute transition-transform duration-(--duration-thumb) ease-spring motion-reduce:transition-none";

/**
 * One choice of a short list, with a thumb that slides to the choice. One is always on. `fit` makes
 * each choice as wide as its label: the pressed choice gets the background, with no thumb.
 */
export function Segmented<V extends string>({
	label,
	value,
	onValueChange,
	items,
	fit = false,
}: {
	label: string;
	value: V;
	onValueChange: (value: V) => void;
	fit?: boolean;
	/** A choice that is `disabled` stays in the list and gives its `reason` as a tooltip. */
	items: { value: V; label: string; disabled?: boolean; reason?: string }[];
}) {
	const at = Math.max(
		0,
		items.findIndex((i) => i.value === value),
	);
	return (
		<ToggleGroup
			aria-label={label}
			value={[value]}
			onValueChange={(v) => {
				// A pressed choice stays pressed.
				if (v[0]) onValueChange(v[0] as V);
			}}
			className={cn(
				"relative isolate w-fit max-w-full items-center rounded-md bg-n-4 p-1",
				fit ? "flex flex-wrap" : "grid auto-cols-fr grid-flow-col",
			)}
		>
			{fit ? null : (
				<span
					aria-hidden="true"
					data-segmented-thumb
					className={cn(THUMB, "inset-y-1 left-1 -z-10 rounded-sm bg-surface-1 shadow-1")}
					style={{
						width: `calc((100% - 0.5rem) / ${items.length})`,
						transform: `translateX(${at * 100}%)`,
					}}
				/>
			)}
			{items.map((i) => (
				<Toggle
					key={i.value}
					value={i.value}
					disabled={i.disabled}
					title={i.disabled ? i.reason : undefined}
					aria-description={i.disabled ? i.reason : undefined}
					className={cn(
						"min-h-control rounded-sm px-3.5 font-medium whitespace-nowrap text-n-10 transition-colors duration-(--duration-fast) hover:text-n-12 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[pressed]:text-n-12",
						fit && "data-[pressed]:bg-surface-1 data-[pressed]:shadow-1",
					)}
				>
					{i.label}
				</Toggle>
			))}
		</ToggleGroup>
	);
}
