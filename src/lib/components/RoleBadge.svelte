<script lang="ts">
	import type { AutonomyRole } from '$lib/types';
	const { role }: { role: AutonomyRole } = $props();
</script>

<span class="state-badge role-{role}" title="Autonomy role: if this satellite fails, the run is {role === 'ESSENTIAL' ? 'aborted' : role === 'DYNAMIC' ? 'stopped (graceful)' : role === 'TRANSIENT' ? 'degraded but continues' : 'unaffected'}">
	{role}
</span>
