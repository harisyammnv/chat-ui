<script lang="ts">
	import { onMount } from 'svelte';
	import CarbonTools from "~icons/carbon/tools";
	
	interface Props {
		content: string;
	}
	
	let { content }: Props = $props();
	
	let processedContent = $state(content);
	
	onMount(() => {
		// Parse and enhance tool calls and results
		processedContent = content
			// Replace tool-call tags with enhanced UI
			.replace(
				/<tool-call data-name="([^"]*)" data-id="([^"]*)">\s*([\s\S]*?)\s*<\/tool-call>/g,
				(match, name, id, innerContent) => {
					const cleanContent = innerContent
						.replace(/🔧 \*\*Using Tool: ([^*]*)\*\*/, '')
						.trim();
					
					return `<div class="databricks-tool-call my-3 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
						<div class="flex items-center gap-2 mb-2">
							<div class="flex h-6 w-6 items-center justify-center rounded bg-purple-600/10 dark:bg-purple-600/20">
								<svg class="h-4 w-4 text-purple-700 dark:text-purple-500" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z" clip-rule="evenodd"></path>
									<path d="M11 4a1 1 0 10-2 0v1a1 1 0 002 0V4zM10 7a1 1 0 011 1v1h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1zM16 10a1 1 0 100 2 1 1 0 000-2zM9 13a1 1 0 011-1h1a1 1 0 110 2v2a1 1 0 11-2 0v-3zM7 11a1 1 0 100-2H4a1 1 0 100 2h3zM17 13a1 1 0 01-1 1h-2a1 1 0 110-2h2a1 1 0 011 1zM16 17a1 1 0 100-2h-3a1 1 0 100 2h3z"></path>
								</svg>
							</div>
							<span class="font-semibold text-purple-900 dark:text-purple-100">Using Tool: ${name}</span>
						</div>
						<div class="ml-8 text-sm text-purple-800 dark:text-purple-200">${cleanContent}</div>
					</div>`;
				}
			)
			// Replace tool-result tags with enhanced UI
			.replace(
				/<tool-result data-name="([^"]*)">\s*([\s\S]*?)\s*<\/tool-result>/g,
				(match, name, innerContent) => {
					const cleanContent = innerContent
						.replace(/📊 \*\*([^*]*) Result:\*\*/, '')
						.trim();
					
					return `<div class="databricks-tool-result my-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
						<div class="flex items-center gap-2 mb-2">
							<div class="flex h-6 w-6 items-center justify-center rounded bg-green-600/10 dark:bg-green-600/20">
								<svg class="h-4 w-4 text-green-700 dark:text-green-500" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
								</svg>
							</div>
							<span class="font-semibold text-green-900 dark:text-green-100">${name} Result</span>
						</div>
						<div class="ml-8 text-sm text-green-800 dark:text-green-200">${cleanContent}</div>
					</div>`;
				}
			);
	});
</script>

<!-- Enhanced content with tool UI components -->
{@html processedContent}

<style>
	:global(.databricks-tool-call) {
		border-left: 4px solid rgb(147 51 234);
	}
	
	:global(.databricks-tool-result) {
		border-left: 4px solid rgb(34 197 94);
	}
	
	:global(.databricks-tool-call pre) {
		background: rgba(147, 51, 234, 0.1);
		border-radius: 0.375rem;
		padding: 0.75rem;
		margin: 0.5rem 0;
	}
	
	:global(.databricks-tool-result pre) {
		background: rgba(34, 197, 94, 0.1);
		border-radius: 0.375rem;
		padding: 0.75rem;
		margin: 0.5rem 0;
	}
</style> 