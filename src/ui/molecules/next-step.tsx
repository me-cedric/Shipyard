import { Button } from "../atoms/button";
import { ChevronRightIcon } from "../icons";

/** The one next action of an item along the loop: a primary button that leads forward. */
export function NextStep({
	label,
	onClick,
	busy,
}: {
	label: string;
	onClick: () => void;
	busy?: boolean;
}) {
	return (
		<Button variant="primary" onClick={onClick} disabled={busy} className="self-start">
			{label}
			<ChevronRightIcon size={14} />
		</Button>
	);
}
