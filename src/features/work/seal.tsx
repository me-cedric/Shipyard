import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { RightButton, RightIconButton } from "@/lib/rights";
import { type Seal, useWorkActions } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { LockClosedIcon, LockOpenIcon, XMarkIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
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
	const { error, failure, run, setError } = useGuard();
	const [pass, setPass] = useState("");
	const [again, setAgain] = useState("");
	const [asking, setAsking] = useState<Mode | null>(null);
	const locked = state.sealed && !state.unlocked;
	const mode: Mode | null = locked ? "unlock" : asking;

	if (mode === null)
		return state.sealed ? (
			<>
				<RightIconButton right="work.edit" label={s.lock} onClick={() => void run(act.lock)}>
					<LockClosedIcon size={14} />
				</RightIconButton>
				<RightIconButton right="work.edit" label={s.unseal} onClick={() => setAsking("unseal")}>
					<LockOpenIcon size={14} />
				</RightIconButton>
				<ErrorNotice error={failure ?? error} />
			</>
		) : (
			<>
				<RightIconButton right="work.edit" label={s.seal} onClick={() => setAsking("seal")}>
					<LockClosedIcon size={14} />
				</RightIconButton>
				<ErrorNotice error={failure ?? error} />
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
				<RightButton
					right="work.edit"
					type="submit"
					disabled={pass === "" || (mode === "seal" && again === "")}
				>
					{s[mode]}
				</RightButton>
				{asking ? (
					<IconButton label={t.sync.backlog.cancel} onClick={() => setAsking(null)}>
						<XMarkIcon size={14} />
					</IconButton>
				) : null}
			</form>
			<ErrorNotice error={failure ?? error} />
		</>
	);
}

/**
 * The seal as a card (Plan / Estimates, Costing): the state, one passphrase field and the actions.
 * The rules are the ones of `SealBar`. A new seal asks for the passphrase two times in the same
 * field: a typo would lock the files for good.
 */
export function SealCard({ state }: { state: Seal }) {
	const { t } = useI18n();
	const s = t.work.seal;
	const p = t.costing.estimate;
	const act = useWorkActions();
	const { error, failure, run, setError } = useGuard();
	const [pass, setPass] = useState("");
	/** The first entry of a new seal, while the card asks for the second one. */
	const [first, setFirst] = useState<string | null>(null);
	const locked = state.sealed && !state.unlocked;
	const mode: Mode = locked ? "unlock" : state.sealed ? "unseal" : "seal";
	const label = first === null ? s.passphrase : s.repeat;
	return (
		<Card pad>
			<form
				className="flex flex-col gap-3"
				onSubmit={async (e) => {
					e.preventDefault();
					// The passphrase leaves the field before the call: a refusal never leaves it on screen.
					const typed = pass;
					setPass("");
					if (typed === "") return;
					if (mode === "seal") {
						if (first === null) return setFirst(typed);
						setFirst(null);
						if (typed !== first) return setError(s.mismatch);
					}
					await run(() => act[mode](typed));
				}}
			>
				<div className="flex items-center gap-3">
					<h2 className="mr-auto text-17 font-semibold">{s.seal}</h2>
					<Badge>{locked ? t.work.estimates.locked : state.sealed ? p.open : p.notSealed}</Badge>
				</div>
				<Input
					caption
					label={label}
					type="password"
					autoComplete="off"
					spellCheck={false}
					value={pass}
					onChange={(ev) => setPass(ev.target.value)}
				/>
				<div className="grid grid-cols-2 gap-2.5">
					{state.sealed && !locked ? (
						<RightButton right="work.edit" variant="primary" onClick={() => void run(act.lock)}>
							{s.lock}
						</RightButton>
					) : null}
					<RightButton
						right="work.edit"
						type="submit"
						variant={state.sealed && !locked ? "secondary" : "primary"}
						disabled={pass === ""}
					>
						{mode === "unseal" ? p.openSeal : s[mode]}
					</RightButton>
				</div>
				<ErrorNotice error={failure ?? error} />
				<Badge variant="success" className="self-start">
					{p.sealNote}
				</Badge>
			</form>
		</Card>
	);
}
