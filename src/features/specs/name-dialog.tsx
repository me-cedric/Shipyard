import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";
import { useGuard } from "./guard";

/** One name and one Create. The reason of a refusal shows in the dialog and nothing is created. */
export function NameDialog({
	title,
	label,
	onCreate,
	onClose,
}: {
	title: string;
	label: string;
	onCreate: (name: string) => Promise<unknown>;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [name, setName] = useState("");
	const { failure, run } = useGuard();
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={title}
			actions={
				<Button
					variant="primary"
					disabled={name.trim() === ""}
					onClick={() => void run(() => onCreate(name.trim())).then((ok) => ok && onClose())}
				>
					{t.specs.create}
				</Button>
			}
		>
			<Input label={label} value={name} onChange={(e) => setName(e.target.value)} />
			<ErrorNotice error={failure} />
		</Dialog>
	);
}
