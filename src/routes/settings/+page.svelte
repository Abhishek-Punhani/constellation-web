<script lang="ts">
	import { uiSettings, ACCENT_COLORS, applyAccent, type AccentPreset } from '$lib/settings';
	import { constellation } from '$lib/store';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		Settings2, Bell, Zap, Database, Wifi, RotateCcw,
		Check, Palette, Info
	} from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';

	const STORAGE_KEY = 'constellation-ui-settings';

	let saved = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function patch(partial: Partial<typeof $uiSettings>) {
		uiSettings.patch(partial);
		if (saveTimer) clearTimeout(saveTimer);
		saved = true;
		saveTimer = setTimeout(() => (saved = false), 1800);
	}

	function reset() {
		uiSettings.reset();
		saved = true;
		saveTimer = setTimeout(() => (saved = false), 1800);
	}

	// Apply accent on mount and when changed
	onMount(() => applyAccent($uiSettings.accentPreset));

	const SPEED_STEPS = [0.25, 0.5, 1, 2, 4];
	const SPEED_LABELS: Record<number, string> = {
		0.25: '¼×  Slow',
		0.5:  '½×  Relaxed',
		1:    '1×  Normal',
		2:    '2×  Fast',
		4:    '4×  Turbo',
	};

	const ACCENT_LIST: { id: AccentPreset; label: string }[] = [
		{ id: 'violet',  label: 'Violet'  },
		{ id: 'cyan',    label: 'Cyan'    },
		{ id: 'emerald', label: 'Emerald' },
		{ id: 'rose',    label: 'Rose'    },
		{ id: 'amber',   label: 'Amber'   },
	];

	// Slider index helpers
	function speedIndex(v: number) { return SPEED_STEPS.indexOf(v); }
	function speedFromIndex(i: number) { return SPEED_STEPS[i] ?? 1; }
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
		<div class="flex items-center gap-3">
			<div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
				<Settings2 size={16} class="text-accent" />
			</div>
			<div>
				<h1 class="text-lg font-bold text-white">Settings</h1>
				<p class="text-xs text-gray-500">Preferences are persisted in your browser</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if saved}
				<div class="flex items-center gap-1.5 text-emerald-400 text-xs" transition:fly={{ y: -4, duration: 200 }}>
					<Check size={13} /> Saved
				</div>
			{/if}
			<NotificationCenter />
		</div>
	</div>

	<div class="flex-1 overflow-y-auto px-6 py-5">

		<!-- Reset button row — top-right of content -->
		<div class="flex justify-end mb-5">
			<button
				onclick={reset}
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border hover:border-border-bright text-gray-400 hover:text-white text-xs transition-all"
			>
				<RotateCcw size={12} /> Reset to defaults
			</button>
		</div>

		<!-- Two-column grid layout -->
		<div class="grid grid-cols-2 gap-6 pb-8">

			<!-- ════ LEFT COLUMN ════ -->
			<div class="space-y-6">

				<!-- ── Notifications ── -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<Bell size={13} class="text-accent" />
						<h2 class="text-xs font-semibold text-white uppercase tracking-widest">Notifications</h2>
					</div>
					<div class="card-elevated divide-y divide-border">

						<!-- Show toasts -->
						<div class="flex items-center justify-between px-4 py-3.5">
							<div>
								<p class="text-sm text-gray-200">Show toast notifications</p>
								<p class="text-xs text-gray-500 mt-0.5">Brief pop-up after each command response</p>
							</div>
							<button
								role="switch"
								aria-checked={$uiSettings.showToasts}							aria-label="Toggle toast notifications"								onclick={() => patch({ showToasts: !$uiSettings.showToasts })}
								class={`relative w-10 h-5 rounded-full transition-all shrink-0 ${$uiSettings.showToasts ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}
							>
								<span class={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${$uiSettings.showToasts ? 'left-5.5' : 'left-0.5'}`}></span>
							</button>
						</div>

						<!-- Toast duration -->
						<div class="px-4 py-3.5 {!$uiSettings.showToasts ? 'opacity-40 pointer-events-none' : ''}">
							<div class="flex items-center justify-between mb-2.5">
								<p class="text-sm text-gray-200">Toast duration</p>
								<span class="text-xs font-mono text-accent">{($uiSettings.toastDuration / 1000).toFixed(1)}s</span>
							</div>
							<input
								type="range" min="1000" max="10000" step="500"
								value={$uiSettings.toastDuration}
								oninput={(e) => patch({ toastDuration: Number((e.target as HTMLInputElement).value) })}
								class="w-full h-1.5 rounded bg-border accent-accent cursor-pointer"
							/>
							<div class="flex justify-between mt-1.5">
								<span class="text-[0.6rem] text-gray-600">1s</span>
								<span class="text-[0.6rem] text-gray-600">10s</span>
							</div>
						</div>

						<!-- Success / Failure toggles -->
						<div class="grid grid-cols-2 divide-x divide-border {!$uiSettings.showToasts ? 'opacity-40 pointer-events-none' : ''}">
							{#each [
								{ key: 'toastOnSuccess' as const, label: 'Success', dot: 'bg-emerald-400' },
								{ key: 'toastOnFailure' as const, label: 'Failure',  dot: 'bg-red-400'     }
							] as opt}
								<div class="flex items-center justify-between px-4 py-3">
									<div class="flex items-center gap-2">
										<span class="w-1.5 h-1.5 rounded-full {opt.dot}"></span>
										<span class="text-sm text-gray-300">{opt.label}</span>
									</div>
									<button
										role="switch" aria-checked={$uiSettings[opt.key]}
										aria-label={`Toggle ${opt.label} notifications`}
										onclick={() => patch({ [opt.key]: !$uiSettings[opt.key] })}
										class={`relative w-8 h-4 rounded-full transition-all shrink-0 ${$uiSettings[opt.key] ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}
									>
										<span class={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${$uiSettings[opt.key] ? 'left-4.5' : 'left-0.5'}`}></span>
									</button>
								</div>
							{/each}
						</div>
					</div>
				</section>

				<!-- ── Demo Simulation ── -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<Zap size={13} class="text-accent" />
						<h2 class="text-xs font-semibold text-white uppercase tracking-widest">Demo Simulation</h2>
					</div>
					<div class="card-elevated px-4 py-4 space-y-4">
						<div>
							<div class="flex items-center justify-between mb-3">
								<div>
									<p class="text-sm text-gray-200">Simulation speed</p>
									<p class="text-xs text-gray-500 mt-0.5">Heartbeat &amp; log event generation rate</p>
								</div>
								<span class="text-xs font-semibold text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
									{SPEED_LABELS[$uiSettings.simSpeedMultiplier] ?? `${$uiSettings.simSpeedMultiplier}×`}
								</span>
							</div>
							<input
								type="range" min="0" max={SPEED_STEPS.length - 1} step="1"
								value={speedIndex($uiSettings.simSpeedMultiplier)}
								oninput={(e) => patch({ simSpeedMultiplier: speedFromIndex(Number((e.target as HTMLInputElement).value)) })}
								class="w-full h-1.5 rounded bg-border accent-accent cursor-pointer"
							/>
							<div class="flex justify-between mt-1.5">
								{#each SPEED_STEPS as s}
									<span class="text-[0.6rem] font-mono {$uiSettings.simSpeedMultiplier === s ? 'text-accent' : 'text-gray-600'}">{s}×</span>
								{/each}
							</div>
						</div>
						<div class="flex items-start gap-2 p-3 rounded-lg bg-amber-900/10 border border-amber-800/20">
							<Info size={12} class="text-amber-500 mt-0.5 shrink-0" />
							<p class="text-[0.68rem] text-amber-400/80 leading-snug">Speed changes take effect immediately. Turbo mode (4×) generates high log volume.</p>
						</div>
					</div>
				</section>

				<!-- ── Connection ── -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<Wifi size={13} class="text-accent" />
						<h2 class="text-xs font-semibold text-white uppercase tracking-widest">Connection</h2>
					</div>
					<div class="card-elevated divide-y divide-border">
						<div class="px-4 py-3.5">
							<div class="flex items-center justify-between mb-2">
								<p class="text-sm text-gray-200">WebSocket server URL</p>
								<span class="text-[0.65rem] text-gray-500">Live mode only</span>
							</div>
							<input
								type="text"
								value={$uiSettings.wsUrl}
								oninput={(e) => patch({ wsUrl: (e.target as HTMLInputElement).value })}
								placeholder="ws://localhost:8080"
								class="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-gray-300 focus:outline-none focus:border-accent transition-colors"
							/>
						</div>
						<div class="flex items-center justify-between px-4 py-3.5">
							<div>
								<p class="text-sm text-gray-200">Connection mode</p>
								<p class="text-xs text-gray-500 mt-0.5">Session is running on demo data</p>
							</div>
							<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/20 border border-emerald-800/25">
								<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
								<span class="text-xs font-medium text-emerald-400">Demo · Live</span>
							</div>
						</div>
					</div>
				</section>

			</div><!-- end LEFT -->

			<!-- ════ RIGHT COLUMN ════ -->
			<div class="space-y-6">

				<!-- ── Appearance ── -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<Palette size={13} class="text-accent" />
						<h2 class="text-xs font-semibold text-white uppercase tracking-widest">Appearance</h2>
					</div>
					<div class="card-elevated divide-y divide-border">

						<!-- Accent color swatches -->
						<div class="px-4 py-4">
							<p class="text-sm text-gray-200 mb-3">Accent color</p>
							<div class="grid grid-cols-5 gap-2">
								{#each ACCENT_LIST as opt}
									{@const c = ACCENT_COLORS[opt.id]}
									<button
										onclick={() => { patch({ accentPreset: opt.id }); applyAccent(opt.id); }}
										title={opt.label}
										class="flex flex-col items-center gap-1.5 group p-2 rounded-lg border transition-all
											{$uiSettings.accentPreset === opt.id
												? 'border-white/20 bg-bg-elevated'
												: 'border-transparent hover:border-border hover:bg-bg-elevated/50'}"
									>
										<span
											class="w-6 h-6 rounded-full border-2 transition-all {$uiSettings.accentPreset === opt.id ? 'border-white/50 scale-110' : 'border-transparent'}"
											style="background: {c.color}"
										></span>
										<span class="text-[0.6rem] {$uiSettings.accentPreset === opt.id ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'} transition-colors">{opt.label}</span>
									</button>
								{/each}
							</div>
						</div>

						<!-- Log max entries -->
						<div class="px-4 py-3.5">
							<div class="flex items-center justify-between mb-2.5">
								<div>
									<p class="text-sm text-gray-200">Max log entries in memory</p>
									<p class="text-xs text-gray-500 mt-0.5">Older entries are pruned automatically</p>
								</div>
								<span class="text-xs font-mono text-accent">{$uiSettings.logMaxEntries.toLocaleString()}</span>
							</div>
							<input
								type="range" min="100" max="5000" step="100"
								value={$uiSettings.logMaxEntries}
								oninput={(e) => patch({ logMaxEntries: Number((e.target as HTMLInputElement).value) })}
								class="w-full h-1.5 rounded bg-border accent-accent cursor-pointer"
							/>
							<div class="flex justify-between mt-1.5">
								<span class="text-[0.6rem] text-gray-600">100</span>
								<span class="text-[0.6rem] text-gray-600">5,000</span>
							</div>
						</div>
					</div>
				</section>

				<!-- ── Data Management ── -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<Database size={13} class="text-accent" />
						<h2 class="text-xs font-semibold text-white uppercase tracking-widest">Data Management</h2>
					</div>
					<div class="card-elevated divide-y divide-border">
						<div class="flex items-center justify-between px-4 py-3.5">
							<div>
								<p class="text-sm text-gray-200">Command response history</p>
								<p class="text-xs text-gray-500 mt-0.5">Clears the notification center log</p>
							</div>
							<button
								onclick={() => (constellation as any).clearCommandHistory?.()}
								class="px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-800/30 text-red-400 hover:bg-red-900/30 text-xs transition-all shrink-0"
							>Clear history</button>
						</div>
						<div class="flex items-center justify-between px-4 py-3.5">
							<div>
								<p class="text-sm text-gray-200">Settings storage key</p>
								<p class="text-xs text-gray-500 mt-0.5">Stored in browser localStorage</p>
							</div>
							<span class="text-[0.65rem] font-mono text-gray-500 bg-bg-primary px-2 py-1 rounded">{STORAGE_KEY}</span>
						</div>
					</div>
				</section>

				<!-- ── About ── -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<Info size={13} class="text-accent" />
						<h2 class="text-xs font-semibold text-white uppercase tracking-widest">About</h2>
					</div>
					<div class="card-elevated divide-y divide-border">
						{#each [
							{ label: 'Interface', value: 'Constellation UI' },
							{ label: 'Version',   value: '0.1.0-demo' },
							{ label: 'Framework', value: 'SvelteKit + Tailwind CSS 4' },
							{ label: 'Protocol',  value: 'CSCP / CMDP / CHIRP' },
						] as row}
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-sm text-gray-400">{row.label}</span>
								<span class="text-xs font-mono text-gray-300">{row.value}</span>
							</div>
						{/each}
					</div>
				</section>

			</div><!-- end RIGHT -->

		</div><!-- end grid -->
	</div>
</div>
