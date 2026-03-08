<script lang="ts">
	import { satellites, constellation } from '$lib/store';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import { ListOrdered, Plus, Trash2, ChevronUp, ChevronDown, Play, Square, Check, AlertTriangle } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import { fly } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

	let isMobile = browser ? window.innerWidth < 768 : false;

	onMount(() => {
		function handleResize() { isMobile = window.innerWidth < 768; }
		if (browser) window.addEventListener('resize', handleResize);
		return () => { if (browser) window.removeEventListener('resize', handleResize); };
	});

	interface QueueStep {
		id: string;
		satId: string;
		param: string;
		mode: 'fixed' | 'range';
		value: number;
		from: number;
		to: number;
		nSteps: number;
		unit: string;
		delayMs: number;
	}

	// ── State ─────────────────────────────────────────────────────────
	let steps = $state<QueueStep[]>([
		{
			id: 'q1',
			satId: $satellites[0]?.id ?? '',
			param: Object.keys($satellites[0]?.config ?? {})[0] ?? 'voltage',
			mode: 'range',
			value: 100,
			from: 0,
			to: 100,
			nSteps: 11,
			unit: 'V',
			delayMs: 1000,
		},
		{
			id: 'q2',
			satId: $satellites.find((s) => s.name.startsWith('RandomTransmitter'))?.id ?? $satellites[0]?.id ?? '',
			param: 'event_rate_hz',
			mode: 'range',
			value: 500,
			from: 100,
			to: 1000,
			nSteps: 10,
			unit: 'Hz',
			delayMs: 500,
		},
	]);

	let running = $state(false);
	let runProgress = $state(0);   // 0-100
	let runStatus = $state('');
	let currentStepIdx = $state(-1);
	let stopRequested = $state(false);

	// ── Form for new step ─────────────────────────────────────────────
	let formSatId = $state($satellites[0]?.id ?? '');
	let formParam = $state('');
	let formMode = $state<'fixed' | 'range'>('range');
	let formValue = $state(0);
	let formFrom = $state(0);
	let formTo = $state(100);
	let formNSteps = $state(10);
	let formUnit = $state('');
	let formDelay = $state(1000);
	let showForm = $state(false);

	// ── Derived preview rows ──────────────────────────────────────────
	interface PreviewRow { sat: string; param: string; value: number; unit: string; stepIdx: number; }
	const previewRows = $derived<PreviewRow[]>(
		steps.flatMap((step, si) => {
			const sat = $satellites.find((s) => s.id === step.satId);
			const satName = sat?.name ?? '?';
			if (step.mode === 'fixed') {
				return [{ sat: satName, param: step.param, value: step.value, unit: step.unit, stepIdx: si }];
			}
			const n = Math.max(step.nSteps, 2);
			const vals = Array.from({ length: n }, (_, i) =>
				Math.round((step.from + ((step.to - step.from) / (n - 1)) * i) * 1000) / 1000,
			);
			return vals.map((v) => ({ sat: satName, param: step.param, value: v, unit: step.unit, stepIdx: si }));
		}),
	);

	const totalTime = $derived(
		previewRows.length * (steps[0]?.delayMs ?? 1000) / 1000,
	);

	// ── Queue controls ────────────────────────────────────────────────
	function addStep() {
		const sat = $satellites.find((s) => s.id === formSatId);
		if (!sat || !formParam.trim()) return;
		steps = [
			...steps,
			{
				id: `q${Date.now()}`,
				satId: formSatId,
				param: formParam.trim(),
				mode: formMode,
				value: formValue,
				from: formFrom,
				to: formTo,
				nSteps: Math.max(formNSteps, 2),
				unit: formUnit.trim(),
				delayMs: formDelay,
			},
		];
		showForm = false;
		formParam = '';
	}

	function removeStep(id: string) {
		steps = steps.filter((s) => s.id !== id);
	}

	function moveStep(idx: number, dir: -1 | 1) {
		const next = [...steps];
		const target = idx + dir;
		if (target < 0 || target >= next.length) return;
		[next[idx], next[target]] = [next[target]!, next[idx]!];
		steps = next;
	}

	// ── Execution ─────────────────────────────────────────────────────
	async function runQueue() {
		if (running || previewRows.length === 0) return;
		running = true;
		stopRequested = false;
		runProgress = 0;
		runStatus = 'Starting queue…';

		for (let i = 0; i < previewRows.length; i++) {
			if (stopRequested) { runStatus = 'Stopped by user.'; break; }
			const row = previewRows[i]!;
			currentStepIdx = row.stepIdx;
			runStatus = `Step ${i + 1}/${previewRows.length} — ${row.sat}: ${row.param} = ${row.value}${row.unit}`;
			runProgress = Math.round((i / previewRows.length) * 100);

			// Simulate reconfigure command with new param value
			const sat = $satellites.find((s) => s.name === row.sat);
			if (sat) {
				constellation.sendCommand(sat.id, 'reconfigure', { [row.param]: row.value });
			}

			// Wait for delay
			const step = steps.find((s) => s.param === row.param);
			const delay = step?.delayMs ?? 1000;
			await new Promise((r) => setTimeout(r, delay));
		}

		runProgress = 100;
		currentStepIdx = -1;
		if (!stopRequested) runStatus = `Queue complete — ${previewRows.length} steps executed.`;
		running = false;
	}

	function stopQueue() {
		stopRequested = true;
	}

	// Config key suggestions for selected satellite
	const configSuggestions = $derived(
		($satellites.find((s) => s.id === formSatId)?.config ?? {})
	);
</script>

<div class="flex flex-col h-full min-h-0">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0 gap-3">
		<div class="flex items-center gap-3 w-full sm:w-auto">
			<div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
				<ListOrdered size={16} class="text-accent" />
			</div>
			<div>
				<h1 class="text-lg font-bold text-white">Measurement Queue</h1>
				<p class="text-xs text-gray-500">Parameter scans · sequential command dispatch · live preview</p>
			</div>
		</div>

		<div class="flex items-center gap-2 w-full sm:w-auto">
			<div class="flex gap-2 grow sm:grow-0 overflow-auto">
				{#if running}
					<button
						onclick={stopQueue}
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-800/40 text-red-400 hover:bg-red-900/30 text-xs font-medium transition-all whitespace-nowrap"
					>
						<Square size={11} /> <span class="hidden sm:inline">Stop Queue</span>
					</button>
				{:else}
					<button
						onclick={runQueue}
						disabled={steps.length === 0 || previewRows.length === 0}
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/30 text-xs font-semibold transition-all disabled:opacity-40 whitespace-nowrap"
					>
						<Play size={11} /> <span class="hidden sm:inline">Execute Queue</span>
					</button>
				{/if}
			</div>
			<NotificationCenter />
		</div>
	</div>

	<!-- Progress bar -->
	{#if running || runProgress > 0}
		<div class="px-6 py-3 border-b border-border bg-bg-secondary shrink-0 space-y-1.5" transition:fly={{ y: -8, duration: 200 }}>
			<div class="flex items-center justify-between text-xs">
				<span class="text-gray-300">{runStatus}</span>
				<span class="font-mono text-accent">{runProgress}%</span>
			</div>
			<div class="h-1 bg-border rounded-full overflow-hidden">
				<div
					class="h-full bg-accent transition-all duration-300 rounded-full {running ? 'animate-pulse' : ''}"
					style="width: {runProgress}%"
				></div>
			</div>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden flex-col sm:flex-row min-h-0">
		<!-- Left: Queue steps -->
		<div class="w-full sm:w-80 border-r border-border flex flex-col shrink-0 overflow-hidden min-h-0">
			<div class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
				<span class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Queue ({steps.length} step{steps.length !== 1 ? 's' : ''})</span>
				<button
					onclick={() => (showForm = !showForm)}
					class="flex items-center gap-1 px-2 py-1 rounded bg-accent/10 border border-accent/20 text-accent text-xs hover:bg-accent/20 transition-all"
				>
					<Plus size={10} /> Add
				</button>
			</div>

			<!-- Add step form -->
			{#if showForm}
				<div class="p-3 border-b border-border bg-bg-secondary space-y-2.5 shrink-0" transition:fly={{ y: -8, duration: 200 }}>
					<div class="grid grid-cols-2 gap-2">
						<div class="col-span-2">
							<label for="queue-form-satellite" class="text-[0.6rem] text-gray-500 uppercase">Satellite</label>
							<select id="queue-form-satellite" bind:value={formSatId} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent">
								{#each $satellites as sat}
									<option value={sat.id}>{sat.name}</option>
								{/each}
							</select>
						</div>
						<div class="col-span-2">
							<label for="queue-form-parameter" class="text-[0.6rem] text-gray-500 uppercase">Parameter</label>
							<input
								id="queue-form-parameter"
								list="config-keys"
								bind:value={formParam}
								placeholder="e.g. bias_voltage"
								class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent"
							/>
							<datalist id="config-keys">
								{#each Object.keys(configSuggestions) as k}
									<option value={k}></option>
								{/each}
							</datalist>
						</div>
						<div>
							<label for="queue-form-mode" class="text-[0.6rem] text-gray-500 uppercase">Mode</label>
							<select id="queue-form-mode" bind:value={formMode} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent">
								<option value="fixed">Fixed</option>
								<option value="range">Range</option>
							</select>
						</div>
						<div>
							<label for="queue-form-unit" class="text-[0.6rem] text-gray-500 uppercase">Unit</label>
							<input id="queue-form-unit" bind:value={formUnit} placeholder="V, Hz, ms…" class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent" />
						</div>
						{#if formMode === 'fixed'}
							<div class="col-span-2">
								<label for="queue-form-value" class="text-[0.6rem] text-gray-500 uppercase">Value</label>
								<input id="queue-form-value" type="number" bind:value={formValue} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent" />
							</div>
						{:else}
							<div>
								<label for="queue-form-from" class="text-[0.6rem] text-gray-500 uppercase">From</label>
								<input id="queue-form-from" type="number" bind:value={formFrom} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent" />
							</div>
							<div>
								<label for="queue-form-to" class="text-[0.6rem] text-gray-500 uppercase">To</label>
								<input id="queue-form-to" type="number" bind:value={formTo} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent" />
							</div>
							<div class="col-span-2">
								<label for="queue-form-nsteps" class="text-[0.6rem] text-gray-500 uppercase">N steps</label>
								<input id="queue-form-nsteps" type="number" min="2" bind:value={formNSteps} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent" />
							</div>
						{/if}
						<div class="col-span-2">
							<label for="queue-form-delay" class="text-[0.6rem] text-gray-500 uppercase">Delay per step (ms)</label>
							<input id="queue-form-delay" type="number" min="100" step="100" bind:value={formDelay} class="w-full mt-0.5 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-accent" />
						</div>
					</div>
					<div class="flex gap-2">
						<button onclick={addStep} disabled={!formParam.trim()} class="flex-1 py-1.5 rounded bg-accent text-white text-xs font-semibold hover:bg-accent-dim transition-all disabled:opacity-40">Add Step</button>
						<button onclick={() => (showForm = false)} class="px-3 py-1.5 rounded bg-bg-elevated text-gray-400 text-xs hover:text-white transition-all">Cancel</button>
					</div>
				</div>
			{/if}

			<!-- Steps list -->
			<div class="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
				{#each steps as step, idx (step.id)}
					{@const sat = $satellites.find((s) => s.id === step.satId)}
					<div
						class="rounded-lg border p-3 transition-all {currentStepIdx === idx && running ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:border-border-bright'}"
						transition:fly={{ x: -16, duration: 180 }}
					>
						<div class="flex items-start justify-between gap-1 mb-1.5">
							<div class="min-w-0">
								<div class="flex items-center gap-1.5">
									{#if currentStepIdx === idx && running}
										<div class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0"></div>
									{:else}
										<span class="text-[0.6rem] text-gray-600 font-mono">{idx + 1}.</span>
									{/if}
									<span class="text-[0.65rem] text-gray-400 truncate">{sat?.name ?? '?'}</span>
								</div>
								<p class="text-xs font-mono font-semibold text-white mt-0.5">{step.param}</p>
								<p class="text-[0.65rem] text-accent mt-0.5">
									{#if step.mode === 'fixed'}
										= {step.value}{step.unit}
									{:else}
										{step.from} → {step.to} {step.unit} · {step.nSteps} pts
									{/if}
								</p>
							</div>
							<div class="flex flex-col gap-0.5">
								<button onclick={() => moveStep(idx, -1)} disabled={idx === 0} class="p-0.5 text-gray-600 hover:text-white disabled:opacity-20 transition-colors"><ChevronUp size={12} /></button>
								<button onclick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} class="p-0.5 text-gray-600 hover:text-white disabled:opacity-20 transition-colors"><ChevronDown size={12} /></button>
								<button onclick={() => removeStep(step.id)} class="p-0.5 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
							</div>
						</div>
						<p class="text-[0.6rem] text-gray-600">delay: {step.delayMs}ms</p>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center h-32 gap-2 text-gray-600">
						<ListOrdered size={24} />
						<p class="text-xs">No steps yet</p>
						<button onclick={() => (showForm = true)} class="text-xs text-accent hover:underline">Add a step</button>
					</div>
				{/each}
			</div>
		</div>

		<!-- Right: Preview -->
		<div class="flex-1 flex flex-col overflow-hidden min-h-0">
			<div class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
				<span class="text-[0.65rem] text-gray-500 uppercase tracking-wider">
					Preview — {previewRows.length} command{previewRows.length !== 1 ? 's' : ''}
				</span>
				{#if previewRows.length > 0}
					<span class="text-[0.65rem] text-gray-500">
						Est. time: {totalTime.toFixed(1)}s
					</span>
				{/if}
			</div>

			{#if previewRows.length === 0}
				<div class="flex-1 flex items-center justify-center text-gray-600">
					<div class="text-center space-y-2">
						<ListOrdered size={32} class="mx-auto opacity-30" />
						<p class="text-sm">Add steps to see command preview</p>
					</div>
				</div>
			{:else}
					{#if isMobile}
						<div class="p-3 space-y-2">
							{#each previewRows as row, i}
								<div class="rounded-lg border border-border p-3 bg-bg-card">
									<div class="flex items-center justify-between">
										<div>
											<div class="text-[0.65rem] text-gray-400 font-mono">{i + 1}. {row.sat}</div>
											<div class="text-sm font-mono text-white">{row.param}</div>
											<div class="text-[0.65rem] text-accent">{row.value}{row.unit}</div>
										</div>
										<div class="text-[0.65rem] text-gray-500">#{row.stepIdx + 1}</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
					<div class="flex-1 overflow-auto">
						<table class="w-full text-xs">
						<thead class="sticky top-0 bg-bg-secondary border-b border-border">
							<tr>
								<th class="px-4 py-2 text-left text-[0.6rem] text-gray-500 uppercase font-medium w-8">#</th>
								<th class="px-4 py-2 text-left text-[0.6rem] text-gray-500 uppercase font-medium">Satellite</th>
								<th class="px-4 py-2 text-left text-[0.6rem] text-gray-500 uppercase font-medium">Parameter</th>
								<th class="px-4 py-2 text-right text-[0.6rem] text-gray-500 uppercase font-medium">Value</th>
								<th class="px-4 py-2 text-left text-[0.6rem] text-gray-500 uppercase font-medium">Unit</th>
							</tr>
						</thead>
						<tbody>
							{#each previewRows as row, i}
								<tr class="border-b border-border/40 transition-colors {
									steps[row.stepIdx] && currentStepIdx === row.stepIdx && running
										? 'bg-accent/10'
										: 'hover:bg-bg-elevated/50'
								}">
									<td class="px-4 py-1.5 font-mono text-gray-600">{i + 1}</td>
									<td class="px-4 py-1.5 font-mono text-gray-400">{row.sat}</td>
									<td class="px-4 py-1.5 font-mono text-white">{row.param}</td>
									<td class="px-4 py-1.5 font-mono text-accent text-right font-semibold">{row.value}</td>
									<td class="px-4 py-1.5 text-gray-500">{row.unit}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					</div>
				{/if}

				<!-- Footer summary -->
				<div class="px-4 py-3 border-t border-border bg-bg-secondary shrink-0">
					<div class="flex items-center gap-6 text-[0.65rem] text-gray-500">
						<span><span class="text-white font-medium">{previewRows.length}</span> total commands</span>
						<span><span class="text-white font-medium">{steps.length}</span> scan steps</span>
						<span>Est. <span class="text-white font-medium">{totalTime.toFixed(1)}s</span></span>
						<span>Protocol: <span class="text-accent font-mono">CSCP reconfigure</span></span>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
