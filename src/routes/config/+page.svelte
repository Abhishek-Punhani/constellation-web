<script lang="ts">
	import { satellites, constellation } from '$lib/store';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import { FileCode, Download, Upload, CheckCircle, AlertTriangle, Wand2, Copy, Check, MoreVertical } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let isMobile = browser ? window.innerWidth < 768 : false;

	let mobileMenuOpen = false;
	let menuRef: HTMLElement | null = null;
	let menuBtnRef: HTMLElement | null = null;

	onMount(() => {
		function handleResize() {
			isMobile = window.innerWidth < 768;
		}
		function handleDocClick(e: MouseEvent) {
			if (!mobileMenuOpen) return;
			const t = e.target as Node;
			if (menuRef && menuBtnRef && !menuRef.contains(t) && !menuBtnRef.contains(t)) {
				mobileMenuOpen = false;
			}
		}
		if (browser) {
			window.addEventListener('resize', handleResize);
			document.addEventListener('click', handleDocClick);
		}
		return () => {
			if (browser) {
				window.removeEventListener('resize', handleResize);
				document.removeEventListener('click', handleDocClick);
			}
		};
	});

	// ── Active satellite ─────────────────────────────────────────────
	let activeSatId = $state($satellites[0]?.id ?? '');
	const activeSat = $derived($satellites.find((s) => s.id === activeSatId));

	// ── Per-satellite editor content keyed by id ─────────────────────
	let editorContent = $state<Record<string, string>>({});
	let validationState = $state<Record<string, { valid: boolean; errors: string[]; keyCount: number }>>({});
	let copied = $state(false);

	// Initialize content when satellite changes
	$effect(() => {
		if (activeSat && !editorContent[activeSat.id]) {
			editorContent = { ...editorContent, [activeSat.id]: satToToml(activeSat.name, activeSat.config) };
		}
	});

	// ── TOML utilities ───────────────────────────────────────────────
	function toTomlVal(v: unknown): string {
		if (v === null || v === undefined) return '""';
		if (typeof v === 'boolean') return v ? 'true' : 'false';
		if (typeof v === 'number') return String(v);
		if (typeof v === 'string')
			return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
		if (Array.isArray(v)) {
			const items = v.map(toTomlVal);
			const inline = `[${items.join(', ')}]`;
			return inline.length <= 60 ? inline : `[\n  ${items.join(',\n  ')}\n]`;
		}
		return JSON.stringify(v);
	}

	function satToToml(satName: string, config: Record<string, unknown>): string {
		const lines: string[] = [`# ${satName} — Constellation TOML configuration`, `[${satName}]`];
		const sections: [string, Record<string, unknown>][] = [];
		for (const [key, val] of Object.entries(config)) {
			if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
				sections.push([key, val as Record<string, unknown>]);
			} else {
				lines.push(`${key} = ${toTomlVal(val)}`);
			}
		}
		for (const [key, obj] of sections) {
			lines.push('', `[${satName}.${key}]`);
			for (const [k, v] of Object.entries(obj)) {
				lines.push(`${k} = ${toTomlVal(v)}`);
			}
		}
		return lines.join('\n');
	}

	function fullDeducedToml(): string {
		const deduced = constellation.deduceConfig();
		return Object.entries(deduced)
			.map(([name, cfg]) => satToToml(name, cfg as Record<string, unknown>))
			.join('\n\n');
	}

	function validateToml(text: string): { valid: boolean; errors: string[]; keyCount: number } {
		const errors: string[] = [];
		let keyCount = 0;
		for (const [i, raw] of text.split('\n').entries()) {
			const line = raw.trim();
			if (!line || line.startsWith('#')) continue;
			if (line.startsWith('[')) {
				if (!line.endsWith(']')) errors.push(`Line ${i + 1}: unclosed section header`);
			} else if (line.includes('=')) {
				const key = line.split('=')[0]!.trim();
				if (!key) errors.push(`Line ${i + 1}: empty key`);
				else keyCount++;
			} else {
				errors.push(`Line ${i + 1}: unexpected token`);
			}
		}
		return { valid: errors.length === 0, errors, keyCount };
	}

	// ── Handlers ─────────────────────────────────────────────────────
	function deduceAll() {
		const deduced = constellation.deduceConfig();
		const next: Record<string, string> = {};
		for (const sat of $satellites) {
			const cfg = (deduced[sat.name] as Record<string, unknown>) ?? sat.config;
			next[sat.id] = satToToml(sat.name, cfg);
		}
		editorContent = next;
		validationState = {};
	}

	function deduceActive() {
		if (!activeSat) return;
		const deduced = constellation.deduceConfig();
		const cfg = (deduced[activeSat.name] as Record<string, unknown>) ?? activeSat.config;
		editorContent = { ...editorContent, [activeSat.id]: satToToml(activeSat.name, cfg) };
		validationState = { ...validationState };
	}

	function validateActive() {
		if (!activeSat) return;
		const text = editorContent[activeSat.id] ?? '';
		validationState = { ...validationState, [activeSat.id]: validateToml(text) };
	}

	function downloadAll() {
		const text = fullDeducedToml();
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'constellation.toml';
		a.click();
		URL.revokeObjectURL(url);
	}

	function downloadActive() {
		if (!activeSat) return;
		const text = editorContent[activeSat.id] ?? satToToml(activeSat.name, activeSat.config);
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${activeSat.name.replace('.', '_')}.toml`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file || !activeSat) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			editorContent = { ...editorContent, [activeSat.id]: text };
			validationState = { ...validationState, [activeSat.id]: validateToml(text) };
		};
		reader.readAsText(file);
	}

	async function copyActive() {
		if (!activeSat) return;
		const text = editorContent[activeSat.id] ?? '';
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const activeText = $derived(activeSat ? (editorContent[activeSat.id] ?? satToToml(activeSat.name, activeSat.config)) : '');
	const activeValidation = $derived(activeSat ? validationState[activeSat.id] : undefined);
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0 gap-3 relative">
		<div class="flex items-center gap-3 w-full sm:w-auto">
			<div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
				<FileCode size={16} class="text-accent" />
			</div>
			<div>
				<h1 class="text-lg font-bold text-white">Configuration Editor</h1>
				<p class="text-xs text-gray-500">TOML editor · per-satellite config · deduce from live state</p>
			</div>
		</div>

		<!-- Actions: full on desktop, compact + menu on mobile -->
		<div class="flex items-center gap-2 w-full sm:w-auto">
			<div class="flex gap-2 grow sm:grow-0 overflow-auto">
				<button
					onclick={deduceAll}
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 text-xs font-medium transition-all whitespace-nowrap"
				>
					<Wand2 size={12} /> <span class="hidden sm:inline">Deduce All</span>
				</button>
				<label class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border hover:border-border-bright text-gray-300 text-xs font-medium cursor-pointer transition-all whitespace-nowrap">
					<Upload size={12} /> <span class="hidden sm:inline">Upload TOML</span>
					<input type="file" accept=".toml,.yaml,.yml,.txt" class="hidden" onchange={handleUpload} />
				</label>
				<button
					onclick={downloadAll}
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border hover:border-border-bright text-gray-300 text-xs font-medium transition-all whitespace-nowrap"
				>
					<Download size={12} /> <span class="hidden sm:inline">Download All</span>
				</button>
			</div>

			<div class="flex items-center gap-2">
				<div class="hidden sm:block"><NotificationCenter /></div>
				<!-- Mobile menu button -->
				<button class="sm:hidden flex items-center px-2 py-1 rounded bg-bg-elevated border border-border text-gray-300"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)} aria-expanded={mobileMenuOpen} bind:this={menuBtnRef}>
					<MoreVertical size={16} />
				</button>
			</div>

			{#if mobileMenuOpen}
				<div bind:this={menuRef} class="absolute right-4 top-full mt-2 w-44 bg-bg-elevated border border-border rounded shadow-lg z-50">
					<button onclick={() => { deduceAll(); mobileMenuOpen = false; }} class="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-bg-secondary">Deduce All</button>
					<label class="w-full block px-3 py-2 text-xs text-gray-200 hover:bg-bg-secondary cursor-pointer">
						Upload TOML
						<input type="file" accept=".toml,.yaml,.yml,.txt" class="hidden" onchange={(e) => { handleUpload(e); mobileMenuOpen = false; }} />
					</label>
					<button onclick={() => { downloadAll(); mobileMenuOpen = false; }} class="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-bg-secondary">Download All</button>
					<div class="px-2 py-2 border-t border-border"><NotificationCenter /></div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex flex-col sm:flex-row flex-1 overflow-hidden">
{#if !isMobile}
		<!-- Satellite sidebar -->
		<div class="w-full sm:w-52 border-b border-border sm:border-b-0 sm:border-r flex sm:flex-col flex-row shrink-0 overflow-x-auto sm:overflow-y-auto">
			<div class="px-3 py-2.5 border-b border-border">
				<span class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Satellites ({$satellites.length})</span>
			</div>
			{#each $satellites as sat}
				<button
					onclick={() => (activeSatId = sat.id)}
					class="flex flex-col sm:flex-row gap-1 px-3 py-2.5 text-left whitespace-nowrap transition-all border-l-2 {activeSatId === sat.id ? 'bg-bg-elevated border-l-accent' : 'border-l-transparent hover:bg-bg-elevated/50'}"
				>
					<div class="flex items-center gap-2">
						<span class="text-[0.65rem] font-mono font-semibold text-white truncate leading-tight">{sat.name}</span>
						{#if validationState[sat.id]}
							{#if validationState[sat.id].valid}
								<CheckCircle size={10} class="text-emerald-400 shrink-0" />
							{:else}
								<AlertTriangle size={10} class="text-red-400 shrink-0" />
							{/if}
						{/if}
					</div>
					<StateBadge state={sat.state} size="sm" />
				</button>
			{/each}
		</div>
{/if}
		{#if activeSat}
			<div class="flex-1 flex flex-col overflow-hidden">
				<!-- Editor toolbar -->
				<div class="flex flex-col sm:flex-row items-center gap-2 px-4 py-2 border-b border-border bg-bg-secondary shrink-0">
					{#if isMobile}
						<select bind:value={activeSatId} class="mb-2 sm:mb-0 w-full sm:w-auto bg-bg-primary border border-border text-gray-300 text-xs rounded px-2 py-1">
							{#each $satellites as sat}
								<option value={sat.id}>{sat.name}</option>
							{/each}
						</select>
					{/if}
					<span class="text-xs font-mono text-gray-400 mr-auto">{activeSat.name}.toml</span>
					<button
						onclick={deduceActive}
						class="flex items-center gap-1 px-2.5 py-1 rounded bg-accent/10 border border-accent/20 text-accent text-xs hover:bg-accent/20 transition-all"
					>
						<Wand2 size={10} /> Deduce
					</button>
					<button
						onclick={validateActive}
						class="flex items-center gap-1 px-2.5 py-1 rounded bg-bg-elevated border border-border text-gray-300 text-xs hover:border-border-bright transition-all"
					>
						<CheckCircle size={10} /> Validate
					</button>
					<button
						onclick={copyActive}
						class="flex items-center gap-1 px-2.5 py-1 rounded bg-bg-elevated border border-border text-gray-300 text-xs hover:border-border-bright transition-all"
					>
						{#if copied}
							<Check size={10} class="text-emerald-400" /> Copied!
						{:else}
							<Copy size={10} /> Copy
						{/if}
					</button>
					<button
						onclick={downloadActive}
						class="flex items-center gap-1 px-2.5 py-1 rounded bg-bg-elevated border border-border text-gray-300 text-xs hover:border-border-bright transition-all"
					>
						<Download size={10} /> .toml
					</button>
				</div>

				<!-- Textarea -->
				<div class="flex-1 overflow-hidden flex flex-col">
					<textarea
						value={activeText}
						oninput={(e) => {
							if (!activeSat) return;
							editorContent = { ...editorContent, [activeSat.id]: (e.target as HTMLTextAreaElement).value };
							validationState = { ...validationState, [activeSat.id]: validateToml((e.target as HTMLTextAreaElement).value) };
						}}
						spellcheck="false"
						class="flex-1 w-full bg-bg-primary text-gray-300 font-mono text-xs leading-5 px-6 py-4 resize-none focus:outline-none"
						style="tab-size: 2; min-height: 0;"
					></textarea>
				</div>

				<!-- Status bar -->
				<div class="flex items-center gap-4 px-4 py-2 border-t border-border bg-bg-secondary shrink-0 text-[0.65rem]">
					{#if activeValidation}
						{#if activeValidation.valid}
							<span class="flex items-center gap-1.5 text-emerald-400">
								<CheckCircle size={10} /> Valid TOML · {activeValidation.keyCount} keys
							</span>
						{:else}
							<span class="flex items-center gap-1.5 text-red-400">
								<AlertTriangle size={10} /> {activeValidation.errors.length} error{activeValidation.errors.length > 1 ? 's' : ''}
							</span>
							{#each activeValidation.errors.slice(0, 3) as err}
								<span class="text-red-400/70">{err}</span>
							{/each}
						{/if}
					{:else}
						<span class="text-gray-600">Press Validate to check syntax</span>
					{/if}
					<span class="ml-auto text-gray-600">{activeText.split('\n').length} lines</span>
				</div>
			</div>
		{:else}
			<div class="flex-1 flex items-center justify-center text-gray-600">
				<p class="text-sm">Select a satellite to edit its configuration</p>
			</div>
		{/if}
	</div>
</div>
