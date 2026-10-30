import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForgeActions, useOrigin } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Link } from "@/ui/organisms/markdown-view";

/**
 * The origin of the project. A local project publishes to a forge in one click: the repository is
 * created, set as the origin and pushed. A project with an origin shows it and can change it.
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
	const [address, setAddress] = useState("");
	const [changing, setChanging] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const run = async (job: () => Promise<unknown>) => {
		try {
			setError(null);
			await job();
			setName("");
			setAddress("");
			setChanging(false);
		} catch (e) {
			setError(e);
		}
	};
	if (origin === undefined) return null;
	const chosen = forge || forges[0]?.id || "";
	const remote = (
		<form
			className="flex items-center gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				void run(() => setRemote(address));
			}}
		>
			<Input
				label={o.address}
				className="w-72"
				value={address}
				onChange={(e) => setAddress(e.target.value)}
			/>
			<Button type="submit" disabled={!address.trim()}>
				{o.setRemote}
			</Button>
		</form>
	);
	return (
		<div className="flex flex-col gap-2 px-4 pb-2">
			<h2 className="text-ui font-medium">{o.title}</h2>
			{origin ? (
				<div className="flex flex-wrap items-center gap-2 text-ui">
					<span className="font-mono">{origin.url}</span>
					{origin.webUrl ? (
						<Link url={origin.webUrl}>{format(o.openPage, { slug: origin.slug ?? "" })}</Link>
					) : null}
					<Button variant="ghost" aria-pressed={changing} onClick={() => setChanging(!changing)}>
						{o.changeRemote}
					</Button>
				</div>
			) : forges.length > 0 ? (
				<form
					className="flex flex-wrap items-center gap-2"
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
						className="w-56"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<Button type="submit" variant="primary" disabled={!name.trim()}>
						{o.publish}
					</Button>
				</form>
			) : null}
			{!origin && forges.length === 0 ? remote : null}
			{origin && changing ? remote : null}
			<ErrorNotice error={error} />
		</div>
	);
}
