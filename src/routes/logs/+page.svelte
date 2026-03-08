<script lang="ts">
import { logs, satellites, constellation, globalSubscriptionLevel, senderSubscriptions, topicSubscriptions } from '$lib/store';
import ProtoBadge from '$lib/components/ProtoBadge.svelte';
import { Download, Search, Filter, X, RotateCcw, ChevronDown, Radio, Menu } from 'lucide-svelte';
import NotificationCenter from '$lib/components/NotificationCenter.svelte';
import type { LogLevel, Protocol, LogEntry } from '$lib/types';
import { page } from '$app/stores';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'STATUS', 'WARNING', 'CRITICAL'];
const PROTOCOLS: Protocol[] = ['CHIRP', 'CSCP', 'CHP', 'CMDP', 'CDTP'];
const LOG_TOPICS = ['FSM', 'LINK', 'DATA', 'CTRL', 'STAT', 'UI'];

// ─── Filter state ────────────────────────────────────────────────────────────

let filterLevels = $state<Set<LogLevel>>(new Set(LOG_LEVELS));
let filterProtocol = $state<Set<Protocol>>(new Set(PROTOCOLS));
let filterSatellite = $state($page.url.searchParams.get('satellite') ?? '');
let filterTopic = $state('');
let searchText = $state('');
let autoScroll = $state(true);
let logContainer: HTMLElement | null = null;
let showHeaderActions = $state(false);

// ─── Subscription panel ───────────────────────────────────────────────────────

let showSubscriptionPanel = $state(false);
let editingSender = $state<string | null>(null);

// ─── Message detail popup ────────────────────────────────────────────────────

let detailEntry = $state<LogEntry | null>(null);

// ─── Clear wall — only show entries received after this timestamp ─────────────

let clearedAt = $state<number>(0);

// ─── Derived ─────────────────────────────────────────────────────────────────

const filtered = $derived(
$logs
.filter((l) => l.time > clearedAt)
.filter((l) => filterLevels.has(l.level))
.filter((l) => filterProtocol.has(l.protocol))
.filter((l) => !filterSatellite || l.satellite.includes(filterSatellite))
.filter((l) => !filterTopic || l.topic === filterTopic)
.filter((l) => !searchText || l.message.toLowerCase().includes(searchText.toLowerCase()) || l.satellite.toLowerCase().includes(searchText.toLowerCase()))
.slice(-500)
);

const senders = $derived([...new Set($logs.map(l => l.satellite))].sort());

// ─── Colour maps ─────────────────────────────────────────────────────────────

const levelRowBg: Record<LogLevel, string> = {
TRACE: '', DEBUG: '', INFO: '',
STATUS: 'bg-green-950/10',
WARNING: 'bg-amber-950/30',
CRITICAL: 'bg-red-950/40 font-bold',
};

const levelTextColor: Record<LogLevel, string> = {
TRACE: 'text-gray-600',
DEBUG: 'text-gray-500',
INFO: 'text-gray-300',
STATUS: 'text-green-400',
WARNING: 'text-amber-300',
CRITICAL: 'text-red-300',
};

const levelDotColor: Record<LogLevel, string> = {
TRACE: 'bg-gray-700',
DEBUG: 'bg-gray-600',
INFO: 'bg-gray-400',
STATUS: 'bg-green-400',
WARNING: 'bg-amber-400',
CRITICAL: 'bg-red-400',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts: number) {
return new Date(ts).toISOString().replace('T', ' ').slice(0, 23);
}

function toggleProtocol(p: Protocol) {
filterProtocol = new Set(filterProtocol.has(p)
? [...filterProtocol].filter(x => x !== p)
: [...filterProtocol, p]);
}

function toggleLevel(level: LogLevel) {
filterLevels = new Set(filterLevels.has(level)
? [...filterLevels].filter((value) => value !== level)
: [...filterLevels, level]);
}

function resetFilters() {
filterLevels = new Set(LOG_LEVELS);
filterProtocol = new Set(PROTOCOLS);
filterSatellite = '';
filterTopic = '';
searchText = '';
}

function clearMessages() {
clearedAt = Date.now();
}

function exportCSV() {
const header = 'timestamp,level,protocol,topic,satellite,component,message\n';
const rows = filtered.map(l =>
`"${formatTime(l.time)}","${l.level}","${l.protocol}","${l.topic ?? ''}","${l.satellite}","${l.component}","${l.message.replace(/"/g, '""')}"`
).join('\n');
const blob = new Blob([header + rows], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = `constellation-logs-${Date.now()}.csv`; a.click();
URL.revokeObjectURL(url);
}

$effect(() => {
if (autoScroll && logContainer) {
Promise.resolve().then(() => {
if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
});
}
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
filtered;
});

const satNames = $derived(['', ...$satellites.map(s => s.name)]);

function senderLevel(sender: string): LogLevel {
return $senderSubscriptions.find(s => s.key === sender)?.level ?? $globalSubscriptionLevel;
}

function topicLevel(topic: string): LogLevel {
return $topicSubscriptions.find(s => s.key === topic)?.level ?? $globalSubscriptionLevel;
}
</script>

<div class="flex flex-col h-full overflow-hidden">
<!-- ─── Header ──────────────────────────────────────────────────────────────── -->
<div class="shrink-0 p-3 border-b border-border bg-bg-secondary space-y-1 relative">
<div class="flex items-center justify-between">
<div>
<h1 class="text-base font-semibold text-white">Live Logs — Observatory</h1>
<p class="text-[0.65rem] text-gray-500 sm:block hidden">CMDP LOG/ topics · source-side filtered</p>
</div>
<div class="flex items-center gap-1.5">
<div class="hidden sm:flex items-center gap-1.5">
<label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
<input type="checkbox" bind:checked={autoScroll} class="rounded" />
Auto-scroll
</label>
<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={clearMessages}>
<X size={11} /> Clear
</button>
<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={exportCSV}>
<Download size={11} /> Export CSV
</button>
<button
class="btn-ghost text-xs flex items-center gap-1.5 {showSubscriptionPanel ? 'bg-violet-900/40 text-violet-300' : ''}"
onclick={() => (showSubscriptionPanel = !showSubscriptionPanel)}
>
<Radio size={11} /> Subscriptions
</button>
<NotificationCenter />
</div>
<!-- mobile menu & actions -->
<div class="relative sm:hidden">
  <button class="btn-ghost p-1" onclick={() => (showHeaderActions = !showHeaderActions)}>
    <Menu size={16} />
  </button>
  {#if showHeaderActions}
    <div class="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded-lg shadow-2xl p-2 space-y-1 z-50">
      <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
        <input type="checkbox" bind:checked={autoScroll} class="rounded" />
        Auto-scroll
      </label>
      <button class="btn-ghost text-xs flex items-center gap-1.5" onclick={clearMessages}>
        <X size={11} /> Clear
      </button>
      <button class="btn-ghost text-xs flex items-center gap-1.5" onclick={exportCSV}>
        <Download size={11} /> Export CSV
      </button>
      <button
        class="btn-ghost text-xs flex items-center gap-1.5 {showSubscriptionPanel ? 'bg-violet-900/40 text-violet-300' : ''}"
        onclick={() => (showSubscriptionPanel = !showSubscriptionPanel)}
      >
        <Radio size={11} /> Subscriptions
      </button>
      <NotificationCenter />
    </div>
  {/if}
</div>
</div>
</div>

<!-- ─── Filter row ──────────────────────────────────────────────────────── -->
<div class="flex flex-wrap gap-2 items-center">
<!-- Text search -->
<div class="relative">
<Search size={11} class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
<input class="input text-xs pl-6 w-44" placeholder="Search message or sender…" bind:value={searchText} />
{#if searchText}
<button class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300" onclick={() => (searchText = '')}>
<X size={10} />
</button>
{/if}
</div>

<!-- Sender filter -->
<select class="select text-xs" bind:value={filterSatellite}>
{#each satNames as n}
<option value={n}>{n || 'All Senders'}</option>
{/each}
</select>

<!-- Topic filter -->
<select class="select text-xs" bind:value={filterTopic}>
<option value="">All Topics</option>
{#each LOG_TOPICS as t}
<option value={t}>{t}</option>
{/each}
</select>

<!-- Level toggles -->
<div class="flex items-center gap-1">
<Filter size={11} class="text-gray-500 shrink-0" />
<span class="text-[0.6rem] text-gray-500 mr-0.5">levels:</span>
{#each LOG_LEVELS as level}
<button
class="text-[0.65rem] font-medium px-2 py-0.5 rounded border transition-all duration-150 {levelTextColor[level]} {filterLevels.has(level) ? '' : 'opacity-25'}"
style="border-color: currentColor"
onclick={() => toggleLevel(level)}
>{level}</button>
{/each}
</div>

<!-- Protocol toggles -->
<div class="flex items-center gap-1">
{#each PROTOCOLS as proto}
<button
onclick={() => toggleProtocol(proto)}
class="transition-opacity {filterProtocol.has(proto) ? '' : 'opacity-25'}"
>
<span class="state-badge proto-{proto} text-[0.6rem]">{proto}</span>
</button>
{/each}
</div>

<!-- Reset -->
<button class="btn-ghost text-[0.65rem] flex items-center gap-1 py-0.5 px-1.5" onclick={resetFilters}>
<RotateCcw size={10} /> Reset
</button>
</div>
</div>

<!-- ─── Main area: log list + optional subscription panel ───────────────────── -->
<div class="flex flex-1 min-h-0 overflow-hidden">

<!-- ─── Log stream ──────────────────────────────────────────────────────── -->
<div
bind:this={logContainer}
class="flex-1 overflow-auto font-mono text-xs min-w-0 overflow-x-auto"
onscroll={(e) => {
const el = e.currentTarget;
autoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}}
>
<table class="w-full border-collapse min-w-full">
<thead class="sticky top-0 bg-bg-secondary border-b border-border z-10">
<tr>
<th class="text-left text-[0.6rem] text-gray-500 px-3 py-1.5 w-44">Time</th>
<th class="text-left text-[0.6rem] text-gray-500 px-2 py-1.5 w-20">Level</th>
<th class="text-left text-[0.6rem] text-gray-500 px-2 py-1.5 w-16 hidden md:table-cell">Proto</th>
<th class="text-left text-[0.6rem] text-gray-500 px-2 py-1.5 w-12 hidden lg:table-cell">Topic</th>
<th class="text-left text-[0.6rem] text-gray-500 px-2 py-1.5 w-40 hidden sm:table-cell">Sender</th>
<th class="text-left text-[0.6rem] text-gray-500 px-2 py-1.5">Message</th>
</tr>
</thead>
<tbody>
{#each filtered as entry (entry.id)}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<tr
class="border-b border-bg-elevated/50 hover:bg-bg-card transition-colors cursor-pointer {levelRowBg[entry.level]} {entry.isExtrasystole ? 'bg-orange-950/10' : ''}"
ondblclick={() => (detailEntry = entry)}
title="Double-click to view full details"
>
<td class="px-3 py-1 text-gray-600 tabular-nums whitespace-nowrap">{formatTime(entry.time)}</td>
<td class="px-2 py-1">
<span class="flex items-center gap-1.5 {levelTextColor[entry.level]}">
<span class="w-1.5 h-1.5 rounded-full shrink-0 {levelDotColor[entry.level]}"></span>
{entry.level}
</span>
</td>
<td class="px-2 py-1 hidden md:table-cell">
<ProtoBadge protocol={entry.protocol} />
</td>
<td class="px-2 py-1 text-gray-600 text-[0.6rem] hidden lg:table-cell">{entry.topic ?? ''}</td>
<td class="px-2 py-1 text-gray-400 truncate max-w-40 hidden sm:table-cell">
{#if entry.isExtrasystole}<span class="mr-1 text-amber-400">⚡</span>{/if}
{entry.satellite}
</td>
<td class="px-2 py-1 {levelTextColor[entry.level]}">{entry.message}</td>
</tr>
{/each}
</tbody>
</table>
{#if filtered.length === 0}
<div class="flex flex-col items-center justify-center h-40 text-gray-500 text-sm gap-2">
<Filter size={24} class="opacity-30" />
<span>No log entries match current filters.</span>
<button class="btn-ghost text-xs" onclick={resetFilters}>Reset filters</button>
</div>
{/if}
</div>

<!-- ─── Subscription panel (collapsible right sidebar) ──────────────────── -->
{#if showSubscriptionPanel}
<div class="w-64 shrink-0 border-l border-border overflow-y-auto bg-[#0d0d1a] flex flex-col fixed inset-y-0 right-0 z-50 md:static md:z-auto shadow-2xl md:shadow-none">
<div class="p-3 border-b border-border">
<div class="flex items-center justify-between mb-2">
<p class="text-xs font-medium text-white">Subscription Levels</p>
<button onclick={() => (showSubscriptionPanel = false)} class="text-gray-600 hover:text-gray-400">
<X size={12} />
</button>
</div>
<p class="text-[0.6rem] text-gray-500 leading-relaxed">
Source-side filtering. Changes affect only <em>new</em> messages from each sender.
</p>
</div>

<!-- Global level -->
<div class="p-3 border-b border-border">
<p class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-2">Global Level</p>
<div class="flex flex-wrap gap-1">
{#each LOG_LEVELS as level}
<button
class="text-[0.6rem] px-1.5 py-0.5 rounded border transition-all {$globalSubscriptionLevel === level
? levelTextColor[level] + ' border-current bg-current/10'
: 'text-gray-600 border-border-bright hover:text-gray-400'}"
onclick={() => constellation.setGlobalSubscriptionLevel(level)}
>{level}</button>
{/each}
</div>
<p class="text-[0.6rem] text-gray-600 mt-1.5">Receiving: <span class="text-gray-400">{$globalSubscriptionLevel}+</span></p>
</div>

<!-- Per-sender overrides -->
<div class="p-3 flex-1">
<p class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-2">Per-Sender Overrides</p>
<div class="space-y-1.5">
{#each senders as sender}
{@const override = $senderSubscriptions.find(s => s.key === sender)}
<div class="text-[0.6rem]">
<div class="flex items-center gap-1 mb-0.5">
<span class="text-gray-400 truncate flex-1 font-mono" title={sender}>{sender}</span>
{#if override}
<button
class="text-gray-600 hover:text-red-400 shrink-0"
onclick={() => constellation.removeSenderSubscription(sender)}
title="Remove override"
>
<X size={8} />
</button>
{/if}
<button
class="text-gray-600 hover:text-gray-300 shrink-0"
onclick={() => (editingSender = editingSender === sender ? null : sender)}
>
<ChevronDown size={8} />
</button>
</div>
{#if editingSender === sender}
<div class="flex flex-wrap gap-1 pl-1 mb-1">
{#each LOG_LEVELS as level}
<button
class="text-[0.55rem] px-1 py-0.5 rounded border transition-all {senderLevel(sender) === level
? levelTextColor[level] + ' border-current bg-current/10'
: 'text-gray-600 border-border-bright hover:text-gray-400'}"
onclick={() => constellation.setSenderSubscription(sender, level)}
>{level}</button>
{/each}
</div>
{:else}
<span class="text-gray-600">{override ? `→ ${override.level}` : `→ global (${$globalSubscriptionLevel})`}</span>
{/if}
</div>
{/each}
{#if senders.length === 0}
<p class="text-[0.6rem] text-gray-600 italic">No senders yet — start the simulation.</p>
{/if}
</div>

<!-- Per-topic overrides -->
<p class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-2 mt-4">Per-Topic Overrides</p>
<div class="space-y-1">
{#each LOG_TOPICS as topic}
{@const override = $topicSubscriptions.find(s => s.key === topic)}
<div class="flex items-center gap-1 text-[0.6rem]">
<span class="text-gray-500 font-mono w-10 shrink-0">{topic}</span>
<div class="flex flex-wrap gap-0.5 flex-1">
{#each LOG_LEVELS as level}
<button
class="text-[0.55rem] px-1 py-0.5 rounded border transition-all {topicLevel(topic) === level
? levelTextColor[level] + ' border-current bg-current/10'
: 'text-gray-700 border-border hover:text-gray-500'}"
onclick={() => constellation.setTopicSubscription(topic, level)}
title="{topic}: {level}"
>{level[0]}</button>
{/each}
</div>
{#if override}
<button
class="text-gray-600 hover:text-red-400 shrink-0"
onclick={() => constellation.removeTopicSubscription(topic)}
title="Remove topic override"
>
<X size={8} />
</button>
{/if}
</div>
{/each}
</div>
</div>
</div>
{/if}
</div>

<!-- ─── Status bar ────────────────────────────────────────────────────────────── -->
<div class="shrink-0 border-t border-border bg-bg-secondary px-3 py-1 flex items-center justify-between text-[0.6rem] text-gray-500">
<span>
{#if clearedAt > 0}
<span class="text-amber-500/70">Cleared at {new Date(clearedAt).toLocaleTimeString()} · </span>
{/if}
Subscription: <span class="text-gray-400">{$globalSubscriptionLevel}+</span>
{#if $senderSubscriptions.length > 0}
· <span class="text-gray-400">{$senderSubscriptions.length} sender override{$senderSubscriptions.length > 1 ? 's' : ''}</span>
{/if}
{#if filterLevels.size !== LOG_LEVELS.length || filterProtocol.size !== PROTOCOLS.length || filterSatellite || filterTopic || searchText}
· <span class="text-violet-400/80">view filters active</span>
{/if}
</span>
<span class="font-mono text-gray-400">
{filtered.length.toLocaleString()} / {$logs.filter(l => l.time > clearedAt).length.toLocaleString()} messages
</span>
</div>
</div>

<!-- ─── Message Detail Popup ──────────────────────────────────────────────────── -->
{#if detailEntry}
<div
	role="button"
	tabindex="0"
	aria-label="Close log detail"
	class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
	onclick={() => (detailEntry = null)}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			detailEntry = null;
		}
	}}
>
	<div
		class="card-elevated p-5 w-full max-w-lg space-y-4"
		role="dialog"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.stopPropagation();
			}
		}}
	>
		<div class="flex items-start justify-between gap-3">
<div class="flex-1 min-w-0">
<div class="flex items-center gap-2 flex-wrap mb-1">
<span class="text-[0.65rem] font-medium px-2 py-0.5 rounded {levelTextColor[detailEntry.level]} bg-current/10 border border-current/30">{detailEntry.level}</span>
<ProtoBadge protocol={detailEntry.protocol} />
{#if detailEntry.topic}
<span class="text-[0.6rem] font-mono text-gray-500 border border-border-bright px-1.5 py-0.5 rounded">{detailEntry.topic}</span>
{/if}
</div>
<p class="text-xs font-mono text-gray-500">{formatTime(detailEntry.time)}</p>
</div>
<button onclick={() => (detailEntry = null)} class="text-gray-600 hover:text-gray-300 transition-colors shrink-0 p-1">
<X size={16} />
</button>
</div>

<div class="bg-bg-secondary rounded-lg border border-border divide-y divide-border text-xs font-mono">
{#each [
{ label: 'Sender', value: detailEntry.satellite },
{ label: 'Component', value: detailEntry.component },
{ label: 'Protocol', value: detailEntry.protocol },
{ label: 'Topic', value: detailEntry.topic ?? '—' },
{ label: 'Extrasystole', value: detailEntry.isExtrasystole ? 'Yes ⚡' : 'No' },
{ label: 'BOR', value: detailEntry.isBOR ? 'Yes' : 'No' },
{ label: 'EOR', value: detailEntry.isEOR ? 'Yes' : 'No' },
] as row}
<div class="flex items-center px-3 py-1.5">
<span class="text-gray-500 w-24 shrink-0">{row.label}</span>
<span class="text-gray-200">{row.value}</span>
</div>
{/each}
</div>

<div>
<p class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-1.5">Message</p>
<p class="text-xs text-gray-200 leading-relaxed bg-bg-primary rounded p-3 border border-border font-mono wrap-break-word">{detailEntry.message}</p>
</div>

<div class="flex items-center gap-2 pt-1 border-t border-border">
<span class="text-[0.6rem] text-gray-500">Quick filter:</span>
<button
class="btn-ghost text-[0.65rem] py-0.5 px-2"
onclick={() => { filterSatellite = detailEntry!.satellite; detailEntry = null; }}
>
Only {detailEntry.satellite}
</button>
{#if detailEntry.topic}
<button
class="btn-ghost text-[0.65rem] py-0.5 px-2"
onclick={() => { filterTopic = detailEntry!.topic ?? ''; detailEntry = null; }}
>
Topic: {detailEntry.topic}
</button>
{/if}
</div>
</div>
</div>
{/if}
