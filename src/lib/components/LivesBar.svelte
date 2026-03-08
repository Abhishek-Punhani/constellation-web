<script lang="ts">
	// Lives bar — shows heartbeat health as filled hearts
	const { lives, maxLives, extrasystole = false }: {
		lives: number;
		maxLives: number;
		extrasystole?: boolean;
	} = $props();
	</script>

<div class="flex items-center gap-0.5" class:extrasystole-flash={extrasystole} title="{lives}/{maxLives} lives remaining">
	{#each Array(maxLives) as _, i}
		<svg
			class="w-3 h-3 transition-all duration-300"
			class:opacity-20={i >= lives}
			viewBox="0 0 16 16"
			fill={i < lives ? (lives <= 1 ? '#ef4444' : lives <= 2 ? '#f59e0b' : '#34d399') : '#374151'}
		>
			<path d="M8 14s-6-4.35-6-8a4 4 0 0 1 6-3.46A4 4 0 0 1 14 6c0 3.65-6 8-6 8z"/>
		</svg>
	{/each}
	{#if extrasystole}
		<span class="text-[0.6rem] text-orange-400 font-mono ml-1 animate-pulse">⚡ EXT</span>
	{/if}
</div>
