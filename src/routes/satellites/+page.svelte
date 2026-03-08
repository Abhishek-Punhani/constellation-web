<script lang="ts">
	import { satellites, constellation, getAllowedCommands } from '$lib/store';
	import { goto } from '$app/navigation';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import RoleBadge from '$lib/components/RoleBadge.svelte';
	import LivesBar from '$lib/components/LivesBar.svelte';
	import { Filter, Search, ChevronRight, Zap, Plus, X } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import type { SatelliteState, AutonomyRole } from '$lib/types';

	type ViewMode = 'table' | 'cards';
	let viewMode = $state<ViewMode>('table');
	let searchText = $state('');
	let filterState = $state<SatelliteState | 'ALL'>('ALL');
	let filterRole = $state<AutonomyRole | 'ALL'>('ALL');

	let showAddDialog = $state(false);
	let newSatName = $state('');
	let newSatType = $state('Sputnik');
	let newSatHost = $state('lab-pc-01');

	// Derived list of available hosts from current satellites
	const hostOptions = $derived(Array.from(new Set($satellites.map((s) => s.host ?? '').filter(Boolean))).sort());

	const stateOptions: (SatelliteState | 'ALL')[] = ['ALL', 'RUN', 'ORBIT', 'INIT', 'SAFE', 'ERROR', 'NEW'];
	const roleOptions: (AutonomyRole | 'ALL')[] = ['ALL', 'ESSENTIAL', 'DYNAMIC', 'TRANSIENT', 'NONE'];

	const filtered = $derived($satellites.filter(s => {
		if (filterState !== 'ALL' && s.state !== filterState) return false;
		if (filterRole !== 'ALL' && s.role !== filterRole) return false;
		if (searchText && !s.name.toLowerCase().includes(searchText.toLowerCase()) &&
			!s.host.toLowerCase().includes(searchText.toLowerCase())) return false;
		return true;
	}));

	// Bulk command
	let selectedIds = $state<Set<string>>(new Set());
	function toggleSelect(id: string) {
		const n = new Set(selectedIds);
		if (n.has(id)) n.delete(id); else n.add(id);
		selectedIds = n;
	}
	function toggleAll() {
		if (selectedIds.size === filtered.length) selectedIds = new Set();
		else selectedIds = new Set(filtered.map(s => s.id));
	}
	function sendBulk(cmd: string) {
		selectedIds.forEach(id => constellation.sendCommand(id, cmd as any));
	}

	// What commands apply to ALL selected?
	const bulkAllowed = $derived(() => {
		if (selectedIds.size === 0) return [];
		const sets = [...selectedIds].map(id => {
			const s = $satellites.find(x => x.id === id);
			return s ? new Set(getAllowedCommands(s.state)) : new Set<string>();
		});
		return ['initialize','launch','start','stop','land','interrupt'].filter(c =>
			sets.every(s => s.has(c as any))
		);
	});

	const stateColor: Record<string, string> = {
		NEW: '#6b7280', INIT: '#3b82f6', ORBIT: '#06b6d4',
		RUN: '#10b981', SAFE: '#f59e0b', ERROR: '#ef4444', DEAD: '#4b5563'
	};
</script>

<div class="p-4 sm:p-6 space-y-5 min-w-0">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between ">
		<div>
			<h1 class="text-xl font-semibold text-white">Satellites</h1>
			<p class="text-xs text-gray-500 mt-0.5">{$satellites.length} satellites in constellation</p>
		</div>
		<div class="flex items-center gap-2 mt-3 sm:mt-0">
			<button
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent/10 border border-accent/30 text-[#a89ef7] hover:bg-accent/20 transition-colors"
				onclick={() => (showAddDialog = true)}
			>
				<Plus size={12} /> Add Satellite
			</button>
			<!-- View toggle -->
			<div class="flex bg-bg-card border border-border-bright rounded-lg overflow-hidden text-xs">
				<button onclick={() => viewMode = 'table'}
					class="px-3 py-1.5 transition-colors"
					class:bg-accent={viewMode === 'table'}
					class:text-white={viewMode === 'table'}
					class:text-gray-400={viewMode !== 'table'}>
					Table
				</button>
				<button onclick={() => viewMode = 'cards'}
					class="px-3 py-1.5 transition-colors"
					class:bg-accent={viewMode === 'cards'}
					class:text-white={viewMode === 'cards'}
					class:text-gray-400={viewMode !== 'cards'}>
					Cards
				</button>
			</div>
			<NotificationCenter />
		</div>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-2 items-center">
		<div class="relative">
			<Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
			<input
				bind:value={searchText}
				placeholder="Search name or host…"
				class="pl-7 pr-3 py-1.5 text-xs bg-bg-card border border-border-bright rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent w-full sm:w-48"
			/>
		</div>

		<div class="flex items-center gap-1">
			<Filter size={12} class="text-gray-500" />
			<span class="text-xs text-gray-500">State:</span>
			{#each stateOptions as s}
				<button
					onclick={() => filterState = s}
					class="px-2 py-0.5 rounded text-[0.65rem] font-medium border transition-colors"
					style={filterState === s
						? `background: ${s === 'ALL' ? '#7c6af7' : (stateColor[s] ?? '#7c6af7')}22; border-color: ${s === 'ALL' ? '#7c6af7' : (stateColor[s] ?? '#7c6af7')}; color: ${s === 'ALL' ? '#7c6af7' : (stateColor[s] ?? '#7c6af7')}`
						: 'background: transparent; border-color: #2d2d4a; color: #6b7280'
					}
				>{s}</button>
			{/each}
		</div>

		<div class="flex items-center gap-1 ml-2">
			<span class="text-xs text-gray-500">Role:</span>
			{#each roleOptions as r}
				<button
					onclick={() => filterRole = r}
					class="px-2 py-0.5 rounded text-[0.65rem] font-medium border transition-colors"
					style={filterRole === r ? 'background: rgba(124,106,247,0.1); border-color: #7c6af7; color: #7c6af7' : 'border-color: #2d2d4a; color: #6b7280'}
				>{r}</button>
			{/each}
		</div>
	</div>

	<!-- Bulk action bar -->
	{#if selectedIds.size > 0}
		<div class="flex items-center gap-3 px-4 py-2.5 bg-accent/10 border border-accent/30 rounded-lg">
			<Zap size={14} class="text-accent" />
			<span class="text-xs text-[#a89ef7]">{selectedIds.size} selected</span>
			<div class="flex gap-2 ml-2">
				{#each bulkAllowed() as cmd}
					<button onclick={() => sendBulk(cmd)}
						class="px-3 py-1 text-xs rounded-lg bg-accent/20 hover:bg-accent/40 text-[#c4b8ff] border border-accent/30 transition-colors capitalize">
						{cmd}
					</button>
				{/each}
			</div>
			<button onclick={() => selectedIds = new Set()}
				class="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">
				Clear
			</button>
		</div>
	{/if}

	{#if viewMode === 'table'}
	<!-- Table view -->
	<div class="card overflow-hidden">
		<div class="overflow-x-auto">
		<table class="w-full text-xs min-w-full">
			<thead>
				<tr class="border-b border-border">
					<th class="p-3 text-left w-8">
						<input type="checkbox"
							checked={selectedIds.size === filtered.length && filtered.length > 0}
							onclick={toggleAll}
							class="w-3.5 h-3.5 rounded accent-accent"
						/>
					</th>
					<th class="p-3 text-left text-gray-500 font-medium">Name</th>
					<th class="p-3 text-left text-gray-500 font-medium">State</th>
					<th class="p-3 text-left text-gray-500 font-medium">Role</th>
					<th class="p-3 text-left text-gray-500 font-medium hidden md:table-cell">Host</th>
					<th class="p-3 text-left text-gray-500 font-medium hidden lg:table-cell">Lives</th>
					<th class="p-3 text-left text-gray-500 font-medium hidden lg:table-cell">Status</th>
					<th class="p-3 text-left text-gray-500 font-medium w-10"></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as sat (sat.id)}
					<tr class="border-b border-border/50 hover:bg-bg-elevated/40 transition-colors cursor-pointer"
						style={selectedIds.has(sat.id) ? 'background: rgba(124,106,247,0.05)' : ''}
						onclick={() => goto(`/satellites/${sat.id}`)}>
						<td class="p-3">
							<input type="checkbox"
								checked={selectedIds.has(sat.id)}
								onclick={(e) => { e.stopPropagation(); toggleSelect(sat.id); }}
								class="w-3.5 h-3.5 rounded accent-accent"
							/>
						</td>
						<td class="p-3">
							<span class="font-mono text-gray-200">{sat.name}</span>
							{#if sat.extrasystole}
								<span class="ml-1.5 text-[0.6rem] text-amber-400 font-mono">⚡EXT</span>
							{/if}
						</td>
						<td class="p-3"><StateBadge state={sat.state} size="sm" /></td>
						<td class="p-3"><RoleBadge role={sat.role} /></td>
						<td class="p-3 hidden md:table-cell">
							<span class="font-mono text-gray-500">{sat.host}</span>
							<span class="text-gray-600 ml-1">:{sat.port}</span>
						</td>
						<td class="p-3 hidden lg:table-cell">
							<LivesBar lives={sat.lives} maxLives={sat.maxLives} extrasystole={sat.extrasystole} />
						</td>
						<td class="p-3 hidden lg:table-cell">
							<span class="text-gray-500 truncate max-w-45 inline-block">{sat.status}</span>
						</td>
						<td class="p-3 text-right">
							<a href="/satellites/{sat.id}"
								class="inline-flex items-center gap-0.5 text-accent hover:text-[#a89ef7] transition-colors">
								<ChevronRight size={14} />
							</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="p-8 text-center text-gray-600 text-xs">
							No satellites match the current filters.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
	</div>

	{:else}
	<!-- Card view -->
	<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each filtered as sat (sat.id)}
			<div class="card p-4 space-y-3 cursor-pointer hover:border-border-bright transition-colors"
				style={selectedIds.has(sat.id) ? 'border-color: rgba(124,106,247,0.3)' : ''}
				role="button"
				tabindex="0"
				onclick={() => goto(`/satellites/${sat.id}`)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto(`/satellites/${sat.id}`)}>
				<div class="flex items-start justify-between gap-2">
					<div>
						<div class="text-sm font-mono text-gray-200">{sat.name}</div>
						<div class="text-xs text-gray-500 font-mono mt-0.5">{sat.host}:{sat.port}</div>
					</div>
					<div class="flex flex-col items-end gap-1.5">
						<StateBadge state={sat.state} size="sm" />
						<RoleBadge role={sat.role} />
					</div>
				</div>
				<LivesBar lives={sat.lives} maxLives={sat.maxLives} extrasystole={sat.extrasystole} />
				<p class="text-xs text-gray-500 truncate">{sat.status}</p>
			</div>
		{:else}
			<div class="col-span-full text-center text-gray-600 text-xs py-12">
				No satellites match the current filters.
			</div>
		{/each}
	</div>
	{/if}
</div>

<!-- Add Satellite Dialog -->
{#if showAddDialog}
	<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
		<div class="card-elevated p-6 w-full max-w-md">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-base font-semibold text-white">Add Satellite</h2>
				<button onclick={() => (showAddDialog = false)} class="text-gray-600 hover:text-gray-300 p-1"><X size={16} /></button>
			</div>
			<div class="space-y-3">
				<div>
					<label for="sat-name" class="text-xs text-gray-400 mb-1 block">Instance Name</label>
					<input id="sat-name" class="input w-full" placeholder="e.g. hv2" bind:value={newSatName} />
				</div>
				<div>
					<label for="sat-type" class="text-xs text-gray-400 mb-1 block">Type</label>
					<select id="sat-type" class="select w-full" bind:value={newSatType}>
						{#each ['Sputnik', 'HighVoltage', 'H5DataWriter', 'EudaqNativeWriter', 'FlightRecorder', 'RandomTransmitter', 'TempSensor', 'DevNullReceiver', 'Mattermost'] as t}
							<option>{t}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="sat-host" class="text-xs text-gray-400 mb-1 block">Host</label>
					<select id="sat-host" class="select w-full" bind:value={newSatHost}>
						{#if hostOptions.length === 0}
							<option value="lab-pc-01">lab-pc-01</option>
						{:else}
							{#each hostOptions as h}
								<option>{h}</option>
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
