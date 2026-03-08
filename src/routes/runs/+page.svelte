<script lang="ts">
import { runs } from '$lib/store';
import { goto } from '$app/navigation';
import { Download, BarChart2, AlertTriangle, CheckCircle2, Zap, Activity, ChevronRight } from 'lucide-svelte';
import NotificationCenter from '$lib/components/NotificationCenter.svelte';
import type { RunCondition } from '$lib/types';

let filterCondition = $state<RunCondition | 'ALL'>('ALL');

const conditionColor: Record<RunCondition, string> = {
GOOD: 'text-green-400 bg-green-900/10 border-green-900/30',
DEGRADED: 'text-amber-400 bg-amber-900/10 border-amber-900/30',
TAINTED: 'text-orange-400 bg-orange-900/10 border-orange-900/30',
INCOMPLETE: 'text-red-400 bg-red-900/10 border-red-900/30'
};

const conditionIcon: Record<RunCondition, typeof CheckCircle2> = {
GOOD: CheckCircle2,
DEGRADED: AlertTriangle,
TAINTED: AlertTriangle,
INCOMPLETE: AlertTriangle
};

const filtered = $derived(
$runs.filter(r => filterCondition === 'ALL' || r.condition === filterCondition)
);

const summary = $derived({
total: $runs.length,
good: $runs.filter(r => r.condition === 'GOOD').length,
degraded: $runs.filter(r => r.condition === 'DEGRADED').length,
tainted: $runs.filter(r => r.condition === 'TAINTED').length,
incomplete: $runs.filter(r => r.condition === 'INCOMPLETE').length,
totalEvents: $runs.reduce((a, r) => a + r.eventCount, 0),
active: $runs.filter(r => !r.endTime).length
});

function formatDuration(start: number, end: number | null) {
if (!end) return 'Running\u2026';
const s = Math.floor((end - start) / 1000);
if (s < 60) return `${s}s`;
if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatTime(ts: number) {
return new Date(ts).toLocaleString(undefined, {
month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});
}

function formatDate(ts: number) {
return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function exportCSV() {
const rows = ['run,start_time,duration,condition,satellites,events,license'];
for (const r of filtered) {
rows.push(`${r.runNumber},"${formatTime(r.startTime)}","${formatDuration(r.startTime, r.endTime)}",${r.condition},"${r.satellites.join(';')}",${r.eventCount},${r.license}`);
}
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
a.download = `run-history-${Date.now()}.csv`;
a.click();
}
</script>

<div class="p-6 space-y-6">
<!-- Header -->
<div class="flex items-center justify-between">
<div>
<h1 class="text-xl font-semibold text-white">Run History</h1>
<p class="text-xs text-gray-500 mt-0.5">Click a run to view full diagnostics \u00b7 BOR/EOR bookends \u00b7 per-satellite metrics</p>
</div>
<div class="flex items-center gap-2">
<select class="select text-xs" bind:value={filterCondition}>
<option value="ALL">All Conditions</option>
<option value="GOOD">GOOD</option>
<option value="DEGRADED">DEGRADED</option>
<option value="TAINTED">TAINTED</option>
<option value="INCOMPLETE">INCOMPLETE</option>
</select>
<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={exportCSV}>
<Download size={12} /> Export CSV
</button>
<NotificationCenter />
</div>
</div>

<!-- Summary strip -->
<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
{#each [
{ label: 'Total Runs', value: summary.total, color: '#7c6af7', icon: Activity },
{ label: 'Active', value: summary.active, color: '#10b981', icon: Zap },
{ label: 'Good', value: summary.good, color: '#10b981', icon: CheckCircle2 },
{ label: 'Degraded', value: summary.degraded, color: '#f59e0b', icon: AlertTriangle },
{ label: 'Tainted', value: summary.tainted, color: '#f97316', icon: AlertTriangle },
{ label: 'Incomplete', value: summary.incomplete, color: '#ef4444', icon: AlertTriangle },
{ label: 'Total Events', value: summary.totalEvents.toLocaleString(), color: '#06b6d4', icon: BarChart2 }
] as s}
{@const Icon = s.icon}
<div class="card p-3 flex items-center gap-2.5">
<div class="shrink-0 w-7 h-7 rounded flex items-center justify-center" style="background: {s.color}18">
<Icon size={13} style="color: {s.color}" />
</div>
<div>
<div class="text-sm font-semibold font-mono" style="color: {s.color}">{s.value}</div>
<div class="text-[0.6rem] text-gray-500 leading-tight">{s.label}</div>
</div>
</div>
{/each}
</div>

<!-- Run list -->
<div class="space-y-2">
{#each filtered as run (run.id)}
{@const CIcon = conditionIcon[run.condition]}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
class="card flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-bg-card transition-colors select-none group"
onclick={() => goto(`/runs/${run.id}`)}
>
<div class="min-w-0 flex-1">
<div class="flex items-center gap-2 flex-wrap">
<span class="font-mono font-semibold text-white text-sm">Run #{run.runNumber}</span>
{#if !run.endTime}
<span class="text-[0.65rem] text-green-400 border border-green-800/40 bg-green-900/10 px-1.5 py-0.5 rounded font-medium animate-pulse">\u25cf LIVE</span>
{/if}
<span class="text-[0.7rem] font-medium px-2 py-0.5 rounded border {conditionColor[run.condition]} flex items-center gap-1">
<CIcon size={10} />{run.condition}
</span>
</div>
{#if run.runIdentifier?.label}
<p class="text-xs text-gray-400 mt-0.5 truncate">{run.runIdentifier.label}</p>
{/if}
</div>
<div class="hidden sm:flex items-center gap-6 shrink-0 text-right">
<div>
<div class="text-xs font-mono text-white">{formatTime(run.startTime)}</div>
<div class="text-[0.6rem] text-gray-500">{formatDate(run.startTime)}</div>
</div>
<div>
<div class="text-xs font-mono text-white">{formatDuration(run.startTime, run.endTime)}</div>
<div class="text-[0.6rem] text-gray-500">duration</div>
</div>
<div>
<div class="text-xs font-mono text-white">{run.eventCount.toLocaleString()}</div>
<div class="text-[0.6rem] text-gray-500">events</div>
</div>
<div>
<div class="text-xs font-mono text-white">{run.satellites.length}</div>
<div class="text-[0.6rem] text-gray-500">satellites</div>
</div>
</div>
<div class="text-gray-600 shrink-0 group-hover:text-gray-400 transition-colors">
<ChevronRight size={14} />
</div>
</div>
{:else}
<div class="card p-12 text-center text-gray-600 text-xs">
No runs match the current filter.
</div>
{/each}
</div>
</div>
