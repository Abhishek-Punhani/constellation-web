<script lang="ts">
	import { runs, logs } from '$lib/store';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		ArrowLeft, Download, CheckCircle2, AlertTriangle, Clock, Zap, Activity,
		BarChart2, Cpu, FileText, Tag, Settings2, ChevronRight, Search,
		Calendar, Timer, Hash, Package, Shield, ExternalLink
	} from 'lucide-svelte';
	import type { RunCondition, MetricPoint } from '$lib/types';

	// ── Lookup run ──────────────────────────────────────────────────────────
	const runId = $derived($page.params.id);
	const run   = $derived($runs.find(r => r.id === runId));

	// Active tab
	let activeTab = $state<'overview' | 'satellites' | 'bor' | 'config' | 'metrics'>('overview');

	// Satellite search + expand
	let satSearch   = $state('');
	let satExpanded = $state<Set<string>>(new Set());
	function toggleSat(name: string) {
		const next = new Set(satExpanded);
		if (next.has(name)) next.delete(name); else next.add(name);
		satExpanded = next;
	}
	function expandAll()   { if (run) satExpanded = new Set(run.satellites); }
	function collapseAll() { satExpanded = new Set(); }

	// ── Helpers ─────────────────────────────────────────────────────────────
	const conditionStyle: Record<RunCondition, { text: string; bg: string; border: string; dot: string }> = {
		GOOD:       { text: 'text-green-400',  bg: 'bg-green-900/15',  border: 'border-green-800/30',  dot: 'bg-green-400'  },
		DEGRADED:   { text: 'text-amber-400',  bg: 'bg-amber-900/15',  border: 'border-amber-800/30',  dot: 'bg-amber-400'  },
		TAINTED:    { text: 'text-orange-400', bg: 'bg-orange-900/15', border: 'border-orange-800/30', dot: 'bg-orange-400' },
		INCOMPLETE: { text: 'text-red-400',    bg: 'bg-red-900/15',    border: 'border-red-800/30',    dot: 'bg-red-400'    },
	};

	function formatDuration(start: number, end: number | null) {
		if (!end) return 'Running…';
		const s = Math.floor((end - start) / 1000);
		if (s < 60) return `${s}s`;
		if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
		return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
	}
	function formatTs(ts: number) {
		return new Date(ts).toLocaleString(undefined, {
			year: 'numeric', month: 'short', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit'
		});
	}

	const SAT_COLORS = ['#7c6af7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
	function satColor(i: number) { return SAT_COLORS[i % SAT_COLORS.length]; }

	function getSatStats(satName: string) {
		if (!run) return { total: 0, fsm: 0, bor: 0, eor: 0, extrasystoles: 0, criticals: 0, warnings: 0 };
		const end = run.endTime ?? Date.now();
		const sl = $logs.filter(l => l.satellite === satName && l.time >= run!.startTime && l.time <= end);
		return {
			total:         sl.length,
			fsm:           sl.filter(l => l.topic === 'FSM').length,
			bor:           sl.filter(l => l.isBOR).length,
			eor:           sl.filter(l => l.isEOR).length,
			extrasystoles: sl.filter(l => l.isExtrasystole).length,
			criticals:     sl.filter(l => l.level === 'CRITICAL').length,
			warnings:      sl.filter(l => l.level === 'WARNING').length,
		};
	}

	const filteredSats = $derived(
		run ? run.satellites.filter(s => s.toLowerCase().includes(satSearch.toLowerCase())) : []
	);

	// ── Export CSV ───────────────────────────────────────────────────────────
	function exportCSV() {
		if (!run) return;
		const rows: string[] = [];

		// Run metadata block
		rows.push('# RUN METADATA');
		rows.push(`run_number,${run.runNumber}`);
		rows.push(`run_id,${run.id}`);
		rows.push(`label,"${run.runIdentifier?.label ?? ''}"`);
		rows.push(`sequence,${run.runIdentifier?.sequence ?? ''}`);
		rows.push(`start_time,"${formatTs(run.startTime)}"`);
		rows.push(`end_time,"${run.endTime ? formatTs(run.endTime) : 'active'}"`);
		rows.push(`duration,"${formatDuration(run.startTime, run.endTime)}"`);
		rows.push(`condition,${run.condition}`);
		rows.push(`event_count,${run.eventCount}`);
		rows.push(`satellite_count,${run.satellites.length}`);
		rows.push(`license,${run.license}`);
		rows.push('');

		// Satellites block
		rows.push('# SATELLITES');
		rows.push('satellite,total_logs,fsm_events,bor_msgs,eor_msgs,extrasystoles,criticals,warnings');
		for (const sat of run.satellites) {
			const st = getSatStats(sat);
			rows.push(`"${sat}",${st.total},${st.fsm},${st.bor},${st.eor},${st.extrasystoles},${st.criticals},${st.warnings}`);
		}
		rows.push('');

		// BOR user tags
		if (run.borUserTags) {
			rows.push('# BOR USER TAGS');
			rows.push('key,value');
			for (const [k, v] of Object.entries(run.borUserTags)) {
				rows.push(`"${k}","${v}"`);
			}
			rows.push('');
		}

		// EOR metrics
		if (run.eorMetrics) {
			rows.push('# EOR METRICS');
			rows.push('satellite,metric,min,max,last,points');
			for (const [satName, metrics] of Object.entries(run.eorMetrics)) {
				for (const [metricName, points] of Object.entries(metrics)) {
					const vals = points.map(p => p.value);
					const min = Math.min(...vals).toFixed(3);
					const max = Math.max(...vals).toFixed(3);
					const last = (vals[vals.length - 1] ?? 0).toFixed(3);
					rows.push(`"${satName}","${metricName}",${min},${max},${last},${points.length}`);
				}
			}
		}

		const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `run-${run.runNumber}-${run.id}.csv`;
		a.click();
	}

	// ── Chart action ─────────────────────────────────────────────────────────
	function metricChart(canvas: HTMLCanvasElement, params: { points: MetricPoint[]; name: string; color: string }) {
		let chartInst: any = null;
		async function build(p: typeof params) {
			const { Chart } = await import('chart.js/auto');
			chartInst?.destroy();
			chartInst = new Chart(canvas, {
				type: 'line',
				data: {
					labels: p.points.map(() => ''),
					datasets: [{ data: p.points.map(pt => pt.value), borderColor: p.color, backgroundColor: p.color + '18', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 1.5 }]
				},
				options: {
					animation: false, responsive: true, maintainAspectRatio: false,
					plugins: { legend: { display: false }, tooltip: { enabled: true } },
					scales: { x: { display: false }, y: { display: true, ticks: { color: '#4b5563', font: { size: 8 }, maxTicksLimit: 3 }, grid: { color: '#1a1a2e' } } }
				}
			});
		}
		build(params);
		return { update(p: typeof params) { build(p); }, destroy() { chartInst?.destroy(); } };
	}

	const TABS = [
		{ id: 'overview',   label: 'Overview',   icon: Activity  },
		{ id: 'satellites', label: 'Satellites',  icon: Cpu       },
		{ id: 'bor',        label: 'BOR Tags',    icon: Tag       },
		{ id: 'config',     label: 'Config',      icon: Settings2 },
		{ id: 'metrics',    label: 'EOR Metrics', icon: BarChart2 },
	] as const;
</script>

<!-- Not found guard -->
{#if !run}
	<div class="flex flex-col items-center justify-center h-full text-gray-500">
		<AlertTriangle size={32} class="mb-3 text-gray-600" />
		<p class="text-sm">Run not found.</p>
		<button class="mt-4 btn-ghost text-xs flex items-center gap-1.5" onclick={() => goto('/runs')}>
			<ArrowLeft size={12} /> Back to Run History
		</button>
	</div>
{:else}

{@const cs = conditionStyle[run.condition]}
{@const CIcon = run.condition === 'GOOD' ? CheckCircle2 : AlertTriangle}

<div class="flex flex-col h-full">

	<!-- ══ Page header ══════════════════════════════════════════════════════ -->
	<div class="border-b border-border shrink-0">
		<div class="flex items-center justify-between px-6 py-4">
			<!-- Left: back + title -->
			<div class="flex items-center gap-4 min-w-0">
				<button
					onclick={() => goto('/runs')}
					class="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-border-bright text-gray-500 hover:text-white transition-all shrink-0"
				>
					<ArrowLeft size={14} />
				</button>
				<div class="min-w-0">
					<div class="flex items-center gap-2.5 flex-wrap">
						<h1 class="text-xl font-bold text-white font-mono">Run #{run.runNumber}</h1>
						{#if !run.endTime}
							<span class="text-[0.65rem] font-medium text-green-400 border border-green-800/40 bg-green-900/10 px-2 py-0.5 rounded-full animate-pulse">● LIVE</span>
						{/if}
						<span class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border {cs.bg} {cs.border} {cs.text}">
							<CIcon size={11} /> {run.condition}
						</span>
					</div>
					{#if run.runIdentifier?.label}
						<p class="text-xs text-gray-500 mt-0.5 truncate">{run.runIdentifier.label}</p>
					{/if}
				</div>
			</div>

			<!-- Right: export + quick stats -->
			<div class="flex items-center gap-3 shrink-0">
				<!-- Mini stat pills -->
				<div class="hidden md:flex items-center gap-2 text-xs">
					<div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border">
						<Timer size={11} class="text-gray-500" />
						<span class="font-mono text-gray-300">{formatDuration(run.startTime, run.endTime)}</span>
					</div>
					<div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border">
						<Activity size={11} class="text-accent" />
						<span class="font-mono text-accent">{run.eventCount.toLocaleString()}</span>
						<span class="text-gray-500">events</span>
					</div>
					<div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border">
						<Cpu size={11} class="text-gray-500" />
						<span class="font-mono text-gray-300">{run.satellites.length}</span>
						<span class="text-gray-500">satellites</span>
					</div>
				</div>
				<button
					onclick={exportCSV}
					class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent/15 border border-accent/30 hover:bg-accent/25 text-accent text-xs font-medium transition-all"
				>
					<Download size={13} /> Export CSV
				</button>
				<NotificationCenter />
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex items-center gap-1 px-6">
			{#each TABS as tab}
				{@const Icon = tab.icon}
				<button
					onclick={() => activeTab = tab.id}
					class="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all
						{activeTab === tab.id
							? 'border-accent text-accent'
							: 'border-transparent text-gray-500 hover:text-gray-300 hover:border-border'}"
				>
					<Icon size={12} /> {tab.label}
					{#if tab.id === 'satellites'}
						<span class="ml-0.5 text-[0.6rem] font-mono px-1 rounded {activeTab === 'satellites' ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-gray-600'}">{run.satellites.length}</span>
					{/if}
					{#if tab.id === 'metrics' && run.eorMetrics}
						<span class="ml-0.5 text-[0.6rem] font-mono px-1 rounded {activeTab === 'metrics' ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-gray-600'}">{Object.keys(run.eorMetrics).length}</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- ══ Tab content ═══════════════════════════════════════════════════════ -->
	<div class="flex-1 overflow-y-auto px-6 py-5">

		<!-- ── Overview ── -->
		{#if activeTab === 'overview'}
			<div class="space-y-5">

				<!-- Key facts grid -->
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
					{#each [
						{ icon: Hash,     label: 'Run Number',  value: `#${run.runNumber}`,                     mono: true  },
						{ icon: Calendar, label: 'Started',     value: formatTs(run.startTime),                  mono: true  },
						{ icon: Calendar, label: 'Ended',       value: run.endTime ? formatTs(run.endTime) : '— active', mono: true },
						{ icon: Timer,    label: 'Duration',    value: formatDuration(run.startTime, run.endTime), mono: true },
						{ icon: Activity, label: 'Total Events',value: run.eventCount.toLocaleString(),          mono: true  },
						{ icon: Cpu,      label: 'Satellites',  value: String(run.satellites.length),            mono: false },
						{ icon: Shield,   label: 'License',     value: run.license,                              mono: true  },
						{ icon: Package,  label: 'Sequence',    value: String(run.runIdentifier?.sequence ?? '—'), mono: true },
					] as kf}
						{@const KIcon = kf.icon}
						<div class="card-elevated px-4 py-3 flex items-center gap-3">
							<div class="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
								<KIcon size={13} class="text-accent" />
							</div>
							<div class="min-w-0">
								<div class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-0.5">{kf.label}</div>
								<div class="text-xs {kf.mono ? 'font-mono' : ''} text-gray-200 truncate">{kf.value}</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Run label if present -->
				{#if run.runIdentifier?.label}
					<div class="card-elevated px-4 py-3 flex items-center gap-3">
						<Tag size={13} class="text-accent shrink-0" />
						<div>
							<div class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-0.5">Run Label</div>
							<div class="text-sm text-gray-200">{run.runIdentifier.label}</div>
						</div>
					</div>
				{/if}

				<!-- Condition + satellites summary -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

					<!-- Condition card -->
					<div class="card-elevated p-4">
						<div class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
							<Shield size={10} /> Run Condition
						</div>
						<div class="flex items-center gap-3">
							<div class="w-12 h-12 rounded-xl {cs.bg} border {cs.border} flex items-center justify-center">
								<CIcon size={22} class={cs.text} />
							</div>
							<div>
								<div class="text-lg font-bold {cs.text}">{run.condition}</div>
								<div class="text-xs text-gray-500 mt-0.5">
									{#if run.condition === 'GOOD'}All data collected without issues.
									{:else if run.condition === 'DEGRADED'}Some non-critical issues during data collection.
									{:else if run.condition === 'TAINTED'}Critical errors were recorded during the run.
									{:else}Run ended without a clean EOR bookend.
									{/if}
								</div>
							</div>
						</div>
					</div>

					<!-- Satellite health summary -->
					<div class="card-elevated p-4">
						<div class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
							<Cpu size={10} /> Satellite Health Summary
						</div>
						<div class="space-y-1.5">
							{#each run.satellites.slice(0, 5) as satName, idx}
								{@const st = getSatStats(satName)}
								<div class="flex items-center gap-2 text-xs">
									<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {satColor(idx)}"></span>
									<span class="font-mono text-gray-300 flex-1 min-w-0 truncate">{satName}</span>
									<span class="font-mono text-gray-500">{st.total} logs</span>
									{#if st.criticals > 0}
										<span class="text-red-400 text-[0.6rem]">⚠ {st.criticals}</span>
									{/if}
								</div>
							{/each}
							{#if run.satellites.length > 5}
								<button onclick={() => activeTab = 'satellites'} class="text-[0.65rem] text-accent hover:text-accent/80 flex items-center gap-1 mt-1">
									+{run.satellites.length - 5} more <ChevronRight size={10} />
								</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- EOR status -->
				<div class="card-elevated p-4">
					<div class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<FileText size={10} /> EOR Status
					</div>
					{#if run.eorMeta}
						<div class="flex items-center gap-2 mb-3">
							<span class="w-2 h-2 rounded-full bg-green-400"></span>
							<span class="text-xs text-green-400 font-medium">EOR received — run closed cleanly</span>
						</div>
						<pre class="text-xs font-mono text-gray-300 bg-bg-primary rounded p-3 overflow-auto max-h-36 border border-border">{JSON.stringify(run.eorMeta, null, 2)}</pre>
					{:else}
						<div class="flex items-center gap-2 text-xs text-amber-400">
							<Clock size={13} />
							{run.endTime ? 'Run ended — EOR metadata not available.' : 'Run still active — awaiting EOR bookend.'}
						</div>
					{/if}
				</div>

			</div>

		<!-- ── Satellites ── -->
		{:else if activeTab === 'satellites'}
			<div class="space-y-3">
				<!-- Toolbar -->
				<div class="flex items-center gap-3">
					<div class="relative flex-1 max-w-xs">
						<Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
						<input
							type="text"
							placeholder="Filter satellites…"
							bind:value={satSearch}
							class="w-full bg-bg-elevated border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent transition-colors"
						/>
					</div>
					<button onclick={expandAll}   class="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1">Expand all</button>
					<button onclick={collapseAll} class="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1">Collapse all</button>
					<span class="ml-auto text-xs text-gray-600 font-mono">{filteredSats.length} / {run.satellites.length}</span>
				</div>

				<!-- Satellite list -->
				{#each filteredSats as satName}
					{@const idx = run.satellites.indexOf(satName)}
					{@const color = satColor(idx)}
					{@const st = getSatStats(satName)}
					{@const open = satExpanded.has(satName)}

					<div class="card-elevated overflow-hidden">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-elevated/60 transition-colors select-none"
							onclick={() => toggleSat(satName)}
						>
							<span class="text-gray-600 transition-transform {open ? 'rotate-90' : ''} shrink-0">
								<ChevronRight size={13} />
							</span>
							<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: {color}"></span>
							<span class="text-sm font-mono font-medium flex-1 min-w-0 truncate" style="color: {color}">{satName}</span>

							<!-- Inline pills -->
							<div class="flex items-center gap-2 shrink-0">
								{#if st.criticals > 0}
									<span class="inline-flex items-center gap-1 text-[0.6rem] text-red-400 bg-red-900/15 border border-red-800/25 px-1.5 py-0.5 rounded">
										<AlertTriangle size={9} /> {st.criticals} critical
									</span>
								{/if}
								{#if st.extrasystoles > 0}
									<span class="inline-flex items-center gap-1 text-[0.6rem] text-amber-400 bg-amber-900/15 border border-amber-800/25 px-1.5 py-0.5 rounded">
										<Zap size={9} /> {st.extrasystoles} extra
									</span>
								{/if}
								<span class="text-xs font-mono text-gray-500">{st.total} logs</span>
								<span class="text-xs font-mono text-gray-600">{st.bor}B · {st.eor}E</span>
							</div>

							<button
								class="btn-ghost text-[0.65rem] py-1 px-2 flex items-center gap-1 shrink-0"
								onclick={(e) => { e.stopPropagation(); goto(`/logs?satellite=${encodeURIComponent(satName)}`); }}
							>
								<ExternalLink size={10} /> Logs
							</button>
						</div>

						{#if open}
							<div class="border-t border-border px-4 py-4 bg-bg-primary/40">
								<div class="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
									{#each [
										{ label: 'Total Logs',    value: st.total,           col: '#9ca3af' },
										{ label: 'FSM Events',    value: st.fsm,             col: '#7c6af7' },
										{ label: 'BOR msgs',      value: st.bor,             col: '#3b82f6' },
										{ label: 'EOR msgs',      value: st.eor,             col: '#10b981' },
										{ label: 'Extrasystoles', value: st.extrasystoles,   col: st.extrasystoles > 0 ? '#f59e0b' : '#6b7280' },
										{ label: 'Critical',      value: st.criticals,       col: st.criticals > 0 ? '#ef4444' : '#6b7280' },
									] as m}
										<div class="bg-bg-elevated rounded border border-border px-3 py-2 text-center">
											<div class="text-base font-bold font-mono" style="color: {m.col}">{m.value}</div>
											<div class="text-[0.58rem] text-gray-600 mt-0.5 leading-tight">{m.label}</div>
										</div>
									{/each}
								</div>
								{#if st.criticals > 0 || st.extrasystoles > 0}
									<div class="flex items-center gap-4 text-[0.65rem]">
										{#if st.criticals > 0}
											<span class="text-red-400 flex items-center gap-1">
												<AlertTriangle size={10} /> {st.criticals} critical log{st.criticals !== 1 ? 's' : ''} during this run
											</span>
										{/if}
										{#if st.extrasystoles > 0}
											<span class="text-amber-400 flex items-center gap-1">
												<Zap size={10} /> {st.extrasystoles} out-of-order heartbeat{st.extrasystoles !== 1 ? 's' : ''}
											</span>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<div class="card-elevated py-8 text-center text-xs text-gray-600 italic">
						No satellites match "{satSearch}"
					</div>
				{/each}
			</div>

		<!-- ── BOR Tags ── -->
		{:else if activeTab === 'bor'}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

				<!-- User Tags -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 mb-1">
						<span class="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
						<h3 class="text-xs font-semibold text-white uppercase tracking-wider">BOR — User Tags</h3>
					</div>
					{#if run.borUserTags && Object.keys(run.borUserTags).length > 0}
						<div class="card-elevated divide-y divide-border">
							{#each Object.entries(run.borUserTags) as [key, val]}
								<div class="flex items-baseline justify-between px-4 py-3 gap-4">
									<span class="text-xs font-mono text-gray-500 shrink-0">{key}</span>
									<span class="text-xs text-violet-300 text-right truncate">{String(val)}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="card-elevated px-4 py-6 text-center text-xs text-gray-600 italic">No user tags recorded in BOR.</div>
					{/if}
				</div>

				<!-- eDAQ Tags -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 mb-1">
						<span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
						<h3 class="text-xs font-semibold text-white uppercase tracking-wider">BOR — eDAQ Tags</h3>
					</div>
					{#if run.borEdaqTags && Object.keys(run.borEdaqTags).length > 0}
						<div class="card-elevated divide-y divide-border">
							{#each Object.entries(run.borEdaqTags) as [key, val]}
								<div class="flex items-baseline justify-between px-4 py-3 gap-4">
									<span class="text-xs font-mono text-gray-500 shrink-0">{key}</span>
									<span class="text-xs text-cyan-300 text-right truncate">{String(val)}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="card-elevated px-4 py-6 text-center text-xs text-gray-600 italic">No eDAQ tags recorded in BOR.</div>
					{/if}
				</div>
			</div>

		<!-- ── Config Snapshot ── -->
		{:else if activeTab === 'config'}
			<div class="space-y-4">
				<p class="text-xs text-gray-500">Configuration snapshot injected into the BOR at run start.</p>
				{#if run.borConfig && Object.keys(run.borConfig).length > 0}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
						{#each Object.entries(run.borConfig) as [satName, satCfg], idx}
							<div class="card-elevated overflow-hidden">
								<div class="flex items-center gap-2.5 px-4 py-2.5 border-b border-border">
									<span class="w-2 h-2 rounded-full" style="background: {satColor(idx)}"></span>
									<span class="text-xs font-mono font-medium" style="color: {satColor(idx)}">{satName}</span>
								</div>
								<pre class="text-xs font-mono text-gray-300 bg-bg-primary p-3 overflow-auto max-h-56 leading-relaxed">{JSON.stringify(satCfg, null, 2)}</pre>
							</div>
						{/each}
					</div>
				{:else}
					<div class="card-elevated px-4 py-8 text-center text-xs text-gray-600 italic">No config snapshot available.</div>
				{/if}
			</div>

		<!-- ── EOR Metrics ── -->
		{:else if activeTab === 'metrics'}
			<div class="space-y-5">
				{#if run.eorMetrics && Object.keys(run.eorMetrics).length > 0}
					{#each Object.entries(run.eorMetrics) as [satName, metrics], satIdx}
						<div>
							<div class="flex items-center gap-2 mb-3">
								<span class="w-2 h-2 rounded-full" style="background: {satColor(satIdx)}"></span>
								<span class="text-sm font-mono font-medium" style="color: {satColor(satIdx)}">{satName}</span>
								<span class="text-[0.6rem] text-gray-600 font-mono">{Object.keys(metrics).length} metrics</span>
							</div>
							<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
								{#each Object.entries(metrics) as [metricName, points]}
									{@const vals = points.map(p => p.value)}
									{@const last = vals[vals.length - 1] ?? 0}
									{@const minVal = Math.min(...vals)}
									{@const maxVal = Math.max(...vals)}
									<div class="card-elevated p-3">
										<div class="flex justify-between items-baseline mb-2">
											<span class="text-[0.65rem] font-mono text-gray-400 truncate pr-2">{metricName}</span>
											<span class="text-sm font-bold font-mono text-white shrink-0">{last.toFixed(2)}</span>
										</div>
										<div style="height:56px; position:relative;">
											<canvas use:metricChart={{ points, name: metricName, color: satColor(satIdx) }} style="height:100%;width:100%;"></canvas>
										</div>
										<div class="flex justify-between mt-2 text-[0.58rem] font-mono text-gray-600">
											<span>↓ {minVal.toFixed(2)}</span>
											<span class="text-gray-500">{points.length} pts</span>
											<span>↑ {maxVal.toFixed(2)}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				{:else}
					<div class="card-elevated px-4 py-10 text-center">
						<BarChart2 size={28} class="text-gray-700 mx-auto mb-3" />
						<p class="text-sm text-gray-600">No EOR metrics available.</p>
						<p class="text-xs text-gray-700 mt-1">{run.endTime ? 'Metrics were not included in the EOR payload.' : 'Run is still active — metrics will appear after EOR.'}</p>
					</div>
				{/if}
			</div>
		{/if}

	</div>
</div>
{/if}
