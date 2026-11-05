import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@/lib/utils";

/** The thumb of every segmented control: it slides with a transform, and stays still under reduced motion. */
export const THUMB =
	"pointer-events-none absolute transition-transform duration-(--duration-thumb) ease-spring motion-reduce:transition-none";

/** One choice of a short list, with a thumb that slides to the choice. One is always on. */
export function Segmented<V extends string>({
	label,
	value,
	onValueChange,
	items,
}: {
	label: string;
	value: V;
	onValueChange: (value: V) => void;
	items: { value: V; label: string }[];
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
			className="relative isolate flex w-full items-center rounded-full border bg-n-2 p-0.5"
		>
			<span
				aria-hidden="true"
				data-segmented-thumb
				className={cn(THUMB, "inset-y-0.5 left-0.5 -z-10 rounded-full bg-accent-gradient shadow-1")}
				style={{
					width: `calc((100% - 0.25rem) / ${items.length})`,
					transform: `translateX(${at * 100}%)`,
				}}
			/>
			{items.map((i) => (
				<Toggle
					key={i.value}
					value={i.value}
					className="h-6 flex-1 rounded-full px-2 text-12 text-n-11 transition-colors duration-(--duration-fast) hover:text-n-12 data-[pressed]:text-accent-fg"
				>
					{i.label}
				</Toggle>
			))}
		</ToggleGroup>
	);
}
