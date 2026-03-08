<script lang="ts">
	import type { SatelliteState } from '$lib/types';

	const { state, size = 'md' }: { state: SatelliteState; size?: 'sm' | 'md' | 'lg' } = $props();

	const labels: Record<SatelliteState, string> = {
		NEW: 'NEW',
		INIT: 'INIT',
		initializing: 'INIT…',
		ORBIT: 'ORBIT',
		launching: 'LAUNCH…',
		landing: 'LAND…',
		RUN: 'RUN',
		starting: 'START…',
		stopping: 'STOP…',
		reconfiguring: 'RECONF…',
		SAFE: 'SAFE',
		interrupting: 'INTR…',
		ERROR: 'ERROR',
		DEAD: 'DEAD',
		TRANSITIONING: 'TRANS…'
	};

	const baseState = (s: SatelliteState) => {
		if (['initializing'].includes(s)) return 'INIT';
		if (['launching', 'landing'].includes(s)) return 'ORBIT';
		if (['starting', 'stopping', 'reconfiguring'].includes(s)) return 'RUN';
		if (['interrupting'].includes(s)) return 'SAFE';
		if (['TRANSITIONING'].includes(s)) return 'TRANSITIONING';
		return s;
	};
</script>

<span class="state-badge state-{baseState(state)} text-{size === 'sm' ? '[0.65rem]' : size === 'lg' ? 'sm' : '[0.7rem]'}">
	{#if ['initializing', 'launching', 'landing', 'starting', 'stopping', 'reconfiguring', 'interrupting', 'TRANSITIONING'].includes(state)}
		<span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
	{/if}
	{labels[state] ?? state}
</span>
