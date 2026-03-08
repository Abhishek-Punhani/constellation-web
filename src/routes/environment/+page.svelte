<script lang="ts">
	import { satellites, constellation, controllers } from '$lib/store';
	import { Server, Thermometer, Cpu, MemoryStick, Wifi, Activity, Plus, X } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';

	let showAddControllerDialog = $state(false);
	let newCtrlName = $state('');
	let newCtrlHost = $state('lab-pc-01');
	let newCtrlPort = $state(9002);

	const machineGroups = $derived(
		Object.entries(
			$satellites.reduce((acc, s) => {
				if (!acc[s.host]) acc[s.host] = { host: s.host, ip: s.ip, sats: [] };
				acc[s.host].sats.push(s);
				return acc;
			}, {} as Record<string, { host: string; ip: string; sats: typeof $satellites }>)
		)
	);

	// Get metrics for all sats on a machine (aggregate)
	function machineMetrics(sats: typeof $satellites) {
		const cpuVals = sats.flatMap(s => s.metrics.find(m => m.name === 'CPU_LOAD')?.points.slice(-1).map(p => p.value) ?? []);
		const memVals = sats.flatMap(s => s.metrics.find(m => m.name === 'MEM_USED')?.points.slice(-1).map(p => p.value) ?? []);
		const rxVals = sats.flatMap(s => s.metrics.find(m => m.name === 'RX_BYTES')?.points.slice(-1).map(p => p.value) ?? []);
		const tempPoints = sats.flatMap(s => s.metrics.find(m => m.name === 'TEMPERATURE')?.points ?? []);
		const humPoints = sats.flatMap(s => s.metrics.find(m => m.name === 'HUMIDITY')?.points ?? []);
		const tempLast = tempPoints.length ? tempPoints.at(-1)?.value ?? null : null;
		const humLast = humPoints.length ? humPoints.at(-1)?.value ?? null : null;
		const isEnvNode = cpuVals.length === 0;

		return {
			cpu: cpuVals.length ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length : null,
			mem: memVals.length ? memVals.reduce((a, b) => a + b, 0) / memVals.length : null,
			rx: rxVals.length ? rxVals.reduce((a, b) => a + b, 0) : null,
			temp: tempLast, hum: humLast,
			isEnvNode,
			hasError: sats.some(s => s.state === 'ERROR'),
			allHealthy: sats.every(s => s.lives > 0)
		};
	}

	function gaugeArc(value: number, max: number, r = 38, cx = 50, cy = 54) {
		const pct = Math.min(value / max, 1);
		const angle = pct * Math.PI;
		const x = cx - r * Math.cos(angle);
		const y = cy - r * Math.sin(angle);
		return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
	}

	function gaugeColor(value: number, max: number) {
		const pct = value / max;
		if (pct < 0.6) return '#10b981';
		if (pct < 0.8) return '#f59e0b';
		return '#ef4444';
	}
</script>

<div class="p-6 space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold text-white">Environment Monitor</h1>
			<p class="text-xs text-gray-500 mt-0.5">Per-machine health — aggregated from satellite metrics</p>
		</div>
		<div class="flex items-center gap-2">
			<button
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-violet-950/30 border border-violet-800/30 text-violet-400 hover:bg-violet-950/50 transition-colors"
				onclick={() => (showAddControllerDialog = true)}
			>
				<Plus size={12} /> Add Controller
			</button>
			<NotificationCenter />
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		{#each machineGroups as [host, machine] (host)}
			{@const m = machineMetrics(machine.sats)}
			<div class="card p-5 {m.hasError ? 'border-red-900' : m.allHealthy ? 'border-green-900' : ''}">
				<!-- Machine header -->
				<div class="flex items-center gap-3 mb-4">
					<div class="w-9 h-9 rounded-lg bg-bg-elevated border border-border-bright flex items-center justify-center">
						<Server size={16} class="text-accent" />
					</div>
					<div>
						<div class="text-sm font-semibold text-white font-mono">{machine.host}</div>
						<div class="text-xs text-gray-500 font-mono">{machine.ip}</div>
					</div>
					<div class="ml-auto flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full shrink-0"
							class:bg-red-400={m.hasError}
							class:bg-green-400={!m.hasError}
						></span>
						<span class="text-xs text-gray-400">{m.hasError ? 'Error' : 'Healthy'}</span>
					</div>
				</div>

				<!-- Gauge row -->
				<div class="grid grid-cols-2 gap-4 mb-4">
					{#if !m.isEnvNode && m.cpu !== null}
					<!-- CPU Gauge -->
					<div class="bg-bg-secondary rounded-xl p-4 border border-border flex flex-col items-center">
						<svg viewBox="0 0 100 60" class="w-full" style="height: 80px;">
							<!-- Track -->
							<path d="M 12 54 A 38 38 0 0 1 88 54" fill="none" stroke="#1e1e30" stroke-width="6" stroke-linecap="round" />
							<!-- Value arc -->
							<path d={gaugeArc(m.cpu, 100)} fill="none" stroke={gaugeColor(m.cpu, 100)} stroke-width="6" stroke-linecap="round" />
							<text x="50" y="52" text-anchor="middle" font-size="14" font-weight="bold" fill="white" font-family="monospace">{m.cpu.toFixed(0)}%</text>
						</svg>
						<div class="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
							<Cpu size={11} /> CPU Load
						</div>
					</div>

					<!-- Memory Gauge -->
					{#if m.mem !== null}
					<div class="bg-bg-secondary rounded-xl p-4 border border-border flex flex-col items-center">
						<svg viewBox="0 0 100 60" class="w-full" style="height: 80px;">
							<path d="M 12 54 A 38 38 0 0 1 88 54" fill="none" stroke="#1e1e30" stroke-width="6" stroke-linecap="round" />
							<path d={gaugeArc(m.mem, 2048)} fill="none" stroke={gaugeColor(m.mem, 2048)} stroke-width="6" stroke-linecap="round" />
							<text x="50" y="52" text-anchor="middle" font-size="12" font-weight="bold" fill="white" font-family="monospace">{m.mem.toFixed(0)}MB</text>
						</svg>
						<div class="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
							<MemoryStick size={11} /> Memory
						</div>
					</div>
					{/if}
					{:else}
					<!-- Env-only node: show temp + humidity gauges instead -->
					{#if m.temp !== null}
					<div class="bg-bg-secondary rounded-xl p-4 border flex flex-col items-center {m.temp > 35 ? 'border-amber-900' : 'border-border'}">
						<svg viewBox="0 0 100 60" class="w-full" style="height: 80px;">
							<path d="M 12 54 A 38 38 0 0 1 88 54" fill="none" stroke="#1e1e30" stroke-width="6" stroke-linecap="round" />
							<path d={gaugeArc(m.temp, 50)} fill="none" stroke={m.temp > 35 ? '#f59e0b' : '#06b6d4'} stroke-width="6" stroke-linecap="round" />
							<text x="50" y="52" text-anchor="middle" font-size="13" font-weight="bold" fill="white" font-family="monospace">{m.temp.toFixed(1)}°</text>
						</svg>
						<div class="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
							<Thermometer size={11} /> Temperature
						</div>
					</div>
					{/if}
					{#if m.hum !== null}
					<div class="bg-bg-secondary rounded-xl p-4 border border-border flex flex-col items-center">
						<svg viewBox="0 0 100 60" class="w-full" style="height: 80px;">
							<path d="M 12 54 A 38 38 0 0 1 88 54" fill="none" stroke="#1e1e30" stroke-width="6" stroke-linecap="round" />
							<path d={gaugeArc(m.hum, 100)} fill="none" stroke="#8b5cf6" stroke-width="6" stroke-linecap="round" />
							<text x="50" y="52" text-anchor="middle" font-size="13" font-weight="bold" fill="white" font-family="monospace">{m.hum.toFixed(0)}%</text>
						</svg>
						<div class="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
							<Activity size={11} /> Humidity
						</div>
					</div>
					{/if}
					{/if}
				</div>

				<!-- Stats row -->
				<div class="grid grid-cols-3 gap-2 mb-4">
					{#if m.rx !== null}
					<div class="bg-bg-secondary rounded-lg p-2.5 border border-border">
						<div class="text-[0.65rem] text-gray-500 flex items-center gap-1"><Wifi size={9} /> Network RX</div>
						<div class="text-sm text-white font-mono mt-0.5">{(m.rx / 1000).toFixed(1)} <span class="text-xs text-gray-500">kB/s</span></div>
					</div>
					{/if}
					{#if !m.isEnvNode && m.temp !== null}
						<div class="bg-bg-secondary rounded-lg p-2.5 border {m.temp > 35 ? 'border-amber-900' : 'border-border'}">
							<div class="text-[0.65rem] text-gray-500 flex items-center gap-1"><Thermometer size={9} /> Temperature</div>
							<div class="text-sm font-mono mt-0.5 {m.temp > 35 ? 'text-amber-400' : 'text-white'}">
								{m.temp.toFixed(1)}°C
							</div>
						</div>
					{/if}
					{#if !m.isEnvNode && m.hum !== null}
						<div class="bg-bg-secondary rounded-lg p-2.5 border border-border">
							<div class="text-[0.65rem] text-gray-500">Humidity</div>
							<div class="text-sm text-white font-mono mt-0.5">{m.hum.toFixed(1)}%</div>
						</div>
					{/if}
				</div>

				<!-- Satellite list on this machine -->
				<div>
					<p class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2">Satellites ({machine.sats.length})</p>
					<div class="space-y-1">
						{#each machine.sats as sat}
							<a href="/satellites/{sat.id}" class="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-bg-elevated transition-colors">
								<span class="w-1.5 h-1.5 rounded-full shrink-0"
									style="background: {sat.state === 'RUN' ? '#10b981' : sat.state === 'ERROR' ? '#ef4444' : sat.state === 'ORBIT' ? '#06b6d4' : '#6b7280'}"
								></span>
								<span class="font-mono text-gray-300 flex-1">{sat.name}</span>
								<span class="text-gray-500">:{sat.port}</span>
							</a>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Add Controller Dialog -->
{#if showAddControllerDialog}
	<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
		<div class="card-elevated p-6 w-full max-w-md">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-base font-semibold text-white">Add Controller</h2>
				<button onclick={() => (showAddControllerDialog = false)} class="text-gray-600 hover:text-gray-300 p-1"><X size={16} /></button>
			</div>
			<div class="space-y-3">
				<div>
					<label for="ctrl-name" class="text-xs text-gray-400 mb-1 block">Name</label>
					<input id="ctrl-name" class="input w-full" placeholder="e.g. MissionControl.lab" bind:value={newCtrlName} />
				</div>
				<div>
					<label for="ctrl-host" class="text-xs text-gray-400 mb-1 block">Host</label>
					<input id="ctrl-host" class="input w-full" placeholder="lab-pc-01" bind:value={newCtrlHost} />
				</div>
				<div>
					<label for="ctrl-port" class="text-xs text-gray-400 mb-1 block">Port</label>
					<input id="ctrl-port" class="input w-full" type="number" min="1024" max="65535" placeholder="9002" bind:value={newCtrlPort} />
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
