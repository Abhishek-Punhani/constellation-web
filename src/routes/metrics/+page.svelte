<script lang="ts">
	import { satellites, constellation, METRIC_INTERVAL_MS } from '$lib/store';
	import { onMount, onDestroy } from 'svelte';
	import { Download } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import StateBadge from '$lib/components/StateBadge.svelte';

	let selectedMetric = $state('CPU_LOAD');
	let timeRange = $state(300);
	let selectedHosts = $state<Set<string>>(new Set()); // empty = all hosts

	const COLORS = ['#7c6af7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

	const UNITS: Record<string, string> = {
		CPU_LOAD: '%', MEM_USED: 'MB', RX_BYTES: 'kB/s', TX_BYTES: 'kB/s',
		TEMPERATURE: '°C', HUMIDITY: '%'
	};
	const LABELS: Record<string, string> = {
		CPU_LOAD: 'CPU Load', MEM_USED: 'Memory Used',
		RX_BYTES: 'Network RX', TX_BYTES: 'Network TX',
		TEMPERATURE: 'Temperature', HUMIDITY: 'Humidity'
	};
	const SPARK_COLORS: Record<string, string> = {
		CPU_LOAD: '#7c6af7', MEM_USED: '#06b6d4',
		RX_BYTES: '#10b981', TX_BYTES: '#f59e0b',
		TEMPERATURE: '#ef4444', HUMIDITY: '#8b5cf6'
	};

	// Derived: all unique hosts from satellites
	const allHosts = $derived([...new Set($satellites.map(s => s.host))].sort());
	// All unique metric names across all satellites (dynamic)
	const allMetricNames = $derived(
		[...new Set($satellites.flatMap(s => s.metrics.map(m => m.name)))].sort()
	);

	// Satellites visible after host filter (empty set = all)
	const visibleSats = $derived(
		selectedHosts.size === 0 ? $satellites : $satellites.filter(s => selectedHosts.has(s.host))
	);

	const ptCount = $derived(Math.ceil((timeRange * 1000) / METRIC_INTERVAL_MS));

	// Stable color map keyed by satellite id (uses index in the FULL satellites list, never shifts)
	const satColorMap = $derived(
		new Map($satellites.map((s, i) => [s.id, COLORS[i % COLORS.length]]))
	);

	// Chart series for the selected metric
	const chartSeries = $derived(
		visibleSats
			.map(s => ({
				id: s.id,
				name: s.name,
				host: s.host,
				points: (s.metrics.find(m => m.name === selectedMetric)?.points ?? []).slice(-ptCount)
			}))
			.filter(d => d.points.length > 0)
	);

	// Chart.js instance
	let mainCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInst: any = null;

	function buildDatasets() {
		return chartSeries.map(d => {
			const col = satColorMap.get(d.id) ?? COLORS[0];
			return {
				label: d.name,
				data: d.points.map(p => ({
					x: p.time,
					y: selectedMetric.includes('BYTES') ? +(p.value / 1000).toFixed(2) : +p.value.toFixed(2)
				})),
				borderColor: col,
				backgroundColor: col + '14',
				borderWidth: 1.5,
				pointRadius: 0,
				pointHoverRadius: 4,
				tension: 0.3,
				fill: false
			};
		});
	}

	// Update chart whenever reactive deps change
	$effect(() => {
		const _s = chartSeries;
		const _m = selectedMetric;
		if (!chartInst) return;
		chartInst.data.datasets = buildDatasets();
		chartInst.options.scales.y.title.text = UNITS[selectedMetric] ?? '';
		// Clamp x-axis to actual data range so there's no empty padding on either side
		const allTimes = chartSeries.flatMap(d => d.points.map(p => p.time));
		if (allTimes.length > 0) {
			chartInst.options.scales.x.min = Math.min(...allTimes);
			chartInst.options.scales.x.max = Math.max(...allTimes);
		}
		chartInst.update('none');
	});

	onMount(async () => {
		if (!mainCanvas) return;
		const { default: Chart } = await import('chart.js/auto');
		chartInst = new Chart(mainCanvas, {
			type: 'line',
			data: { datasets: buildDatasets() },
			options: {
				animation: { duration: 0 },
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false, axis: 'x' },
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: '#9ca3af', boxWidth: 20, boxHeight: 2, padding: 16,
							font: { size: 11, family: "'JetBrains Mono', monospace" }
						}
					},
					tooltip: {
						backgroundColor: '#13131f',
						borderColor: '#2d2d4a',
						borderWidth: 1,
						titleColor: '#d1d5db',
						bodyColor: '#9ca3af',
						titleFont: { size: 11 },
						bodyFont: { size: 11, family: "'JetBrains Mono', monospace" },
						padding: 10,
						callbacks: {
							title: (items: any[]) => items[0] ? new Date(items[0].parsed.x).toLocaleTimeString() : '',
							label: (item: any) => ` ${item.dataset.label}: ${item.parsed.y} ${UNITS[selectedMetric] ?? ''}`
						}
					}
				},
				scales: {
					x: {
						type: 'linear',
						grid: { color: '#1a1a2e' },
						border: { color: '#2d2d4a' },
						ticks: {
							color: '#6b7280', maxTicksLimit: 7, font: { size: 10 },
							callback: (val: any) => new Date(val as number).toLocaleTimeString()
						}
					},
					y: {
						grid: { color: '#1a1a2e' },
						border: { color: '#2d2d4a' },
						ticks: { color: '#6b7280', font: { size: 10 } },
						title: {
							display: true, text: UNITS[selectedMetric] ?? '',
							color: '#6b7280', font: { size: 10 }
						}
					}
				}
			}
		});
	});

	onDestroy(() => { chartInst?.destroy(); chartInst = null; });

	// Fixed sparkline — no division-by-zero
	function spark(pts: { time: number; value: number }[], w = 100, h = 28): string {
		if (pts.length < 2) return `M0,${h / 2} L${w},${h / 2}`;
		const vals = pts.map(p => p.value);
		const min = Math.min(...vals), max = Math.max(...vals);
		const range = max - min;
		if (range < 1e-9) return `M0,${h / 2} L${w},${h / 2}`;
		return pts.map((p, i) => {
			const x = (i / (pts.length - 1)) * w;
			const y = h - ((p.value - min) / range) * (h - 4) - 2;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	function fmtVal(val: number | null, name: string): string {
		if (val === null) return '—';
		if (name === 'CPU_LOAD') return `${val.toFixed(1)}%`;
		if (name === 'MEM_USED') return `${val.toFixed(0)} MB`;
		if (name === 'RX_BYTES' || name === 'TX_BYTES') return `${(val / 1000).toFixed(1)} kB/s`;
		if (name === 'TEMPERATURE') return `${val.toFixed(1)}°C`;
		if (name === 'HUMIDITY') return `${val.toFixed(0)}%`;
		return `${val.toFixed(2)} ${UNITS[name] ?? ''}`;
	}

	// Per-satellite mini cards
	const satCards = $derived(
		visibleSats.map(s => {
			const STANDARD = ['CPU_LOAD', 'MEM_USED', 'RX_BYTES', 'TX_BYTES'];
			const ENV = ['TEMPERATURE', 'HUMIDITY'];
			const hasStandard = s.metrics.some(m => STANDARD.includes(m.name));
			return {
				sat: s,
				panels: (hasStandard ? STANDARD : ENV).map(name => ({
					name, label: LABELS[name] ?? name,
					color: SPARK_COLORS[name] ?? '#7c6af7',
					unit: UNITS[name] ?? '',
					last: s.metrics.find(m => m.name === name)?.points.slice(-1)[0]?.value ?? null,
					series: s.metrics.find(m => m.name === name)?.points.slice(-20) ?? []
				}))
			};
		})
	);

	function exportCSV() {
		const rows = ['time,' + chartSeries.map(d => d.name).join(',')];
		const allTimes = [...new Set(chartSeries.flatMap(d => d.points.map(p => p.time)))].sort();
		for (const t of allTimes) {
			const vals = chartSeries.map(d => d.points.find(p => p.time === t)?.value ?? '');
			rows.push(`${new Date(t).toISOString()},${vals.join(',')}`);
		}
		const a = Object.assign(document.createElement('a'), {
			href: URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })),
			download: `metric-${selectedMetric}-${Date.now()}.csv`
		});
		a.click();
	}

	function toggleHost(host: string) {
		const n = new Set(selectedHosts);
		if (n.has(host)) n.delete(host); else n.add(host);
		selectedHosts = n;
	}

	const hostColor = (h: string) =>
		({ 'lab-pc-01': '#7c6af7', 'lab-pc-02': '#06b6d4', 'lab-rpi-01': '#10b981' })[h] ?? '#6b7280';
</script>

<div class="p-6 space-y-5">
	<!-- Header + Controls -->
	<div class="flex flex-wrap gap-3 items-start justify-between">
		<div>
			<h1 class="text-xl font-semibold text-white">Metrics</h1>
			<p class="text-xs text-gray-500 mt-0.5">Live telemetry via CMDP · STAT/ topics · hover for values</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<select class="select text-xs" bind:value={selectedMetric}>
				{#each allMetricNames as m}
					<option value={m}>{LABELS[m] ?? m}</option>
				{/each}
			</select>
			<select class="select text-xs" bind:value={timeRange}>
				<option value={60}>1 min</option>
				<option value={300}>5 min</option>
				<option value={900}>15 min</option>
			</select>
			<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={exportCSV}>
				<Download size={12} /> CSV
			</button>
			<NotificationCenter />
		</div>
	</div>

	<!-- Host filter pills -->
	<div class="flex items-center gap-2 flex-wrap">
		<span class="text-xs text-gray-500">Filter by host:</span>
		<button
			class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
			style={selectedHosts.size === 0
				? 'background: rgba(124,106,247,0.12); border-color: #7c6af7; color: #a89ef7'
				: 'border-color: #2d2d4a; color: #6b7280'}
			onclick={() => (selectedHosts = new Set())}
		>All hosts</button>
		{#each allHosts as host}
			{@const active = selectedHosts.has(host)}
			{@const col = hostColor(host)}
			<button
				class="px-3 py-1 rounded-full text-xs font-mono border transition-colors"
				style={active
					? `background: ${col}20; border-color: ${col}; color: ${col}`
					: 'border-color: #2d2d4a; color: #6b7280'}
				onclick={() => toggleHost(host)}
			>
				{host}
				<span class="ml-1 opacity-50 text-[0.6rem]">({$satellites.filter(s => s.host === host).length})</span>
			</button>
		{/each}
	</div>

	<!-- Main Chart.js interactive chart -->
	<div class="card p-4">
		<div class="flex items-center justify-between mb-3">
			<div>
				<span class="text-sm font-medium text-white">{LABELS[selectedMetric] ?? selectedMetric}</span>
				<span class="text-xs text-gray-500 ml-2">{UNITS[selectedMetric] ?? ''} · last {timeRange}s</span>
			</div>
			{#if $constellation.currentRun}
				<div class="flex items-center gap-1.5 text-xs text-green-400">
					<span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block"></span>
					Run #{$constellation.currentRun.runNumber} · {$constellation.currentRun.eventCount.toLocaleString()} events
				</div>
			{/if}
		</div>
		<div style="height: 240px; position: relative;">
			<canvas bind:this={mainCanvas}></canvas>
			{#if chartSeries.length === 0}
				<div class="absolute inset-0 flex items-center justify-center text-gray-600 text-sm pointer-events-none">
					No data for <code class="font-mono ml-1.5 text-gray-500">{selectedMetric}</code> on selected hosts
				</div>
			{/if}
		</div>
	</div>

	<!-- Per-satellite mini panels -->
	<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each satCards as sc (sc.sat.id)}
			<div class="card p-4">
				<div class="flex items-center justify-between mb-3">
					<a href="/satellites/{sc.sat.id}"
						class="text-sm font-medium text-white hover:text-[#a78bfa] transition-colors font-mono truncate">
						{sc.sat.name}
					</a>
					<div class="flex items-center gap-1.5 shrink-0 ml-2">
						<StateBadge state={sc.sat.state} size="sm" />
						<span class="text-[0.6rem] font-mono text-gray-500">{sc.sat.host}</span>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					{#each sc.panels as panel}
						<div class="bg-[#0a0a0f] rounded-lg p-2.5 border border-[#1e1e30]">
							<div class="flex justify-between items-baseline mb-1.5">
								<span class="text-[0.6rem] text-gray-500 uppercase tracking-wide">{panel.label}</span>
								<span class="text-xs font-mono {panel.last === null ? 'text-gray-600' : 'text-white'}">{fmtVal(panel.last, panel.name)}</span>
							</div>
							{#if panel.series.length >= 2}
								<svg viewBox="0 0 100 28" preserveAspectRatio="none" class="w-full" style="height: 28px;">
									<path d={spark(panel.series)} fill="none" stroke={panel.color} stroke-width="1.5"
										stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							{:else}
								<div class="h-7 flex items-center justify-center text-[0.6rem] text-gray-700">no data</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>


