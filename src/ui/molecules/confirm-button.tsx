import { useState } from "react";
import { Button, type ButtonProps } from "../atoms/button";

/**
 * A button for an action that stops work. The first click asks, with the question as the label of a
 * second button that has focus. Leaving the button or a second click on it ends the question.
 */
export function ConfirmButton({
	confirm,
	onConfirm,
	children,
	...props
}: Omit<ButtonProps, "onClick"> & { confirm: string; onConfirm: () => void }) {
	const [asking, setAsking] = useState(false);
	return asking ? (
		<Button
			{...props}
			variant="danger"
			autoFocus
			onBlur={() => setAsking(false)}
			onClick={() => {
				setAsking(false);
				onConfirm();
			}}
		>
			{confirm}
		</Button>
	) : (
		<Button {...props} onClick={() => setAsking(true)}>
			{children}
		</Button>
	);
}
