<script lang="ts">
	import { page } from '$app/stores';
	import { constellation, satellites, logs, getAllowedCommands } from '$lib/store';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import RoleBadge from '$lib/components/RoleBadge.svelte';
	import LivesBar from '$lib/components/LivesBar.svelte';
	import FSMDiagram from '$lib/components/FSMDiagram.svelte';
	import { ArrowLeft, Send, Settings, Terminal, Activity, HelpCircle, ScrollText, Radio } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import { onMount } from 'svelte';
	import type { FSMCommand, SatelliteState } from '$lib/types';

	const id = $derived($page.params.id);
	const sat = $derived($satellites.find((s) => s.id === id));

	let customCmd = $state('');
	let customPayload = $state('');
	let cmdResult = $state<string | null>(null);

		async function startDetailTour() {
			const driverModule = await import('driver.js');
			const driverFn = driverModule.driver ?? driverModule.default ?? driverModule;
			await import('driver.js/dist/driver.css');
			driverFn({
			showProgress: true,
			steps: [
				{
					element: '#sat-fsm-diagram',
					popover: {
						title: '🔄 Finite State Machine',
						description: 'Each satellite runs an FSM. Stable states: NEW → INIT → ORBIT → RUN. Transitional states (initializing, launching, starting…) happen in-between. SAFE/ERROR are reached via interrupt or failure. Active state is highlighted.'
					}
				},
				{
					element: '#sat-fsm-cmds',
					popover: {
						title: '📡 FSM Commands — CSCP',
						description: 'These send commands via the Satellite Control Protocol (CSCP) — ZeroMQ REQ/REP on the port advertised by CHIRP multicast discovery. Enabled buttons show what\'s valid in the current state.'
					}
				},
				{
					element: '#sat-custom-cmd',
					popover: {
						title: '🛠 Custom Commands — CSCP',
						description: 'Beyond the FSM, satellites expose custom commands (e.g. get_voltage, set_rate). Call get_commands to list them. Payloads are MessagePack-encoded and sent as an extra ZMQ frame.'
					}
				},
				{
					element: '#sat-health',
					popover: {
						title: '💓 Heartbeat — CHP',
						description: 'The Heartbeat Protocol (CHP) publishes a ZeroMQ PUB message every interval_ms. Three consecutive misses = 1 life lost. ⚡ Extrasystole = an out-of-order heartbeat triggered by an unexpected state change.'
					}
				},
				{
					element: '#sat-metrics',
					popover: {
						title: '📊 Live Metrics — CMDP',
						description: 'Metrics arrive on CMDP STAT/ topics at 1–10 Hz. Each message is a (name, value, unit, timestamp_ns) tuple published on the satellite\'s CMDP PUB socket. Sparklines show the last 30 points.'
					}
				},
				{
					element: '#sat-config',
					popover: {
						title: '⚙️ Configuration — CSCP',
						description: 'Read config with CSCP get_config. Apply changes via reconfigure — only valid in INIT state. Config is a key-value map passed as MessagePack in the CSCP request payload.'
					}
				},
				{
					element: '#sat-logs',
					popover: {
						title: '📜 Log Timeline — CDTP / CMDP',
						description: 'Complete event sequence for this satellite. <b>BOR</b> (Beginning of Run) is pinned at top — contains the config snapshot sent at run start. <b>EOR</b> (End of Run) is pinned at bottom with run summary. Middle entries show all CSCP, CHP, CMDP, CHIRP events in chronological order.'
					}
				}
			]
		}).drive();
	}

		onMount(() => {
			if (!sat) return;
			if (!localStorage.getItem('constellation-toured-sat')) {
				setTimeout(startDetailTour, 600);
				localStorage.setItem('constellation-toured-sat', '1');
			}
		});

	// Per-command colour (text / border / bg) for FSM buttons
	const CMD_STYLE: Record<string, string> = {
		initialize: 'text-blue-400 border-blue-800/40 bg-blue-900/10',
		launch:     'text-cyan-400 border-cyan-800/40 bg-cyan-900/10',
		start:      'text-emerald-400 border-emerald-800/40 bg-emerald-900/10',
		stop:       'text-amber-400 border-amber-800/40 bg-amber-900/10',
		land:       'text-amber-400 border-amber-800/40 bg-amber-900/10',
		reconfigure:'text-violet-400 border-violet-800/40 bg-violet-900/10',
		interrupt:  'text-orange-400 border-orange-800/40 bg-orange-900/10',
		recover:    'text-blue-400 border-blue-800/40 bg-blue-900/10',
		shutdown:   'text-red-400 border-red-800/40 bg-red-900/10',
	};

		function sendCmd() {
			if (!sat || !customCmd) return;
			let payload: unknown = undefined;
			if (customPayload.trim()) {
				try {
					payload = JSON.parse(customPayload);
				} catch (err) {
					cmdResult = '✗ Invalid JSON payload';
					return;
				}
			}
			constellation.sendCommand(sat.id, customCmd as FSMCommand, payload);
			cmdResult = `✓ Command "${customCmd}" sent`;
			setTimeout(() => (cmdResult = null), 3000);
		}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleTimeString();
	}

	function formatAge(ts: number) {
		const s = Math.floor((Date.now() - ts) / 1000);
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		return `${Math.floor(s / 3600)}h ago`;
	}

	const LEVEL_COLOR: Record<string, string> = {
		CRITICAL: 'text-red-400',
		WARNING:  'text-amber-400',
		STATUS:   'text-blue-400',
		INFO:     'text-gray-300',
		DEBUG:    'text-gray-500',
		TRACE:    'text-gray-600',
	};

	const PROTO_COLOR: Record<string, string> = {
		CHIRP: 'text-violet-400',
		CSCP:  'text-cyan-400',
		CHP:   'text-emerald-400',
		CMDP:  'text-yellow-500',
		CDTP:  'text-blue-400',
	};

	// Per-satellite log timeline (for the Log Timeline section)
	const satLogs = $derived(
		sat ? $logs.filter(e => e.satellite === sat.name).sort((a, b) => a.time - b.time) : []
	);
	const borEntry = $derived(satLogs.find(e => e.isBOR));
	const eorEntry = $derived([...satLogs].reverse().find(e => e.isEOR));
	const middleLogs = $derived(satLogs.filter(e => e !== borEntry && e !== eorEntry));
</script>

<div class="p-6 space-y-6">
	<div class="flex items-center gap-3">
		<a href="/satellites" class="p-1.5 rounded hover:bg-bg-elevated text-gray-400 hover:text-white transition-colors">
			<ArrowLeft size={16} />
		</a>
		{#if sat}
			<div>
				<h1 class="text-xl font-semibold text-white">{sat.name}</h1>
				<p class="text-sm text-gray-500">{sat.host} · {sat.ip}:{sat.port}
					<span class="ml-2 text-[0.6rem] font-mono px-1.5 py-0.5 rounded border {sat.language === 'Python' ? 'text-yellow-400 border-yellow-800/40 bg-yellow-900/10' : 'text-blue-400 border-blue-800/40 bg-blue-900/10'}">{sat.language}/{sat.template}</span>
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={startDetailTour}>
					<HelpCircle size={13} /> Guide
				</button>
				<StateBadge state={sat.state} size="md" />
				<RoleBadge role={sat.role} />
				<NotificationCenter />
			</div>
		{:else}
			<p class="text-gray-400">Satellite not found.</p>
		{/if}
	</div>

	{#if sat}
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Left col: FSM + commands -->
			<div class="space-y-4">
				<!-- FSM Diagram (SVG) -->
				<div id="sat-fsm-diagram" class="card p-4">
					<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<Activity size={12} /> FSM State Diagram
					</h2>
					<FSMDiagram
					state={sat.state}
					onTransition={(cmd) => {
						if (getAllowedCommands(sat.state).includes(cmd as FSMCommand)) {
							constellation.sendCommand(sat.id, cmd as FSMCommand);
						}
					}}
				/>
				</div>

				<!-- FSM Command Buttons -->
				<div id="sat-fsm-cmds" class="card p-4">
					<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<Send size={12} /> FSM Commands
					</h2>
					<div class="grid grid-cols-2 gap-2">
						{#each ['initialize','launch','start','stop','land','reconfigure','interrupt','recover'] as cmd}
							{@const allowed = getAllowedCommands(sat.state).includes(cmd as FSMCommand)}
							<button
							class="py-1.5 px-3 rounded text-xs font-medium transition-all duration-150 border {allowed ? (CMD_STYLE[cmd] ?? 'text-violet-400 border-violet-800/40 bg-violet-900/10') : 'bg-bg-secondary border-border text-gray-600 cursor-not-allowed'}"
								disabled={!allowed}
								onclick={() => constellation.sendCommand(sat.id, cmd as FSMCommand)}
							>
								{cmd}
							</button>
						{/each}
					</div>
				</div>

				<!-- Custom Command -->
				<div id="sat-custom-cmd" class="card p-4">
					<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<Terminal size={12} /> Custom Command (CSCP)
					</h2>
					<div class="space-y-2">
						<select class="select w-full text-xs" bind:value={customCmd}>
							<option value="">Select command…</option>
							{#each sat.availableCommands as c}
								<option value={c}>{c}</option>
							{/each}
						</select>
						<input class="input w-full text-xs font-mono" placeholder='Payload (JSON)' bind:value={customPayload} />
						<button class="btn-primary w-full text-xs" onclick={sendCmd}>Send</button>
						{#if cmdResult}
							<p class="text-xs text-green-400">{cmdResult}</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Right col: status, config, metrics -->
			<div class="lg:col-span-2 space-y-4">
				<!-- Health Row -->
				<div id="sat-health" class="grid grid-cols-3 gap-4">
					<div class="card p-3">
						<div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-1">Heartbeat</div>
						<LivesBar lives={sat.lives} maxLives={sat.maxLives} extrasystole={sat.extrasystole} />
						<div class="text-[0.65rem] text-gray-500 mt-1 font-mono">{formatAge(sat.lastHeartbeat)}</div>
					</div>
					<div class="card p-3">
						<div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-1">Last Transition</div>
						<div class="text-sm text-white font-mono">{formatTime(sat.lastStateChange)}</div>
						<div class="text-[0.65rem] text-gray-500 mt-0.5">{formatAge(sat.lastStateChange)}</div>
					</div>
					<div class="card p-3">
						<div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-1">HB Interval</div>
						<div class="text-sm text-white font-mono">{sat.heartbeatInterval}ms</div>
					</div>
				</div>

				<!-- Status string -->
				<div class="card p-4">
					<div class="text-xs text-gray-500 uppercase tracking-wider mb-2">Status</div>
					<p class="text-sm text-gray-200">{sat.status}</p>
				</div>

				<!-- Dependencies -->
				{#if sat.dependencies.length > 0}
					<div class="card p-4">
						<div class="text-xs text-gray-500 uppercase tracking-wider mb-2">Launch Dependencies (require_after)</div>
						<div class="space-y-1.5">
							{#each sat.dependencies as dep}
								<div class="flex items-center gap-2 text-xs bg-bg-secondary rounded p-2 border border-border">
									<span class="text-cyan-400 font-mono">{dep.satellite}</span>
									<span class="text-gray-600">must reach</span>
									<StateBadge state={dep.requiredState} size="sm" />
									<span class="text-gray-600">before</span>
									<span class="text-gray-400 font-mono">{dep.transition}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Live Metrics mini charts -->
				{#if sat.metrics.length > 0}
					<div id="sat-metrics" class="card p-4">
						<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
							<Activity size={12} /> Live Metrics
						</h2>
						<div class="grid grid-cols-2 gap-4">
							{#each sat.metrics.slice(0, 4) as metric}
								{@const pts = metric.points.slice(-30)}
								{@const vals = pts.map(p => p.value)}
								{@const min = Math.min(...vals)}
								{@const max = Math.max(...vals)}
								{@const range = max - min || 1}
								{@const last = vals[vals.length - 1] ?? 0}
								<div class="bg-bg-secondary rounded-lg p-3 border border-border">
									<div class="flex justify-between items-baseline mb-2">
										<span class="text-[0.65rem] text-gray-400 font-mono">{metric.name}</span>
										<span class="text-sm font-medium text-white">{last.toFixed(1)}<span class="text-[0.65rem] text-gray-500 ml-0.5">{metric.unit}</span></span>
									</div>
									<svg viewBox="0 0 100 24" class="w-full" preserveAspectRatio="none" style="height: 36px;">
										<polyline
											points={pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${24 - ((p.value - min) / range) * 22}`).join(' ')}
											fill="none" stroke="#7c6af7" stroke-width="1.5"
										/>
									</svg>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Config -->
				<div id="sat-config" class="card p-4">
					<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<Settings size={12} /> Configuration
						{#if sat.state === 'INIT' || sat.state === 'NEW'}
							<span class="text-[0.6rem] text-green-400 border border-green-900/50 bg-green-900/10 px-1.5 py-0.5 rounded ml-auto">Editable</span>
						{:else}
							<span class="text-[0.6rem] text-gray-500 border border-border-bright px-1.5 py-0.5 rounded ml-auto">Locked (not in INIT)</span>
						{/if}
					</h2>
					<pre class="text-xs font-mono text-gray-300 bg-bg-primary rounded p-3 overflow-auto max-h-40 border border-border">{JSON.stringify(sat.config, null, 2)}</pre>
				</div>

				<!-- CHIRP Identity -->
				<div class="card p-4">
					<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<Radio size={12} /> CHIRP Identity
						<span class="ml-auto text-[0.6rem] font-mono text-violet-400/70 border border-violet-800/30 bg-violet-900/10 px-1.5 py-0.5 rounded">UDP 7123</span>
					</h2>
					<div class="space-y-1.5 text-xs">
						<div class="flex gap-2 items-center">
							<span class="text-gray-500 w-20 shrink-0">Group hash</span>
							<span class="font-mono text-[0.7rem] text-violet-300 bg-violet-950/30 px-1.5 py-0.5 rounded border border-violet-800/30 truncate">{sat.chirpId.groupHash}</span>
						</div>
						<div class="flex gap-2 items-center">
							<span class="text-gray-500 w-20 shrink-0">Host hash</span>
							<span class="font-mono text-[0.7rem] text-cyan-300 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-800/30 truncate">{sat.chirpId.hostHash}</span>
						</div>
						<p class="text-[0.6rem] text-gray-600 pt-1 leading-relaxed border-t border-border mt-2">
							CHIRP broadcasts MD5-hashed group &amp; host identifiers on the local multicast group.
							Controllers discover satellites by listening for OFFER beacons on UDP&nbsp;7123.
						</p>
					</div>
				</div>

				<!-- Log Timeline -->

				<div id="sat-logs" class="card p-4">
					<h2 class="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<ScrollText size={12} /> Log Timeline
						<span class="ml-auto text-[0.6rem] text-gray-600">{satLogs.length} entries</span>
					</h2>

					<!-- BOR — pinned at top -->
					{#if borEntry}
						<div class="border-l-2 border-blue-500 pl-3 py-2 mb-2 bg-blue-950/20 rounded-r">
							<div class="flex items-center gap-2 mb-0.5">
								<span class="text-[0.6rem] font-bold font-mono text-blue-400 uppercase tracking-wider">BOR</span>
								<span class="text-[0.6rem] font-mono text-gray-500">{formatTime(borEntry.time)}</span>
								<span class="text-[0.55rem] font-mono text-blue-500/60 border border-blue-800/40 px-1 rounded">{borEntry.protocol}</span>
							</div>
							<p class="text-xs text-blue-200/80 leading-snug">{borEntry.message}</p>
						</div>
					{/if}

					<!-- Middle scrollable entries -->
					<div class="overflow-y-auto max-h-72 my-2 space-y-px">
						{#if middleLogs.length === 0}
							<p class="text-[0.65rem] text-gray-600 italic py-2 text-center">No log entries</p>
						{:else}
							{#each middleLogs as entry (entry.id)}
								<div class="flex items-start gap-2 py-1 border-b border-bg-card text-xs {entry.isExtrasystole ? 'bg-amber-950/10' : ''} {entry.isBOR ? 'bg-blue-950/10' : ''}">
									<span class="text-[0.58rem] font-mono text-gray-600 shrink-0 w-16 pt-px">{formatTime(entry.time)}</span>
									<span class="text-[0.58rem] font-mono shrink-0 w-16 pt-px {LEVEL_COLOR[entry.level] ?? 'text-gray-400'}">{entry.level}</span>
									<span class="text-[0.58rem] font-mono shrink-0 w-12 pt-px {PROTO_COLOR[entry.protocol] ?? 'text-gray-500'}">{entry.protocol}</span>
									{#if entry.topic}
										<span class="text-[0.55rem] font-mono shrink-0 w-10 pt-px text-gray-500">{entry.topic}/</span>
									{:else}
										<span class="shrink-0 w-10"></span>
									{/if}
									<span class="text-[0.7rem] text-gray-300 leading-tight flex-1">
										{#if entry.isExtrasystole}<span class="text-amber-400">⚡ </span>{/if}
										{entry.message}
									</span>
								</div>
							{/each}
						{/if}
					</div>

					<!-- EOR — pinned at bottom -->
					{#if eorEntry}
						<div class="border-l-2 border-green-500 pl-3 py-2 mt-2 bg-green-950/20 rounded-r">
							<div class="flex items-center gap-2 mb-0.5">
								<span class="text-[0.6rem] font-bold font-mono text-green-400 uppercase tracking-wider">EOR</span>
								<span class="text-[0.6rem] font-mono text-gray-500">{formatTime(eorEntry.time)}</span>
								<span class="text-[0.55rem] font-mono text-green-500/60 border border-green-800/40 px-1 rounded">{eorEntry.protocol}</span>
							</div>
							<p class="text-xs text-green-200/80 leading-snug">{eorEntry.message}</p>
						</div>
					{:else}
						<div class="border-l-2 border-gray-700 pl-3 py-2 mt-2 rounded-r">
							<p class="text-[0.65rem] text-gray-600 italic">EOR not received — run still active</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
