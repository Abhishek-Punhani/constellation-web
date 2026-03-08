<script module lang="ts">
	let globalLastToastedAt = 0;
	let globalLastDismissedAt = 0;
</script>

<script lang="ts">
	import { commandResponses } from '$lib/store';
	import { Bell, X, CheckCircle, AlertTriangle, Info, ChevronRight } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { onDestroy } from 'svelte';

	let open = $state(false);
	let lastSeenCount = $state(0);

	const unread = $derived($commandResponses.length - lastSeenCount);

	function markRead() {
		lastSeenCount = $commandResponses.length;
	}

	function toggle() {
		open = !open;
		if (open) markRead();
	}

	// Colour / icon per outcome
	function isOk(reply: string) {
		return reply === 'SUCCESS';
	}
	function style(reply: string) {
		return isOk(reply)
			? { icon: CheckCircle, text: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-800/40' }
			: { icon: AlertTriangle, text: 'text-red-400',     bg: 'bg-red-900/20',     border: 'border-red-800/40' };
	}

	function fmtTime(ts: number) {
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
	function fmtAge(ts: number) {
		const s = Math.floor((Date.now() - ts) / 1000);
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		return `${Math.floor(s / 3600)}h ago`;
	}

	// Show brief toast for newest response
	let toastVisible = $state(false);
	let toastMsg = $state('');
	let toastOk = $state(true);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
			const latest = $commandResponses[$commandResponses.length - 1];
			if (!latest) return;
			if (open) return; // don't toast when panel is already open
			// avoid re-showing the same toast repeatedly
			if (latest.timestamp <= globalLastToastedAt) return;
			if (latest.timestamp <= globalLastDismissedAt) return;
			globalLastToastedAt = latest.timestamp;
			toastMsg = `${latest.target}: ${latest.command} → ${latest.reply}`;
			toastOk = isOk(latest.reply);
			toastVisible = true;
			if (toastTimer) {
				clearTimeout(toastTimer);
				toastTimer = null;
			}
			toastTimer = setTimeout(() => (toastVisible = false), 3500);
	});

	function dismissToast() {
		const latest = $commandResponses[$commandResponses.length - 1];
		if (latest) {
			globalLastDismissedAt = Math.max(globalLastDismissedAt, latest.timestamp);
			globalLastToastedAt = Math.max(globalLastToastedAt, latest.timestamp);
		}
		toastVisible = false;
		if (toastTimer) {
			clearTimeout(toastTimer);
			toastTimer = null;
		}
	}

	onDestroy(() => {
		if (toastTimer) clearTimeout(toastTimer);
	});
</script>

<!-- Notification bell button -->
<button
	class="relative flex items-center justify-center w-9 h-9 rounded-xl bg-bg-elevated border border-border hover:border-border-bright hover:bg-bg-card transition-all text-gray-400 hover:text-gray-100 shadow-lg"
	onclick={toggle}
	aria-label="Notifications"
	title="Notifications (command responses)"
>
	<Bell size={17} />
	{#if unread > 0}
		<span class="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] rounded-full bg-accent text-[0.55rem] text-white flex items-center justify-center font-bold leading-none px-0.5 shadow-md">
			{unread > 9 ? '9+' : unread}
		</span>
	{/if}
</button>

<!-- Slide-out panel -->
{#if open}
	<!-- backdrop -->
	<div class="fixed inset-0 z-40" role="presentation" onclick={toggle} onkeydown={(e) => e.key === 'Escape' && toggle()}></div>

	<div
		class="fixed right-0 top-0 h-full w-80 bg-bg-secondary border-l border-border z-50 flex flex-col shadow-2xl"
		transition:fly={{ x: 320, duration: 220 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
			<div class="flex items-center gap-2">
				<Bell size={14} class="text-accent" />
				<span class="text-sm font-semibold text-white">Command Responses</span>
			</div>
			<div class="flex items-center gap-1">
				<span class="text-[0.65rem] text-gray-500">{$commandResponses.length} total</span>
				<button onclick={toggle} class="p-1 rounded hover:bg-bg-elevated text-gray-600 hover:text-gray-300 transition-colors ml-1"><X size={14} /></button>
			</div>
		</div>

		<!-- Response list -->
		<div class="flex-1 overflow-y-auto">
			{#if $commandResponses.length === 0}
				<div class="flex flex-col items-center justify-center h-48 gap-2 text-gray-600">
					<Bell size={28} />
					<p class="text-xs">No commands sent yet</p>
				</div>
			{:else}
				<div class="p-3 space-y-2">
				{#each [...$commandResponses].reverse() as resp (resp.timestamp + resp.target)}
					{@const s = style(resp.reply)}
						<div class="rounded-lg p-3 border {s.bg} {s.border}">
							<div class="flex items-start gap-2">
								<s.icon size={13} class="{s.text} shrink-0 mt-0.5" />
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between gap-1 mb-0.5">
										<span class="text-xs font-medium text-white truncate font-mono">{resp.target}</span>
										<span class="text-[0.6rem] text-gray-500 shrink-0">{fmtAge(resp.timestamp)}</span>
									</div>
									<div class="flex items-center gap-1.5">
										<span class="text-[0.65rem] font-mono {s.text} capitalize">{resp.command}</span>
										<ChevronRight size={9} class="text-gray-600" />
									<span class="text-[0.65rem] {s.text}">{resp.reply}</span>
								</div>
									<p class="text-[0.55rem] text-gray-600 mt-1 font-mono">{fmtTime(resp.timestamp)}</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Footer hint -->
		<div class="px-4 py-2.5 border-t border-border shrink-0">
			<p class="text-[0.6rem] text-gray-600">Last 50 responses kept · Commands sent via CSCP REQ/REP</p>
		</div>
	</div>
{/if}

<!-- Toast notification -->
{#if toastVisible}
	<div
		class="fixed bottom-5 right-5 z-200 flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl
			{toastOk ? 'bg-emerald-900/80 border-emerald-700/50' : 'bg-red-900/80 border-red-700/50'}"
		transition:fly={{ y: 20, duration: 200 }}
		role="status"
		aria-live="polite"
	>
		{#if toastOk}
			<CheckCircle size={14} class="text-emerald-400 shrink-0" />
		{:else}
			<AlertTriangle size={14} class="text-red-400 shrink-0" />
		{/if}
		<span class="text-xs text-white">{toastMsg}</span>
		<button onclick={dismissToast} class="text-gray-400 hover:text-white transition-colors ml-1"><X size={11} /></button>
	</div>
{/if}
