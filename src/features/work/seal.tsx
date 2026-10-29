import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { type Seal, useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { LockClosedIcon, LockOpenIcon, XMarkIcon } from "@/ui/icons";
import { SecretInput } from "@/ui/molecules/secret-input";
import { useGuard } from "./guard";

type Mode = "unlock" | "seal" | "unseal";

/**
 * The seal of the project: unlock, lock, seal and unseal with one passphrase. The field never
 * shows what a person types, and it empties after each try. A locked project shows the field at
 * once. Otherwise an icon opens it. A seal asks for the passphrase twice: a typo would lock the
 * files for good.
 */
export function SealBar({ state }: { state: Seal }) {
	const { t } = useI18n();
	const s = t.work.seal;
	const act = useWorkActions();
	const { error, run, setError } = useGuard();
	const [pass, setPass] = useState("");
	const [again, setAgain] = useState("");
	const [asking, setAsking] = useState<Mode | null>(null);
	const locked = state.sealed && !state.unlocked;
	const mode: Mode | null = locked ? "unlock" : asking;

	if (mode === null)
		return state.sealed ? (
			<>
				<IconButton label={s.lock} onClick={() => void run(act.lock)}>
					<LockClosedIcon size={14} />
				</IconButton>
				<IconButton label={s.unseal} onClick={() => setAsking("unseal")}>
					<LockOpenIcon size={14} />
				</IconButton>
				{error ? <Alert text={error} /> : null}
			</>
		) : (
			<>
				<IconButton label={s.seal} onClick={() => setAsking("seal")}>
					<LockClosedIcon size={14} />
				</IconButton>
				{error ? <Alert text={error} /> : null}
			</>
		);

	return (
		<>
			<form
				className="flex items-center gap-2"
				onSubmit={async (e) => {
					e.preventDefault();
					// The passphrase leaves the field before the call: a refusal never leaves it on screen.
					const typed = pass;
					const repeated = again;
					setPass("");
					setAgain("");
					if (mode === "seal" && typed !== repeated) return setError(s.mismatch);
					if (await run(() => act[mode](typed))) setAsking(null);
				}}
			>
				<SecretInput
					label={s.passphrase}
					saved={false}
					value={pass}
					onChange={setPass}
					placeholder={s.passphrase}
					className="w-44"
				/>
				{mode === "seal" ? (
					<SecretInput
						label={s.repeat}
						saved={false}
						value={again}
						onChange={setAgain}
						placeholder={s.repeat}
						className="w-44"
					/>
				) : null}
				<Button type="submit" disabled={pass === "" || (mode === "seal" && again === "")}>
					{s[mode]}
				</Button>
				{asking ? (
					<IconButton label={t.sync.backlog.cancel} onClick={() => setAsking(null)}>
						<XMarkIcon size={14} />
					</IconButton>
				) : null}
			</form>
			{error ? <Alert text={error} /> : null}
		</>
	);
}

function Alert({ text }: { text: string }) {
	return (
		<p role="alert" className="text-ui text-danger-text">
			{text}
		</p>
	);
}
