import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

/**
 * `Segmented` of `src/ui` with each choice as wide as its label, as the design draws it. The roles
 * and names are the same: a named group of toggle buttons. The thumb is the pressed background.
 */
export function FitSegmented<V extends string>({
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
	return (
		<ToggleGroup
			aria-label={label}
			value={[value]}
			onValueChange={(v) => {
				if (v[0]) onValueChange(v[0] as V);
			}}
			className="flex w-fit items-center rounded-md bg-n-4 p-1"
		>
			{items.map((i) => (
				<Toggle
					key={i.value}
					value={i.value}
					className="min-h-control whitespace-nowrap rounded-sm px-3.5 font-medium text-n-10 transition-colors duration-(--duration-fast) hover:text-n-12 data-[pressed]:bg-surface-1 data-[pressed]:text-n-12 data-[pressed]:shadow-1"
				>
					{i.label}
				</Toggle>
			))}
		</ToggleGroup>
	);
}
