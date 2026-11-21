import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForgeActions, useOrigin } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Link } from "@/ui/organisms/markdown-view";

/**
 * The address of the project on the code host, as a card. The field holds the address; Save sets it.
 * A local project also publishes to a code host in one click: the repository is created, set as
 * the origin and pushed.
 */
export function OriginPanel() {
	const { t } = useI18n();
	const o = t.forge.origin;
	const origin = useOrigin().data;
	const { publish, setRemote } = useForgeActions();
	const forges =
		useQuery({
			queryKey: ["connections", "list"],
			queryFn: () => unwrap(commands.connectionsList()),
		}).data?.filter((c) => c.group === "forge") ?? [];
	const [forge, setForge] = useState("");
	const [name, setName] = useState("");
	// Null until the person types: the field then shows the address of today.
	const [typed, setTyped] = useState<string | null>(null);
	const [error, setError] = useState<unknown>(null);
	const run = async (job: () => Promise<unknown>) => {
		try {
			setError(null);
			await job();
			setName("");
			setTyped(null);
		} catch (e) {
			setError(e);
		}
	};
	if (origin === undefined) return null;
	const chosen = forge || forges[0]?.id || "";
	const address = typed ?? origin?.url ?? "";
	return (
		<Card pad className="mx-4 mb-4 flex flex-col gap-3">
			<h2 className="text-13 font-semibold text-n-11">{t.forge.branches.address}</h2>
			{!origin && forges.length > 0 ? (
				<form
					className="flex flex-wrap items-center gap-2.5"
					onSubmit={(e) => {
						e.preventDefault();
						void run(() => publish(chosen, name));
					}}
				>
					<Select
						label={o.forge}
						value={chosen}
						onValueChange={setForge}
						items={forges.map((c) => ({ value: c.id, label: c.name }))}
						className="min-w-40"
					/>
					<Input
						label={o.name}
						className="flex-[1_1_200px]"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<Button type="submit" variant="primary" disabled={!name.trim()}>
						{o.publish}
					</Button>
				</form>
			) : null}
			<form
				className="flex flex-wrap items-center gap-2.5"
				onSubmit={(e) => {
					e.preventDefault();
					void run(() => setRemote(address));
				}}
			>
				<Input
					label={t.forge.branches.address}
					className="flex-[1_1_200px] font-mono text-13 placeholder:font-sans"
					value={address}
					onChange={(e) => setTyped(e.target.value)}
				/>
				<Button type="submit" disabled={!address.trim() || address === origin?.url}>
					{t.forge.branches.save}
				</Button>
			</form>
			{origin?.webUrl ? (
				<Link url={origin.webUrl}>{format(o.openPage, { slug: origin.slug ?? "" })}</Link>
			) : null}
			<ErrorNotice error={error} />
		</Card>
	);
}
