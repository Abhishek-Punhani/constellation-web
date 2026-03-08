<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { constellation, globalState, DEMO_PROJECTS, addDemoProject, removeDemoProject, simSpeedMultiplier } from '$lib/store';
	import { uiSettings } from '$lib/settings';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import { onMount } from 'svelte';
	import {
		LayoutDashboard, Satellite, ScrollText, BarChart3,
		History, Workflow, Activity, X, Radio, ChevronDown, Plus, Trash2, Check, PanelLeftOpen, Keyboard,
		FileCode, ListOrdered, Network, Settings, Menu
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import type { Project } from '$lib/types';

	let { children } = $props();

	let isMobile = $state(browser ? window.innerWidth < 768 : false);
	let sidebarOpen = $state(browser ? window.innerWidth >= 768 : true);
	let stopSim: (() => void) | null = null;
	let activeProjectId = $state(DEMO_PROJECTS[0].id);
	let projectMenuOpen = $state(false);
	let shortcutsOpen = $state(false);

	// Sync sim speed from persisted settings whenever it changes
	$effect(() => { simSpeedMultiplier.set($uiSettings.simSpeedMultiplier); });

	// Reactive project list — re-read DEMO_PROJECTS after mutations
	let projects = $state([...DEMO_PROJECTS]);

	const activeProject = $derived(projects.find((p) => p.id === activeProjectId));

	// New-project inline form
	let showNewForm = $state(false);
	let newName = $state('');
	let newGroup = $state('');
	let newColor = $state('#7c6af7');
	const PALETTE = ['#7c6af7','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b'];

	// Confirm-delete state: holds the id being confirmed
	let confirmDeleteId = $state<string | null>(null);

	// Close mobile sidebar on nav
	$effect(() => {
		$page.url.pathname; // subscribe
		if (isMobile) sidebarOpen = false;
	});

	onMount(() => {
		stopSim = constellation.startSimulation();

		function handleResize() {
			isMobile = window.innerWidth < 768;
			if (!isMobile && !sidebarOpen) sidebarOpen = true;
		}
		window.addEventListener('resize', handleResize);

		function handleGlobalKey(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			if (e.key === '?') { e.preventDefault(); shortcutsOpen = !shortcutsOpen; return; }
			if (e.key === 'Escape') { shortcutsOpen = false; return; }
			if (e.metaKey || e.ctrlKey) return; // let browser shortcuts pass
			if (e.key === 'g' || e.key === 'G') { goto('/'); return; }
			if (e.key === 's' || e.key === 'S') { goto('/satellites'); return; }
			if (e.key === 'l' || e.key === 'L') { goto('/logs'); return; }
			if (e.key === 'm' || e.key === 'M') { goto('/metrics'); return; }
			if (e.key === 'r' || e.key === 'R') { goto('/runs'); return; }
			if (e.key === 'e' || e.key === 'E') { goto('/environment'); return; }
			if (e.key === 'p' || e.key === 'P') { goto('/playground'); return; }
		}
		window.addEventListener('keydown', handleGlobalKey);
		return () => { stopSim?.(); window.removeEventListener('keydown', handleGlobalKey); window.removeEventListener('resize', handleResize); };
	});

	function switchTo(proj: Project) {
		activeProjectId = proj.id;
		constellation.switchProject(proj.id);
	}

	function openTools() {
		sidebarOpen = true;
		// scroll to tools section after sidebar expands
		setTimeout(() => {
			document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
		}, 100);
	}

	function submitNewProject() {
		const name = newName.trim();
		if (!name) return;
		const id = `proj-${Date.now()}`;
		const initial = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
		const proj: Project = { id, name, groupName: newGroup.trim() || 'user', color: newColor, initial };
		addDemoProject(proj);
		projects = [...DEMO_PROJECTS];
		switchTo(proj);
		newName = '';
		newGroup = '';
		newColor = '#7c6af7';
		showNewForm = false;
		projectMenuOpen = false;
	}

	function deleteProject(id: string) {
		if (id === activeProjectId) return;
		removeDemoProject(id);
		projects = [...DEMO_PROJECTS];
		confirmDeleteId = null;
	}

	const navItems = [
		{ href: '/', label: 'Mission Control', icon: LayoutDashboard, id: 'nav-dashboard' },
		{ href: '/satellites', label: 'Satellites', icon: Satellite, id: 'nav-satellites' },
		{ href: '/logs', label: 'Live Logs', icon: ScrollText, id: 'nav-logs' },
		{ href: '/metrics', label: 'Metrics', icon: BarChart3, id: 'nav-metrics' },
		{ href: '/runs', label: 'Run History', icon: History, id: 'nav-runs' },
	];

	const toolItems = [
		{ href: '/config', label: 'Config Editor', icon: FileCode, id: 'nav-config' },
		{ href: '/queue', label: 'Meas. Queue', icon: ListOrdered, id: 'nav-queue' },
		{ href: '/graph', label: 'Dep. Graph', icon: Network, id: 'nav-graph' },
		{ href: '/playground', label: 'Playground', icon: Workflow, id: 'nav-playground' },
		{ href: '/environment', label: 'Environment', icon: Activity, id: 'nav-environment' },
		{ href: '/settings', label: 'Settings', icon: Settings, id: 'nav-settings' },
	];

	const currentPath = $derived($page.url.pathname);

	function isActive(href: string) {
		if (href === '/') return currentPath === '/';
		return currentPath.startsWith(href);
	}
</script>

<svelte:head>
	<title>Constellation Web Interface</title>
	<meta
		name="description"
		content="Constellation Web Interface (Constellation-Web) is the in-browser mission control for monitoring satellites, logs, metrics, and runs in real time."
	/>
	<meta name="robots" content="index, follow" />
	<meta property="og:title" content="Constellation Web Interface" />
	<meta
		property="og:description"
		content="Monitor satellites, live logs, and performance metrics through Constellation-Web for a single-pane mission control experience."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Constellation Web Interface" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Constellation Web Interface" />
	<meta
		name="twitter:description"
		content="Constellation-Web brings telemetry, metrics, and run history together so operators can steer satellites with confidence."
	/>
</svelte:head>

<div class="flex h-screen overflow-hidden overflow-x-hidden bg-bg-primary">
	<!-- Mobile sidebar backdrop -->
	{#if isMobile && sidebarOpen}
		<div class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onclick={() => { sidebarOpen = false; projectMenuOpen = false; }} aria-hidden="true"></div>
	{/if}

	<!-- click-outside backdrop (project menu) -->
	{#if projectMenuOpen}
		<div class="fixed inset-0 z-30" onclick={() => (projectMenuOpen = false)} aria-hidden="true"></div>
	{/if}

	<!-- Mobile hamburger FAB removed - bottom nav handles navigation -->

	<aside class={`flex flex-col shrink-0 border-r border-border bg-bg-secondary transition-all duration-200 ${isMobile ? 'fixed inset-y-0 left-0 z-50 w-60 shadow-2xl' : 'relative z-40'} ${isMobile && !sidebarOpen ? '-translate-x-full' : ''} ${!isMobile && sidebarOpen ? 'w-60' : ''} ${!isMobile && !sidebarOpen ? 'w-16' : ''}`}>
		<!-- Project header -->
		<div class="px-3 py-3 border-b border-border relative">
			{#if sidebarOpen}
				<div class="flex items-center gap-2">
					<!-- Active project avatar -->
					<div
						class="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
					style={`background-color: ${activeProject?.color ?? '#7c6af7'}22; border-color: ${activeProject?.color ?? '#7c6af7'}55;`}
				>
					<span class="text-xs font-bold" style={`color: ${activeProject?.color ?? '#7c6af7'}`}>{activeProject?.initial ?? '??'}</span>
				</div>

				<!-- Name + group -->
				<div class="min-w-0 flex-1">
					<div class="text-sm font-semibold text-white leading-tight truncate">{activeProject?.name ?? 'Constellation'}</div>
					<div class="text-[0.6rem] text-gray-500 leading-tight truncate">{activeProject?.groupName ?? ''}</div>
				</div>

				<!-- Chevron trigger -->
				<button
					class="p-1.5 rounded-lg hover:bg-bg-elevated transition-all duration-100 shrink-0"
					onclick={(e) => { e.stopPropagation(); projectMenuOpen = !projectMenuOpen; if (!projectMenuOpen) { showNewForm = false; confirmDeleteId = null; } }}
					aria-label="Switch project"
				>
					<ChevronDown size={14} class={`text-gray-400 transition-transform duration-200 ${projectMenuOpen ? 'rotate-180' : ''}`} />
				</button>

				<!-- Collapse sidebar -->
				<button
					class="p-1.5 rounded-lg hover:bg-bg-elevated transition-all duration-100 shrink-0"
					onclick={() => { sidebarOpen = false; projectMenuOpen = false; }}
					aria-label="Collapse sidebar"
				>
					<X size={14} class="text-gray-400" />
				</button>
			</div>
		{:else}
		<!-- Collapsed: avatar + expand button -->
		<div class="flex flex-col items-center gap-1.5">
			<div
				class="w-9 h-9 rounded-lg flex items-center justify-center border cursor-pointer"
				style={`background-color: ${activeProject?.color ?? '#7c6af7'}22; border-color: ${activeProject?.color ?? '#7c6af7'}55;`}
				role="button"
				tabindex="0"
				onclick={() => (sidebarOpen = true)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (sidebarOpen = true)}
			>
				<span class="text-xs font-bold" style={`color: ${activeProject?.color ?? '#7c6af7'}`}>{activeProject?.initial ?? '??'}</span>
			</div>
			<button
				class="p-1 rounded-md hover:bg-bg-elevated transition-all"
				onclick={() => (sidebarOpen = true)}
				aria-label="Expand sidebar"
			>
				<PanelLeftOpen size={13} class="text-gray-500" />
			</button>
		</div>
			{/if}

			<!-- Floating project overlay -->
			{#if projectMenuOpen}
				<div
					class="absolute top-full left-3 mt-1 w-60 bg-[#0d0d18] border border-[#252535] rounded-xl shadow-2xl z-50 overflow-hidden"
					role="menu"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					<div class="px-3 pt-3 pb-1.5">
						<p class="text-[0.65rem] uppercase tracking-[0.18em] text-gray-500 font-medium">Projects</p>
					</div>

					<!-- Project rows -->
					<div class="space-y-0.5 px-2 pb-2">
						{#each projects as proj (proj.id)}
							<div class="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all duration-100 {activeProjectId === proj.id ? 'bg-[#1a1a30]' : 'hover:bg-[#151525]'}">
								<!-- Avatar -->
								<div
									class="w-7 h-7 rounded-md flex items-center justify-center border shrink-0"
									style={`background-color: ${proj.color}22; border-color: ${proj.color}44;`}
								>
									<span class="text-[0.6rem] font-bold" style={`color: ${proj.color}`}>{proj.initial}</span>
								</div>

								<!-- Name (clickable to switch) -->
								<button
									class="min-w-0 flex-1 text-left"
									onclick={() => { switchTo(proj); projectMenuOpen = false; showNewForm = false; confirmDeleteId = null; }}
								>
									<div class="text-xs font-semibold leading-tight truncate {activeProjectId === proj.id ? 'text-white' : 'text-gray-300'}">{proj.name}</div>
									<div class="text-[0.6rem] text-gray-500 leading-tight truncate">{proj.groupName}</div>
								</button>

								<!-- Active indicator or delete -->
								{#if activeProjectId === proj.id}
									<div class="w-1.5 h-1.5 rounded-full bg-accent shrink-0"></div>
								{:else}
									{#if confirmDeleteId === proj.id}
										<!-- Confirm row -->
										<div class="flex items-center gap-1 shrink-0">
											<button
												class="p-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-all"
												onclick={() => deleteProject(proj.id)}
												aria-label="Confirm delete"
											><Check size={11} /></button>
											<button
												class="p-1 rounded hover:bg-[#252535] text-gray-500 transition-all"
												onclick={() => (confirmDeleteId = null)}
												aria-label="Cancel"
											><X size={11} /></button>
										</div>
									{:else}
										<button
											class="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-all"
											onclick={() => (confirmDeleteId = proj.id)}
											aria-label="Delete project"
										><Trash2 size={12} /></button>
									{/if}
								{/if}
							</div>
						{/each}
					</div>

					<!-- New project -->
					<div class="border-t border-border">
						{#if showNewForm}
							<!-- Inline form -->
							<div class="px-3 py-3 space-y-2.5">
								<input
									bind:value={newName}
									placeholder="Project name"
									class="w-full bg-[#111122] border border-[#2a2a40] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent"
									onkeydown={(e) => { if (e.key === 'Enter') submitNewProject(); if (e.key === 'Escape') showNewForm = false; }}
								/>
								<input
									bind:value={newGroup}
									placeholder="Group / org (optional)"
									class="w-full bg-[#111122] border border-[#2a2a40] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent"
									onkeydown={(e) => { if (e.key === 'Enter') submitNewProject(); if (e.key === 'Escape') showNewForm = false; }}
								/>
								<!-- Color palette -->
								<div class="flex items-center gap-1.5">
									{#each PALETTE as c}
										<button
											class="w-5 h-5 rounded-full border-2 transition-all {newColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}"
											style={`background: ${c}`}
											onclick={() => (newColor = c)}
											aria-label={`Color ${c}`}
										></button>
									{/each}
								</div>
								<!-- Actions -->
								<div class="flex gap-2">
									<button
										class="flex-1 py-1.5 rounded-lg bg-accent hover:bg-[#6d5ce6] text-white text-xs font-semibold transition-all disabled:opacity-40"
										disabled={!newName.trim()}
										onclick={submitNewProject}
									>Create</button>
									<button
										class="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-[#252535] text-gray-400 text-xs transition-all"
										onclick={() => (showNewForm = false)}
									>Cancel</button>
								</div>
							</div>
						{:else}
							<button
								class="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-gray-500 hover:text-white hover:bg-[#151525] transition-all"
								onclick={() => { showNewForm = true; confirmDeleteId = null; }}
							>
								<div class="w-7 h-7 rounded-md border border-dashed border-[#3a3a50] flex items-center justify-center shrink-0">
									<Plus size={12} class="text-gray-600" />
								</div>
								<span class="font-medium">New project</span>
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<nav class="flex-1 py-3 overflow-y-auto">
			<!-- Main nav -->
			<div class="space-y-0.5">
				{#each navItems as item (item.href)}
					{@const Icon = item.icon}
					<a
						href={item.href}
						id={item.id}
						class={`flex items-center gap-3 px-3 py-2 mx-3 rounded-lg transition-all duration-100 ${isActive(item.href) ? 'text-[#a78bfa] border-l-2 border-accent bg-bg-elevated' : 'text-gray-400 hover:text-gray-200 hover:bg-bg-elevated/70'}`}
					>
						<Icon size={16} class="shrink-0" />
						{#if sidebarOpen}
							<span class="truncate font-medium">{item.label}</span>
						{/if}
					</a>
				{/each}
			</div>

			<!-- Tools separator -->
			<div id="tools-section" class="mx-3 my-2 border-t border-border"></div>
			{#if sidebarOpen}
				<p class="px-3 pb-1 text-[0.6rem] text-gray-600 uppercase tracking-wider">Tools</p>
			{/if}

			<!-- Tool nav items -->
			<div class="space-y-0.5">
				{#each toolItems as item (item.href)}
					{@const Icon = item.icon}
					<a
						href={item.href}
						id={item.id}
						class={`flex items-center gap-3 px-3 py-2 mx-3 rounded-lg transition-all duration-100 ${isActive(item.href) ? 'text-[#a78bfa] border-l-2 border-accent bg-bg-elevated' : 'text-gray-400 hover:text-gray-200 hover:bg-bg-elevated/70'}`}
					>
						<Icon size={16} class="shrink-0" />
						{#if sidebarOpen}
							<span class="truncate font-medium">{item.label}</span>
						{/if}
					</a>
				{/each}
			</div>
		</nav>

		{#if sidebarOpen}
			<div class="px-3 py-2 border-t border-border">
				<div class="flex items-center justify-between">
					<span class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Global State</span>
					<StateBadge state={$globalState} size="sm" />
				</div>
			</div>
		{/if}

		<div class="px-3 py-3 border-t border-border">
			<div class="flex items-center gap-2">
				<span class={`w-2 h-2 rounded-full shrink-0 ${$constellation.connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}></span>
				{#if sidebarOpen}
					<span class="text-xs text-gray-500">{$constellation.connected ? 'Demo Mode · Live' : 'Disconnected'}</span>
					<div class="ml-auto flex items-center gap-1">
						<button class="p-1 rounded hover:bg-bg-elevated text-gray-600 hover:text-gray-300 transition-colors" onclick={() => (shortcutsOpen = true)} title="Keyboard shortcuts (?)"><Keyboard size={12} /></button>
					</div>
				{/if}
			</div>
		</div>
	</aside>

	<main class="flex-1 overflow-auto bg-[#04040a] min-w-0 pb-16 md:pb-0">
		{@render children()}
	</main>

	{#if isMobile && !sidebarOpen}
		<nav class="mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-border flex justify-between py-2 z-40 md:hidden">
			{#each navItems as item}
				<a href={item.href}
					class="flex flex-col items-center transition-colors"
					class:active={isActive(item.href)}
					aria-label={item.label}
				>
					<item.icon size={18} />
					<span class="truncate leading-tight">{item.label}</span>
				</a>
			{/each}
			<!-- tools button opens sidebar and scrolls to tool list -->
			<button onclick={openTools} class="flex flex-col items-center transition-colors" class:active={sidebarOpen} aria-label="Tools">
				<Settings size={18} />
				<span class="truncate leading-tight">Tools</span>
			</button>
		</nav>
	{/if}

</div>

<!-- Keyboard Shortcuts Modal -->
{#if shortcutsOpen}
	<div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center p-4"
		role="presentation"
		onclick={() => (shortcutsOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (shortcutsOpen = false)}
	>
		<div class="card-elevated p-6 w-full max-w-lg" role="dialog" aria-modal="true" tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between mb-5">
				<div class="flex items-center gap-2">
					<Keyboard size={16} class="text-accent" />
					<h2 class="text-base font-semibold text-white">Keyboard Shortcuts</h2>
				</div>
				<button onclick={() => (shortcutsOpen = false)} class="text-gray-600 hover:text-gray-300 transition-colors p-1"><X size={16} /></button>
			</div>

			<div class="space-y-5 text-sm">
				<!-- Navigation -->
				<div>
					<p class="text-[0.65rem] uppercase tracking-widest text-gray-500 mb-2">Navigation</p>
					<div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
						{#each [
							{ key: 'G', label: 'Mission Control' },
							{ key: 'S', label: 'Satellites' },
							{ key: 'L', label: 'Live Logs' },
							{ key: 'M', label: 'Metrics' },
							{ key: 'R', label: 'Run History' },
							{ key: 'E', label: 'Environment' },
							{ key: 'P', label: 'Playground' },
						] as s}
							<div class="flex items-center gap-2.5">
								<kbd class="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-bright text-[0.7rem] font-mono text-gray-300 min-w-[1.6rem] text-center">{s.key}</kbd>
								<span class="text-gray-400 text-xs">{s.label}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- General -->
				<div>
					<p class="text-[0.65rem] uppercase tracking-widest text-gray-500 mb-2">General</p>
					<div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
						{#each [
							{ key: '?', label: 'Toggle this panel' },
							{ key: 'Esc', label: 'Close modal / panel' },
						] as s}
							<div class="flex items-center gap-2.5">
								<kbd class="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-bright text-[0.7rem] font-mono text-gray-300 min-w-[1.6rem] text-center">{s.key}</kbd>
								<span class="text-gray-400 text-xs">{s.label}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Note -->
				<p class="text-[0.65rem] text-gray-600 border-t border-border pt-3">
					Shortcuts are disabled when an input field is focused.
				</p>
			</div>
		</div>
	</div>
{/if}
