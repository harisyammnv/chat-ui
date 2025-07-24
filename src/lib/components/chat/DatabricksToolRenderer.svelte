<script lang="ts">
	import CarbonTools from "~icons/carbon/tools";
	import CarbonCheckmark from "~icons/carbon/checkmark";

	interface Props {
		toolName: string;
		toolId?: string;
		parameters?: Record<string, any>;
		result?: string;
		isCall?: boolean;
		isResult?: boolean;
	}

	let { toolName, toolId, parameters = {}, result, isCall = false, isResult = false }: Props = $props();
</script>

{#if isCall}
	<!-- Tool Call Display -->
	<details
		open
		class="group/tool my-2.5 w-fit cursor-pointer rounded-lg border border-gray-200 bg-white pl-1 pr-2.5 text-sm shadow-sm transition-all open:mb-3
        open:border-purple-500/10 open:bg-purple-600/5 open:shadow-sm dark:border-gray-800 dark:bg-gray-900 open:dark:border-purple-800/40 open:dark:bg-purple-800/10"
	>
		<summary
			class="relative flex select-none list-none items-center gap-1.5 py-1 group-open/tool:text-purple-700 group-open/tool:dark:text-purple-300"
		>
			<div
				class="relative grid size-[22px] place-items-center rounded bg-purple-600/10 dark:bg-purple-600/20"
			>
				<CarbonTools class="text-xs text-purple-700 dark:text-purple-500" />
			</div>

			<span>
				Calling tool
				<span class="font-semibold">{toolName}</span>
			</span>
		</summary>
		
		<div class="mt-1 flex items-center gap-2 opacity-80">
			<h3 class="text-sm">Parameters</h3>
			<div class="h-px flex-1 bg-gradient-to-r from-gray-500/20"></div>
		</div>
		<ul class="py-1 text-sm">
			{#each Object.entries(parameters) as [k, v]}
				{#if v !== null && v !== undefined}
					<li>
						<span class="font-semibold">{k}</span>:
						<span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
					</li>
				{/if}
			{/each}
		</ul>
	</details>
{/if}

{#if isResult}
	<!-- Tool Result Display -->
	<details
		open
		class="group/tool my-2.5 w-fit cursor-pointer rounded-lg border border-gray-200 bg-white pl-1 pr-2.5 text-sm shadow-sm transition-all open:mb-3
        open:border-green-500/10 open:bg-green-600/5 open:shadow-sm dark:border-gray-800 dark:bg-gray-900 open:dark:border-green-800/40 open:dark:bg-green-800/10"
	>
		<summary
			class="relative flex select-none list-none items-center gap-1.5 py-1 group-open/tool:text-green-700 group-open/tool:dark:text-green-300"
		>
			<div
				class="relative grid size-[22px] place-items-center rounded bg-green-600/10 dark:bg-green-600/20"
			>
				<CarbonCheckmark class="text-xs text-green-700 dark:text-green-500" />
			</div>

			<span>
				Tool result from
				<span class="font-semibold">{toolName}</span>
			</span>
		</summary>
		
		<div class="mt-1 flex items-center gap-2 opacity-80">
			<h3 class="text-sm">Result</h3>
			<div class="h-px flex-1 bg-gradient-to-r from-gray-500/20"></div>
		</div>
		<div class="py-1 text-sm">
			<div class="rounded bg-gray-50 p-2 dark:bg-gray-800">
				<pre class="whitespace-pre-wrap text-xs">{result}</pre>
			</div>
		</div>
	</details>
{/if}

<style>
	details summary::-webkit-details-marker {
		display: none;
	}
</style> 