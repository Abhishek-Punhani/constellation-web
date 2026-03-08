<script lang="ts">
	import type { Protocol } from '$lib/types';
	const { protocol }: { protocol: Protocol } = $props();
</script>

<span class="state-badge proto-{protocol} font-mono">{protocol}</span>
