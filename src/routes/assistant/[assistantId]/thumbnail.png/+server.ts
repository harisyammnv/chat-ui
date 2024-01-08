import { APP_BASE } from "$env/static/private";
import ChatThumbnail from "./ChatThumbnail.svelte";
import { collections } from "$lib/server/database";
import { error, type RequestHandler } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { SvelteComponent } from "svelte";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { html } from "satori-html";
import { base } from "$app/paths";

export const GET: RequestHandler = (async ({ url, params, fetch }) => {
	const assistant = await collections.assistants.findOne({
		_id: new ObjectId(params.assistantId),
	});

	if (!assistant) {
		throw error(404, "Assistant not found.");
	}

	const renderedComponent = (ChatThumbnail as unknown as SvelteComponent).render({
		name: assistant.name,
		description: assistant.description,
		avatarUrl: assistant.avatar
			? url.origin + APP_BASE + "/settings/assistants/" + assistant._id + "/avatar"
			: undefined,
	});

	const reactLike = html(
		"<style>" + renderedComponent.css.code + "</style>" + renderedComponent.html
	);

	const svg = await satori(reactLike, {
		width: 700,
		height: 370,
		fonts: [
			{
				name: "Inter",
				data: await fetch(base + "/fonts/Inter-Regular.ttf").then((r) => r.arrayBuffer()),
				weight: 500,
			},
			{
				name: "Inter",
				data: await fetch(base + "/fonts/Inter-Bold.ttf").then((r) => r.arrayBuffer()),
				weight: 700,
			},
			{
				name: "Inter",
				data: await fetch(base + "/fonts/Inter-ExtraBold.ttf").then((r) => r.arrayBuffer()),
				weight: 800,
			},
			{
				name: "Inter",
				data: await fetch(base + "/fonts/Inter-Black.ttf").then((r) => r.arrayBuffer()),
				weight: 900,
			},
		],
	});

	const png = new Resvg(svg, {
		fitTo: { mode: "original" },
	})
		.render()
		.asPng();

	return new Response(png, {
		headers: {
			"Content-Type": "image/png",
		},
	});
}) satisfies RequestHandler;