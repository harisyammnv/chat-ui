<script lang="ts">
	import type { WebSearchSource } from "$lib/types/WebSearch";
	import { processTokens, processTokensSync, type Token } from "$lib/utils/marked";
	// import MarkdownWorker from "$lib/workers/markdownWorker?worker";
	import CodeBlock from "../CodeBlock.svelte";
	import DatabricksToolRenderer from "./DatabricksToolRenderer.svelte";
	import type { IncomingMessage, OutgoingMessage } from "$lib/workers/markdownWorker";
	import { browser } from "$app/environment";

	import DOMPurify from "isomorphic-dompurify";
	import { onMount } from "svelte";
	import { updateDebouncer } from "$lib/utils/updates";

	interface DatabricksToolCall {
		type: 'tool-call';
		name: string;
		id?: string;
		parameters: Record<string, any>;
	}

	interface DatabricksToolResult {
		type: 'tool-result';
		name: string;
		result: string;
	}

	type DatabricksTool = DatabricksToolCall | DatabricksToolResult;

	interface Props {
		content: string;
		sources?: WebSearchSource[];
	}

	let worker: Worker | null = null;

	let { content, sources = [] }: Props = $props();

	let tokens: Token[] = $state(processTokensSync(content, sources));
	let databricksTools: DatabricksTool[] = $state([]);
	let processedContent = $state(content);

	function parseDatabricksTools(text: string): { tools: DatabricksTool[], cleanedContent: string } {
		const tools: DatabricksTool[] = [];
		let cleanedContent = text;

		// Parse tool calls
		const toolCallRegex = /<tool-call data-name="([^"]*)"(?:\s+data-id="([^"]*)")?\s*>([\s\S]*?)<\/tool-call>/g;
		let match;
		
		while ((match = toolCallRegex.exec(text)) !== null) {
			const [fullMatch, name, id, content] = match;
			
			// Extract parameters from the content
			const parameters: Record<string, any> = {};
			
			// Look for the parameters section
			const paramSection = content.match(/Parameters:\s*([\s\S]*?)$/);
			if (paramSection) {
				const paramText = paramSection[1];
				// Match lines like "query: "BP network pump price general conditions""
				const paramLines = paramText.split('\n').filter(line => line.trim() && line.includes(':'));
				
				for (const line of paramLines) {
					const [key, ...valueParts] = line.split(':');
					if (key && valueParts.length > 0) {
						const value = valueParts.join(':').trim();
						try {
							parameters[key.trim()] = JSON.parse(value);
						} catch {
							// Remove surrounding quotes if present
							parameters[key.trim()] = value.replace(/^["']|["']$/g, '');
						}
					}
				}
			}

			tools.push({
				type: 'tool-call',
				name,
				id,
				parameters
			});

			// Remove the tool call from content
			cleanedContent = cleanedContent.replace(fullMatch, '');
		}

		// Parse tool results
		const toolResultRegex = /<tool-result data-name="([^"]*)">([\s\S]*?)<\/tool-result>/g;
		
		while ((match = toolResultRegex.exec(text)) !== null) {
			const [fullMatch, name, content] = match;
			
			// Extract the actual result content, removing the header
			const resultContent = content
				.replace(/📊\s*[^:]*Result:\s*/, '') // Remove the result header
				.replace(/```json\s*/, '')
				.replace(/\s*```\s*/, '')
				.replace(/\s*\.\.\.\(truncated\)\s*/, '')
				.trim();

			tools.push({
				type: 'tool-result',
				name,
				result: resultContent
			});

			// Remove the tool result from content
			cleanedContent = cleanedContent.replace(fullMatch, '');
		}

		return { tools, cleanedContent: cleanedContent.trim() };
	}

	async function processContent(content: string, sources: WebSearchSource[]): Promise<Token[]> {
		if (worker) {
			return new Promise((resolve) => {
				if (!worker) {
					throw new Error("Worker not initialized");
				}
				worker.onmessage = (event: MessageEvent<OutgoingMessage>) => {
					if (event.data.type !== "processed") {
						throw new Error("Invalid message type");
					}
					resolve(event.data.tokens);
				};
				worker.postMessage(
					JSON.parse(JSON.stringify({ content, sources, type: "process" })) as IncomingMessage
				);
			});
		} else {
			return processTokens(content, sources);
		}
	}

	$effect(() => {
		const { tools, cleanedContent } = parseDatabricksTools(content);
		databricksTools = tools;
		processedContent = cleanedContent;

		if (!browser) {
			tokens = processTokensSync(processedContent, sources);
		} else {
			(async () => {
				updateDebouncer.startRender();
				tokens = await processContent(processedContent, sources).then(
					async (tokens) =>
						await Promise.all(
							tokens.map(async (token) => {
								if (token.type === "text") {
									token.html = DOMPurify.sanitize(await token.html);
								}
								return token;
							})
						)
				);

				updateDebouncer.endRender();
			})();
		}
	});

	onMount(() => {
		// todo: fix worker, seems to be transmitting a lot of data
		// worker = browser && window.Worker ? new MarkdownWorker() : null;

		DOMPurify.addHook("afterSanitizeAttributes", (node) => {
			if (node.tagName === "A") {
				node.setAttribute("target", "_blank");
				node.setAttribute("rel", "noreferrer");
			}
		});
	});
</script>

<!-- Render Databricks tools first -->
{#each databricksTools as tool}
	{#if tool.type === 'tool-call'}
		<DatabricksToolRenderer
			toolName={tool.name}
			toolId={tool.id}
			parameters={tool.parameters}
			isCall={true}
		/>
	{:else if tool.type === 'tool-result'}
		<DatabricksToolRenderer
			toolName={tool.name}
			result={tool.result}
			isResult={true}
		/>
	{/if}
{/each}

<!-- Render normal markdown content -->
{#each tokens as token}
	{#if token.type === "text"}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html token.html}
	{:else if token.type === "code"}
		<CodeBlock code={token.code} rawCode={token.rawCode} />
	{/if}
{/each}
