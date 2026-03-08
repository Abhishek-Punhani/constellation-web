<script lang="ts">
	import { constellation, satellites, controllers, listeners, globalState, isMixedState, commandResponses } from '$lib/store';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import RoleBadge from '$lib/components/RoleBadge.svelte';
	import LivesBar from '$lib/components/LivesBar.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Play, Square, Zap, Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Radio, Server, Eye, FileText, Timer, X, FolderOpen } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	// driver.js is browser-only — imported dynamically inside onMount
	import type { FSMCommand, Satellite as SatType, Controller, Listener } from '$lib/types';
	import { getAllowedCommands } from '$lib/store';

	let showAddDialog = $state(false);
	let newSatName = $state('');
	let newSatType = $state('Sputnik');
	let newSatHost = $state('lab-pc-01');
	const satelliteHosts = $derived([...new Set($satellites.map((sat) => sat.host).filter(Boolean))].sort());
	let showDemoInfo = $state(true);
	let _prevProjectName = $state('');
	const demoBannerErrorSat = $derived(
		$constellation.satellites.find(
			(s) => s.state === 'ERROR' && (s.role === 'TRANSIENT' || s.role === 'NONE')
		) ?? null
	);
	$effect(() => {
		if (satelliteHosts.length > 0 && !satelliteHosts.includes(newSatHost)) {
			newSatHost = satelliteHosts[0]!;
		}
	});

	$effect(() => {
		const name = $constellation.name;
		if (_prevProjectName !== '' && name !== _prevProjectName) {
			showDemoInfo = true;
		}
		_prevProjectName = name;
	});

	let showAddControllerDialog = $state(false);
	let newCtrlName = $state('');
	let newCtrlHost = $state('lab-pc-01');
	let newCtrlPort = $state(9002);

	// Run identifier input
	let runLabel = $state('');

	// Run duration timer
	let runElapsed = $state('');
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	// Right-click context menu
	let contextMenu = $state<{ x: number; y: number; sat: SatType } | null>(null);

	let infraDetail = $state<{ type: 'controller' | 'listener'; data: Controller | Listener } | null>(null);

	const infraRows = $derived(getInfraRows(infraDetail));

	// Deduce config
	let showDeducedConfig = $state(false);
	let deducedConfig = $state<Record<string, unknown> | null>(null);

	// Command response display
	let lastResponse = $derived($commandResponses[$commandResponses.length - 1] ?? null);
	let showResponse = $state(false);
	let responseTimeout: ReturnType<typeof setTimeout> | null = null;

	// Watch for new responses
	$effect(() => {
		if (lastResponse) {
			showResponse = true;
			if (responseTimeout) clearTimeout(responseTimeout);
			responseTimeout = setTimeout(() => { showResponse = false; }, 5000);
		}
	});

	const stateColor: Record<string, string> = {
		NEW: '#6b7280', INIT: '#3b82f6', ORBIT: '#06b6d4', RUN: '#10b981',
		SAFE: '#f59e0b', ERROR: '#ef4444', DEAD: '#374151', TRANSITIONING: '#8b5cf6'
	};

	function formatAge(ts: number) {
		const s = Math.floor((Date.now() - ts) / 1000);
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		return `${Math.floor(s / 3600)}h ago`;
	}

	function openInfraDetail(type: 'controller' | 'listener', data: Controller | Listener) {
		infraDetail = { type, data };
	}

	function getInfraRows(detail: { type: 'controller' | 'listener'; data: Controller | Listener } | null) {
		if (!detail) return [];
		if (detail.type === 'controller') {
			const ctrl = detail.data as Controller;
			return [
				{ label: 'Name', value: ctrl.name },
				{ label: 'Host', value: ctrl.host },
				{ label: 'IP', value: ctrl.ip },
				{ label: 'Port', value: String(ctrl.port) },
				{ label: 'Connected', value: ctrl.connected ? 'Yes' : 'No' },
				{ label: 'Discovered sats', value: String(ctrl.discoveredSatellites) },
				{ label: 'Last activity', value: formatAge(ctrl.lastActivity) }
			];
		}
		const lst = detail.data as Listener;
		return [
			{ label: 'Name', value: lst.name },
			{ label: 'Kind', value: lst.kind },
			{ label: 'Host', value: lst.host },
			{ label: 'IP', value: lst.ip },
			{ label: 'Port', value: String(lst.port) },
			{ label: 'Topics', value: lst.subscribedTopics.join(', ') || '—' },
			{ label: 'Subscription', value: `${lst.subscriptionLevel}+` },
			{ label: 'Last activity', value: formatAge(lst.lastActivity) }
		];
	}

	function formatElapsed(ms: number): string {
		const totalSec = Math.floor(ms / 1000);
		const h = Math.floor(totalSec / 3600);
		const m = Math.floor((totalSec % 3600) / 60);
		const s = totalSec % 60;
		if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
		if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
		return `${s}s`;
	}

	function updateTimer() {
		const run = $constellation.currentRun;
		if (run && !run.endTime) {
			runElapsed = formatElapsed(Date.now() - run.startTime);
		} else {
			runElapsed = '';
		}
	}

	function handleContextMenu(e: MouseEvent, sat: SatType) {
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, sat };
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	function handleStartRun() {
		constellation.sendCommand('all', 'start', { label: runLabel });
	}

	const globalStatusIcon = $derived(
		$globalState === 'RUN' ? CheckCircle2 :
		$globalState === 'ERROR' ? AlertTriangle :
		$globalState === 'ORBIT' ? Zap : Clock
	);

	// alias for template use (Svelte 5 requires capitalized component variables)
	const GlobalIcon = $derived(globalStatusIcon);
</script>

<div class="p-6 space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold text-white">Mission Control</h1>
			<p class="text-sm text-gray-500 mt-0.5">{$constellation.name} · {$constellation.groupName} · {$satellites.length} satellites · {$controllers.length} controllers · {$listeners.length} listeners</p>
			<button class="btn-ghost text-xs flex items-center gap-1.5 my-2" onclick={() => (showAddDialog = true)}>
				<Plus size={13} /> Add Satellite
			</button>
		</div>
		<NotificationCenter />
	</div>

	{#if showDemoInfo}
		<div class="flex items-center gap-3 px-4 py-3 bg-amber-900/20 border border-amber-700/30 rounded-xl text-xs text-amber-300">
			<span class="flex-1">
				all data is simulated for <strong class="text-amber-200">{$constellation.name}</strong>.
				{#if demoBannerErrorSat}
					<strong class="text-amber-200">{demoBannerErrorSat.name}</strong> is intentionally in ERROR
					(lives {demoBannerErrorSat.lives}/{demoBannerErrorSat.maxLives}{demoBannerErrorSat.extrasystole ? ', extrasystole ⚡' : ''})
					to demonstrate the CHP heartbeat lives system.
					Its role is <strong class="text-amber-200">{demoBannerErrorSat.role}</strong> — it won't block the constellation from running.
				{:else}
					All satellites are healthy — no intentional errors in this project snapshot.
				{/if}
			</span>
			<button onclick={() => (showDemoInfo = false)} class="text-amber-700 hover:text-amber-400 text-base leading-none shrink-0">×</button>
		</div>
	{/if}

	<!-- Global State Banner -->
	<div id="tour-global" class="card p-4 flex items-center gap-4">
		<div class="w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0"
			style="border-color: {stateColor[$globalState] ?? '#6b7280'}; background: {stateColor[$globalState] ?? '#6b7280'}22">
			<GlobalIcon size={18} style="color: {stateColor[$globalState]}" />
		</div>
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-white">Constellation State</span>
				<StateBadge state={$globalState} size="md" />
				{#if $isMixedState}
					<span class="text-xs font-mono text-amber-400 border border-amber-700/40 bg-amber-900/10 px-1.5 py-0.5 rounded" title="Satellites are in different states — showing lowest state">
						≊ mixed
					</span>
				{/if}
			</div>
			<p class="text-xs text-gray-400 mt-0.5 truncate">{$constellation.globalStatus}</p>
		</div>
		<!-- Run panel: active run info + duration timer -->
		{#if $constellation.runActive && $constellation.currentRun}
			{@const run = $constellation.currentRun}
			<div class="shrink-0 text-right border-l border-border pl-4 space-y-0.5">
				<div class="flex items-center justify-end gap-1.5">
					<span class="text-xs text-gray-500">Run</span>
					<span class="text-sm font-mono text-green-400 font-semibold">#{run.runNumber}</span>
				</div>
				{#if run.runIdentifier.label}
					<div class="text-[0.65rem] text-gray-400 truncate max-w-36 text-right">{run.runIdentifier.label}</div>
				{/if}
				<div class="flex items-center justify-end gap-1 text-xs font-mono text-green-500">
					<Timer size={11} />
					{runElapsed}
				</div>
				<div class="text-[0.65rem] text-gray-500">{run.eventCount.toLocaleString()} events</div>
			</div>
		{/if}
	</div>

	<!-- Command response toast -->
	{#if showResponse && lastResponse}
		<div class="card p-3 border-l-2 border-violet-500 flex items-start gap-3 text-xs">
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2 mb-0.5">
					<span class="text-violet-400 font-mono font-medium">{lastResponse.command}</span>
					<span class="text-gray-500">→</span>
					<span class="text-gray-300">{lastResponse.target}</span>
					<span class="ml-1 px-1.5 py-0.5 rounded text-[0.6rem] font-medium {lastResponse.reply === 'SUCCESS' ? 'bg-green-900/30 text-green-400 border border-green-800/40' : 'bg-red-900/30 text-red-400 border border-red-800/40'}">{lastResponse.reply}</span>
				</div>
				<pre class="text-[0.65rem] font-mono text-gray-400 bg-bg-primary rounded p-1.5 overflow-x-auto max-h-12 border border-border">{JSON.stringify(lastResponse.payload, null, 2)}</pre>
			</div>
			<button onclick={() => (showResponse = false)} class="text-gray-600 hover:text-gray-400 shrink-0">
				<X size={12} />
			</button>
		</div>
	{/if}
	<!-- Quick Stats Row -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
		{#each [
			{ label: 'Running', count: $satellites.filter(s => s.state === 'RUN').length, color: '#10b981' },
			{ label: 'In Orbit', count: $satellites.filter(s => s.state === 'ORBIT').length, color: '#06b6d4' },
			{ label: 'Errors', count: $satellites.filter(s => s.state === 'ERROR').length, color: '#ef4444' },
			{ label: 'Total', count: $satellites.length, color: '#7c6af7' }
		] as stat}
			<div class="card p-4 text-center">
				<div class="text-2xl font-bold" style="color: {stat.color}">{stat.count}</div>
				<div class="text-xs text-gray-500 mt-1">{stat.label}</div>
			</div>
		{/each}
	</div>
	<!-- FSM Command Bar -->
	<div id="tour-controls" class="card p-3 space-y-2">
		<div class="flex items-center gap-2 flex-wrap">
			<span class="text-xs text-gray-500 mr-1 uppercase tracking-wider">All Satellites:</span>
			<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={() => constellation.sendCommand('all', 'initialize')}>
				<RefreshCw size={12} /> Initialize
			</button>
			<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={() => constellation.sendCommand('all', 'launch')}>
				<Zap size={12} /> Launch
			</button>
			<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={() => constellation.sendCommand('all', 'land')}>
				Land
			</button>
			<button class="btn-danger text-xs flex items-center gap-1.5 ml-auto" onclick={() => constellation.sendCommand('all', 'interrupt')}>
				<AlertTriangle size={12} /> Interrupt All
			</button>
		</div>
		<!-- Run identifier + start/stop -->
		<div class="flex items-center gap-2 flex-wrap border-t border-border pt-2">
			<span class="text-xs text-gray-500 mr-1 uppercase tracking-wider">Run:</span>
			<input
				class="input text-xs flex-1 min-w-0"
				style="min-width: 200px;"
				placeholder="Run identifier (e.g. beam test new sensor)"
				bind:value={runLabel}
				disabled={$constellation.runActive}
			/>
			<span class="text-[0.65rem] font-mono text-gray-500 border border-border-bright px-1.5 py-0.5 rounded shrink-0">
				seq #{$constellation.nextRunSequence}
			</span>
			{#if !$constellation.runActive}
				<button class="btn-primary text-xs flex items-center gap-1.5 shrink-0" onclick={handleStartRun}>
					<Play size={12} /> Start Run
				</button>
			{:else}
				<button class="btn-ghost text-xs flex items-center gap-1.5 shrink-0" onclick={() => constellation.sendCommand('all', 'stop')}>
					<Square size={12} /> Stop Run
				</button>
			{/if}
		</div>
		<!-- Utilities row -->
		<div class="flex items-center gap-2 border-t border-border pt-2">
			<span class="text-xs text-gray-500 mr-1 uppercase tracking-wider">Tools:</span>
			<button
				class="btn-ghost text-xs flex items-center gap-1.5"
				onclick={() => { deducedConfig = constellation.deduceConfig(); showDeducedConfig = true; }}
			>
				<FileText size={12} /> Deduce Config
			</button>
		</div>
	</div>


	<!-- Topology: Controllers & Listeners -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<!-- Controllers -->
		<div class="card p-4">
			<div class="flex items-center gap-2 mb-3">
				<Server size={14} class="text-violet-400" />
				<span class="text-sm font-medium text-white">Controllers</span>
				<span class="ml-auto text-xs text-gray-500">{$controllers.length} active</span>
			</div>
			<div class="space-y-2">
				{#each $controllers as ctrl (ctrl.id)}
					<div class="flex items-center gap-3 p-2 rounded bg-bg-secondary border border-border cursor-pointer" role="button" tabindex="0" onclick={() => openInfraDetail('controller', ctrl)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openInfraDetail('controller', ctrl)}>
						<div class="w-2 h-2 rounded-full {ctrl.connected ? 'bg-green-400' : 'bg-red-400'}"></div>
						<div class="flex-1 min-w-0">
							<div class="text-xs font-medium text-white truncate">{ctrl.name}</div>
							<div class="text-[0.65rem] text-gray-500 font-mono">{ctrl.host} · {ctrl.ip}:{ctrl.port} · {ctrl.discoveredSatellites} sats</div>
						</div>
						<span class="text-[0.65rem] text-gray-600 font-mono shrink-0">{formatAge(ctrl.lastActivity)}</span>
						<button class="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/10 transition-colors shrink-0" onclick={(e) => { e.stopPropagation(); constellation.removeController(ctrl.id); }}>
							<Trash2 size={11} />
						</button>
					</div>
				{/each}
				<button
					class="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-border-bright text-xs text-gray-500 hover:text-violet-400 hover:border-violet-700 hover:bg-violet-950/20 transition-colors"
					onclick={() => (showAddControllerDialog = true)}
				>
					<Plus size={12} /> Add Controller
				</button>
			</div>
			<p class="text-[0.6rem] text-gray-600 mt-2 italic">Controllers are stateless — can close/reopen without interrupting data-taking.</p>
		</div>
		<!-- Listeners -->
		<div class="card p-4">
			<div class="flex items-center gap-2 mb-3">
				<Eye size={14} class="text-cyan-400" />
				<span class="text-sm font-medium text-white">Listeners</span>
				<span class="ml-auto text-xs text-gray-500">{$listeners.length} active</span>
			</div>
			<div class="space-y-2">
				{#each $listeners as lst (lst.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="flex items-center gap-3 p-2 rounded bg-bg-secondary border border-border cursor-pointer" onclick={() => openInfraDetail('listener', lst)}>
						<div class="w-2 h-2 rounded-full {lst.connected ? 'bg-green-400' : 'bg-red-400'}"></div>
						<div class="flex-1 min-w-0">
							<div class="text-xs font-medium text-white truncate">{lst.name}</div>
							<div class="text-[0.65rem] text-gray-500">
								<span class="font-mono">{lst.host} · {lst.ip}:{lst.port}</span>
								<span class="text-gray-600"> · </span>
								<span class="text-cyan-600">{lst.kind}</span>
								<span class="text-gray-600"> · </span>
								<span>{lst.subscribedTopics.join(', ')}</span>
								<span class="text-gray-600"> · </span>
								<span class="text-gray-500">{lst.subscriptionLevel}+</span>
							</div>
						</div>
						<span class="text-[0.65rem] text-gray-600 font-mono shrink-0">{formatAge(lst.lastActivity)}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
	<!-- Satellite Grid -->
	<div id="tour-grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each $satellites as sat (sat.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
				class="card p-4 hover:border-border-bright transition-all duration-200 group cursor-pointer {sat.state === 'ERROR' ? 'border-red-900' : sat.state === 'RUN' ? 'border-green-900' : ''}"
				oncontextmenu={(e) => handleContextMenu(e, sat)}
				onclick={() => goto(`/satellites/${sat.id}`)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto(`/satellites/${sat.id}`)}
				tabindex="0"
				role="button"
				aria-label="{sat.name} — {sat.state}"
			>
				<!-- Top row: name + state -->
				<div class="flex items-start justify-between gap-2 mb-3">
					<div class="min-w-0">
					<span class="text-sm font-medium text-white truncate block">{sat.name}</span>
						<div class="flex items-center gap-1.5 mt-1">
							<span class="text-[0.65rem] text-gray-500 font-mono">{sat.host}</span>
							<span class="text-gray-600">·</span>
							<span class="text-[0.65rem] text-gray-500 font-mono">{sat.ip}:{sat.port}</span>
						</div>
					</div>
					<div class="flex flex-col items-end gap-1 shrink-0">
						<StateBadge state={sat.state} size="sm" />
						<RoleBadge role={sat.role} />
					</div>
				</div>

				<!-- Lives bar -->
				<div class="flex items-center justify-between mb-2">
					<LivesBar lives={sat.lives} maxLives={sat.maxLives} extrasystole={sat.extrasystole} />
					<span class="text-[0.65rem] text-gray-600 font-mono">{formatAge(sat.lastHeartbeat)}</span>
				</div>

				<!-- Status string -->
				<p class="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-3 min-h-10">{sat.status}</p>

				<!-- ERROR explanation -->
				{#if sat.state === 'ERROR'}
					<div class="text-[0.65rem] text-red-400/70 bg-red-950/20 border border-red-900/30 rounded px-2 py-1 mb-3">
						Lives {sat.lives}/{sat.maxLives} · Role: <span class="font-medium">{sat.role}</span>
						{sat.role === 'ESSENTIAL' ? ' — ⚠️ blocks constellation' : sat.role === 'TRANSIENT' ? ' — constellation continues' : ''}
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center justify-between border-t border-border pt-2">
					<div class="flex gap-1 flex-wrap">
						{#if sat.state === 'NEW' || sat.state === 'ERROR' || sat.state === 'SAFE'}
							<button class="btn-ghost text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'initialize'); }}>Initialize</button>
						{:else if sat.state === 'INIT'}
							<button class="btn-ghost text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'launch'); }}>Launch</button>
							<button class="btn-ghost text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'recover'); }}>Recover</button>
						{:else if sat.state === 'ORBIT'}
							<button class="btn-primary text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'start'); }}>▶ Start Run</button>
							<button class="btn-ghost text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'land'); }}>Land</button>
						{:else if sat.state === 'RUN'}
							<button class="btn-ghost text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'stop'); }}>■ Stop</button>
							<button class="btn-danger text-[0.7rem] py-1 px-2" onclick={(e) => { e.stopPropagation(); constellation.sendCommand(sat.id, 'interrupt'); }}>Interrupt</button>
						{:else}
							<span class="text-[0.65rem] text-gray-600 italic py-1">Transitioning…</span>
						{/if}
					</div>
					<div class="flex items-center gap-1">
						<button class="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/10 transition-colors" onclick={(e) => { e.stopPropagation(); constellation.removeSatellite(sat.id); }}>
							<Trash2 size={12} />
						</button>
					</div>
				</div>
				<p class="text-[0.55rem] text-gray-700 mt-1.5 text-right">Right-click for all commands · Click to open details</p>
			</div>
		{/each}
		<button
			class="col-span-full flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-border-bright text-xs text-gray-500 hover:text-green-400 hover:border-green-700 hover:bg-green-950/20 transition-colors"
			onclick={() => (showAddDialog = true)}
		>
			<Plus size={12} /> Add Satellite
		</button>
	</div>


</div>

<!-- Right-click Context Menu -->
{#if contextMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-50 bg-bg-elevated border border-border-bright rounded-lg shadow-2xl py-1 min-w-44"
		style="left: {Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 192)}px; top: {Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 300)}px;"
		role="menu"
		tabindex="0"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
	>
		<div class="px-3 py-1.5 border-b border-border-bright mb-1">
			<div class="text-xs font-mono font-medium text-white">{contextMenu.sat.name}</div>
			<div class="text-[0.6rem] text-gray-500">{contextMenu.sat.ip}:{contextMenu.sat.port}</div>
		</div>
		<div class="px-1">
			<p class="px-2 py-0.5 text-[0.6rem] text-gray-500 uppercase tracking-wider">FSM Commands</p>
			{#each ['initialize', 'launch', 'start', 'stop', 'land', 'reconfigure', 'interrupt', 'recover'] as cmd}
				{@const allowed = getAllowedCommands(contextMenu.sat.state).includes(cmd as FSMCommand)}
				<button
					class="w-full text-left px-3 py-1.5 text-xs rounded transition-colors {allowed ? 'text-gray-200 hover:bg-border-bright hover:text-white' : 'text-gray-600 cursor-not-allowed'}"
					disabled={!allowed}
					onclick={() => { constellation.sendCommand(contextMenu!.sat.id, cmd as FSMCommand); contextMenu = null; }}
				>
					{cmd}{!allowed ? ' — unavailable' : ''}
				</button>
			{/each}
		</div>
		{#if contextMenu.sat.availableCommands.length > 0}
			<div class="border-t border-border-bright mt-1 pt-1 px-1">
				<p class="px-2 py-0.5 text-[0.6rem] text-gray-500 uppercase tracking-wider">Custom Commands</p>
				{#each contextMenu.sat.availableCommands as cmd}
					<button
						class="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-border-bright hover:text-white rounded transition-colors font-mono"
						onclick={() => { constellation.sendCommand(contextMenu!.sat.id, cmd as FSMCommand); contextMenu = null; }}
					>
						{cmd}
					</button>
				{/each}
			</div>
		{/if}
		<div class="border-t border-border-bright mt-1 pt-1 px-1">
				<button
					class="w-full text-left px-3 py-1.5 text-xs text-cyan-400 hover:bg-border-bright rounded transition-colors"
					onclick={() => { goto(`/satellites/${contextMenu!.sat.id}`); contextMenu = null; }}
				>
					Connection Details…
				</button>
		</div>
	</div>
{/if}

{#if infraDetail}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		role="presentation"
		onclick={() => (infraDetail = null)}
		onkeydown={(e) => e.key === 'Escape' && (infraDetail = null)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="card-elevated p-5 w-full max-w-md space-y-4" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="flex items-start justify-between">
				<div>
					<h2 class="text-base font-semibold text-white font-mono">
						{infraDetail.type === 'controller' ? 'Controller Details' : 'Listener Details'}
					</h2>
					<p class="text-xs text-gray-500 mt-0.5">
						{infraDetail.type === 'controller' ? (infraDetail.data as Controller).host : (infraDetail.data as Listener).host}
					</p>
				</div>
				<button onclick={() => (infraDetail = null)} class="text-gray-600 hover:text-gray-300 transition-colors p-1">
					<X size={16} />
				</button>
			</div>

			<!-- Connection info -->
			<div class="bg-bg-secondary rounded-lg border border-border divide-y divide-border text-xs font-mono">
				{#each infraRows as row}
					<div class="flex items-center px-3 py-1.5">
						<span class="text-gray-500 w-32 shrink-0">{row.label}</span>
						<span class="text-gray-200 truncate">{row.value}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Deduce Config Modal -->
{#if showDeducedConfig && deducedConfig}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		role="presentation"
		onclick={() => (showDeducedConfig = false)}
		onkeydown={(e) => e.key === 'Escape' && (showDeducedConfig = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="card-elevated p-5 w-full max-w-2xl max-h-[80vh] flex flex-col" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between mb-3">
				<div>
					<h2 class="text-base font-semibold text-white">Deduced Configuration</h2>
					<p class="text-xs text-gray-500 mt-0.5">Read from all satellites — includes _autonomy and _data subsections</p>
				</div>
				<button onclick={() => (showDeducedConfig = false)} class="text-gray-600 hover:text-gray-300 transition-colors p-1">
					<X size={16} />
				</button>
			</div>
			<pre class="flex-1 overflow-auto text-xs font-mono text-gray-300 bg-bg-primary rounded-lg p-4 border border-border leading-relaxed">{JSON.stringify(deducedConfig, null, 2)}</pre>
			<p class="text-[0.65rem] text-gray-600 mt-2">
				Note: In a live system, this reads config via CSCP get_config + get_commands from each satellite.
			</p>
		</div>
	</div>
{/if}

<!-- Add Controller Dialog -->
{#if showAddControllerDialog}
	<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
		<div class="card-elevated p-6 w-full max-w-md">
			<h2 class="text-base font-semibold text-white mb-4">Add Controller</h2>
			<div class="space-y-3">
				<div>
					<label for="add-ctrl-name" class="text-xs text-gray-400 mb-1 block">Name</label>
					<input id="add-ctrl-name" class="input w-full" placeholder="e.g. MissionControl.lab" bind:value={newCtrlName} />
				</div>
				<div>
					<label for="add-ctrl-host" class="text-xs text-gray-400 mb-1 block">Host</label>
					<input id="add-ctrl-host" class="input w-full" placeholder="lab-pc-01" bind:value={newCtrlHost} />
				</div>
				<div>
					<label for="add-ctrl-port" class="text-xs text-gray-400 mb-1 block">Port</label>
					<input id="add-ctrl-port" class="input w-full" type="number" min="1024" max="65535" placeholder="9002" bind:value={newCtrlPort} />
				</div>
			</div>
			<div class="flex justify-end gap-2 mt-5">
				<button class="btn-ghost" onclick={() => (showAddControllerDialog = false)}>Cancel</button>
				<button class="btn-primary" onclick={() => {
					constellation.addController(newCtrlName, newCtrlHost, newCtrlPort);
					showAddControllerDialog = false; newCtrlName = '';
				}}>Add Controller</button>
			</div>
		</div>
	</div>
{/if}

<!-- Add Satellite Dialog -->
{#if showAddDialog}
	<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
		<div class="card-elevated p-6 w-full max-w-md">
			<h2 class="text-base font-semibold text-white mb-4">Add Satellite</h2>
			<div class="space-y-3">
				<div>
					<label for="add-sat-name" class="text-xs text-gray-400 mb-1 block">Instance Name</label>
					<input id="add-sat-name" class="input w-full" placeholder="e.g. hv2" bind:value={newSatName} />
				</div>
				<div>
					<label for="add-sat-type" class="text-xs text-gray-400 mb-1 block">Type</label>
					<select id="add-sat-type" class="select w-full" bind:value={newSatType}>
						{#each ['Sputnik', 'HighVoltage', 'H5DataWriter', 'EudaqNativeWriter', 'FlightRecorder', 'RandomTransmitter', 'TempSensor', 'DevNullReceiver', 'Mattermost'] as t}
							<option>{t}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="add-sat-host" class="text-xs text-gray-400 mb-1 block">Host</label>
					<select id="add-sat-host" class="select w-full" bind:value={newSatHost}>
						{#if satelliteHosts.length === 0}
							<option value="lab-pc-01">lab-pc-01</option>
						{:else}
							{#each satelliteHosts as host}
								<option value={host}>{host}</option>
							{/each}
						{/if}
					</select>
				</div>
			</div>
			<div class="flex justify-end gap-2 mt-5">
				<button class="btn-ghost" onclick={() => (showAddDialog = false)}>Cancel</button>
				<button class="btn-primary" onclick={() => {
					constellation.addSatellite(newSatName, newSatType, newSatHost);
					showAddDialog = false; newSatName = '';
				}}>Add Satellite</button>
			</div>
		</div>
	</div>
{/if}
