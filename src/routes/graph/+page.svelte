<script lang="ts">
	import { satellites } from '$lib/store';
	import StateBadge from '$lib/components/StateBadge.svelte';
	import { Network, Info, ZoomIn, ZoomOut, RotateCcw } from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import type { Satellite } from '$lib/types';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

	let isMobile = browser ? window.innerWidth < 768 : false;

	onMount(() => {
		function handleResize() { isMobile = window.innerWidth < 768; }
		if (browser) window.addEventListener('resize', handleResize);
		return () => { if (browser) window.removeEventListener('resize', handleResize); };
	});

	// ── Layout constants ──────────────────────────────────────────────
	const W = 900;
	const H = 520;
	const NODE_R = 38;

	// ── State colors (from app.css vars) ─────────────────────────────
	const STATE_COLOR: Record<string, string> = {
		NEW:    '#6b7280',
		INIT:   '#3b82f6',
		ORBIT:  '#06b6d4',
		RUN:    '#10b981',
		SAFE:   '#f59e0b',
		ERROR:  '#ef4444',
		DEAD:   '#374151',
	};

	function stateColor(s: string): string {
		return STATE_COLOR[s] ?? '#8b5cf6';
	}

	// ── Transition colors ─────────────────────────────────────────────
	const TRANS_COLOR: Record<string, string> = {
		initializing: '#3b82f6',
		launching:    '#06b6d4',
		starting:     '#10b981',
	};

	// ── Compute topological layers ────────────────────────────────────
	function computeLayers(sats: Satellite[]): Map<string, number> {
		const depMap = new Map<string, Set<string>>();
		for (const s of sats) {
			depMap.set(s.name, new Set(s.dependencies.map((d) => d.satellite)));
		}
		const layers = new Map<string, number>();
		const visited = new Set<string>();

		function visit(name: string, depth: number) {
			if (visited.has(name)) return;
			visited.add(name);
			layers.set(name, Math.max(layers.get(name) ?? 0, depth));
			// satellites that depend ON this one go deeper
		}

		// First pass: assign layer = max dependency depth
		function depth(name: string, seen = new Set<string>()): number {
			if (seen.has(name)) return 0; // cycle guard
			seen.add(name);
			const deps = depMap.get(name) ?? new Set();
			if (deps.size === 0) return 0;
			return 1 + Math.max(...[...deps].map((d) => depth(d, new Set(seen))));
		}

		for (const s of sats) {
			layers.set(s.name, depth(s.name));
		}
		return layers;
	}

	// ── Node positions ────────────────────────────────────────────────
	interface NodePos { x: number; y: number; sat: Satellite; }

	function computePositions(): NodePos[] {
		const sats = $satellites;
		const layers = computeLayers(sats);

		// Group by layer
		const byLayer = new Map<number, Satellite[]>();
		for (const sat of sats) {
			const layer = layers.get(sat.name) ?? 0;
			if (!byLayer.has(layer)) byLayer.set(layer, []);
			byLayer.get(layer)!.push(sat);
		}

		const maxLayer = Math.max(...byLayer.keys());
		const layerH = H / (maxLayer + 2);

		const result: NodePos[] = [];
		for (const [layer, layerSats] of byLayer) {
			const y = H - (layer + 1) * layerH;
			const colW = W / (layerSats.length + 1);
			layerSats.forEach((sat, i) => {
				result.push({ x: colW * (i + 1), y, sat });
			});
		}
		return result;
	}

	let positions: NodePos[] = $state([]);
	$effect(() => {
		positions = computePositions();
	});

	// ── Edge arrows ───────────────────────────────────────────────────
	interface Edge {
		from: NodePos; to: NodePos;
		label: string; transition: string;
	}

	function computeEdges(pos: NodePos[]): Edge[] {
		const byName = new Map(pos.map((p) => [p.sat.name, p]));
		const result: Edge[] = [];

		for (const nodePos of pos) {
			for (const dep of nodePos.sat.dependencies) {
				const target = byName.get(dep.satellite);
				if (target) {
					result.push({
						from: nodePos,
						to: target,
						label: dep.requiredState,
						transition: dep.transition,
					});
				}
			}
		}
		return result;
	}

	let edges: Edge[] = $state([]);
	$effect(() => {
		edges = computeEdges(positions);
	});

	// ── Arrow path computation ────────────────────────────────────────
	function arrowPath(from: NodePos, to: NodePos): string {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 1) return '';

		// Shorten by node radius + small gap
		const gap = NODE_R + 6;
		const ux = dx / dist;
		const uy = dy / dist;
		const x1 = from.x + ux * gap;
		const y1 = from.y + uy * gap;
		const x2 = to.x - ux * gap;
		const y2 = to.y - uy * gap;

		// Cubic bezier control points
		const cx = (x1 + x2) / 2;
		const cy = (y1 + y2) / 2 - 40;
		return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
	}

	function labelPos(from: NodePos, to: NodePos): { x: number; y: number } {
		const mx = (from.x + to.x) / 2;
		const my = (from.y + to.y) / 2 - 24;
		return { x: mx, y: my };
	}

	// ── View state ────────────────────────────────────────────────────
	let zoom = $state(1);
	let selectedSat = $state<string | null>(null);

	function setZoom(z: number) { zoom = Math.max(0.5, Math.min(2, z)); }
</script>

	<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0 gap-3">
		<div class="flex items-center gap-3 w-full sm:w-auto">
			<div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
				<Network size={16} class="text-accent" />
			</div>
			<div>
				<h1 class="text-lg font-bold text-white">Dependency Graph</h1>
				<p class="text-xs text-gray-500">
					require_after edges · topological launch order · {edges.length} dependencies
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2 w-full sm:w-auto">
			<div class="flex gap-2 grow sm:grow-0 overflow-auto">
				<button onclick={() => setZoom(zoom + 0.2)} class="p-1.5 rounded bg-bg-elevated border border-border hover:border-border-bright text-gray-400 hover:text-white transition-all"><ZoomIn size={14} /></button>
				<span class="text-xs font-mono text-gray-500 w-10 text-center hidden sm:inline">{Math.round(zoom * 100)}%</span>
				<button onclick={() => setZoom(zoom - 0.2)} class="p-1.5 rounded bg-bg-elevated border border-border hover:border-border-bright text-gray-400 hover:text-white transition-all"><ZoomOut size={14} /></button>
				<button onclick={() => { zoom = 1; selectedSat = null; }} class="p-1.5 rounded bg-bg-elevated border border-border hover:border-border-bright text-gray-400 hover:text-white transition-all"><RotateCcw size={14} /></button>
			</div>
			<NotificationCenter />
		</div>
	</div>

    <div class="flex flex-1 overflow-hidden flex-col sm:flex-row">
		<!-- Main SVG canvas -->
		<div class="flex-1 overflow-auto bg-bg-primary flex items-center justify-center p-4 sm:p-6">
			{#if $satellites.length === 0}
				<p class="text-gray-600 text-sm">No satellites connected</p>
			{:else}
				<svg width="100%" height={Math.round(H * zoom)} viewBox="0 0 {W} {H}" class="overflow-visible max-w-full">
					<!-- Arrow marker -->
					<defs>
						{#each Object.entries(TRANS_COLOR) as [trans, color]}
							<marker id="arrow-{trans}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
								<path d="M0,0 L0,6 L8,3 z" fill={color} />
							</marker>
						{/each}
						<marker id="arrow-default" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
							<path d="M0,0 L0,6 L8,3 z" fill="#6b7280" />
						</marker>
						<!-- Glow filter -->
						<filter id="glow">
							<feGaussianBlur stdDeviation="3" result="blur" />
							<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
						</filter>
					</defs>

					<!-- Grid lines (subtle) -->
					{#each [H * 0.25, H * 0.5, H * 0.75] as y}
						<line x1="0" y1={y} x2={W} y2={y} stroke="#1e1e30" stroke-width="1" stroke-dasharray="4 8" />
					{/each}

					<!-- Edges -->
					{#each edges as edge}
						{@const color = TRANS_COLOR[edge.transition] ?? '#6b7280'}
						{@const markerId = TRANS_COLOR[edge.transition] ? `arrow-${edge.transition}` : 'arrow-default'}
						{@const lp = labelPos(edge.from, edge.to)}
						<g opacity={selectedSat && selectedSat !== edge.from.sat.name && selectedSat !== edge.to.sat.name ? 0.15 : 1}>
							<path
								d={arrowPath(edge.from, edge.to)}
								fill="none"
								stroke={color}
								stroke-width="1.5"
								stroke-dasharray="5 3"
								marker-end="url(#{markerId})"
								opacity="0.7"
							/>
							<!-- Label background -->
							<rect
								x={lp.x - 24} y={lp.y - 8}
								width="48" height="16"
								rx="4"
								fill="#0f0f1a"
								stroke={color}
								stroke-width="0.5"
								opacity="0.9"
							/>
							<text x={lp.x} y={lp.y + 4} text-anchor="middle"
								fill={color} font-size="9" font-family="monospace">
								{edge.label}
							</text>
						</g>
					{/each}

					<!-- Nodes -->
					{#each positions as node}
						{@const color = stateColor(node.sat.state)}
						{@const isSelected = selectedSat === node.sat.name}
						{@const isDimmed = selectedSat !== null && !isSelected && !edges.some((e) => e.from.sat.name === node.sat.name || e.to.sat.name === node.sat.name || (selectedSat === e.from.sat.name) || (selectedSat === e.to.sat.name))}
						<g
							role="button"
							tabindex="0"
							onclick={() => (selectedSat = selectedSat === node.sat.name ? null : node.sat.name)}
							onkeydown={(e) => e.key === 'Enter' && (selectedSat = selectedSat === node.sat.name ? null : node.sat.name)}
							style="cursor: pointer;"
							opacity={isDimmed ? 0.25 : 1}
						>
							<!-- Glow ring when selected -->
							{#if isSelected}
								<circle cx={node.x} cy={node.y} r={NODE_R + 8} fill={color} opacity="0.12" filter="url(#glow)" />
							{/if}

							<!-- Outer ring -->
							<circle
								cx={node.x} cy={node.y} r={NODE_R + 4}
								fill="none"
								stroke={color}
								stroke-width={isSelected ? 2.5 : 1}
								opacity={isSelected ? 0.8 : 0.3}
							/>

							<!-- Node circle -->
							<circle
								cx={node.x} cy={node.y} r={NODE_R}
								fill={`${color}22`}
								stroke={color}
								stroke-width={isSelected ? 2 : 1.5}
							/>

							<!-- Role badge -->
							<rect
								x={node.x - 20} y={node.y - NODE_R - 13}
								width="40" height="13"
								rx="3"
								fill="#0f0f1a"
								stroke="#1e1e30"
								stroke-width="0.5"
							/>
							<text
								x={node.x} y={node.y - NODE_R - 4}
								text-anchor="middle"
								font-size="7.5"
								font-family="monospace"
								fill="#9ca3af"
							>{node.sat.role}</text>

							<!-- Type text -->
							<text
								x={node.x} y={node.y - 6}
								text-anchor="middle"
								font-size="10"
								font-weight="600"
								font-family="Inter, sans-serif"
								fill={color}
							>{node.sat.type}</text>

							<!-- Instance text -->
							<text
								x={node.x} y={node.y + 9}
								text-anchor="middle"
								font-size="9"
								font-family="monospace"
								fill="#d1d5db"
								opacity="0.7"
							>.{node.sat.instance}</text>

							<!-- State dot -->
							<circle cx={node.x + NODE_R - 6} cy={node.y - NODE_R + 6} r="5" fill={color} />
						</g>
					{/each}
				</svg>
			{/if}
		</div>

		<!-- Right panel: selected satellite detail or legend -->
		<div class="w-full sm:w-60 border-l border-border flex flex-col shrink-0 overflow-y-auto">
			{#if selectedSat}
				{@const sat = $satellites.find((s) => s.name === selectedSat)}
				{#if sat}
					<div class="p-4 border-b border-border">
						<p class="text-[0.6rem] text-gray-500 uppercase mb-2">Selected</p>
						<p class="text-sm font-semibold text-white">{sat.type}</p>
						<p class="text-xs font-mono text-gray-400">.{sat.instance}</p>
						<div class="mt-2">
							<StateBadge state={sat.state} size="sm" />
						</div>
					</div>
					{#if sat.dependencies.length > 0}
						<div class="p-4 border-b border-border">
							<p class="text-[0.6rem] text-gray-500 uppercase mb-2">Requires</p>
							{#each sat.dependencies as dep}
								<div class="flex flex-col gap-0.5 mb-2 p-2 rounded bg-bg-elevated border border-border">
									<p class="text-xs font-mono text-white">{dep.satellite}</p>
									<p class="text-[0.6rem] text-gray-500">during <span class="text-accent">{dep.transition}</span></p>
									<p class="text-[0.6rem] text-gray-500">must reach <span class="text-emerald-400">{dep.requiredState}</span></p>
								</div>
							{/each}
						</div>
					{:else}
						<div class="p-4 border-b border-border">
							<p class="text-[0.6rem] text-gray-500 uppercase mb-1">Dependencies</p>
							<p class="text-xs text-gray-600">None — launches independently</p>
						</div>
					{/if}
					<!-- Who depends on this one -->
					{@const dependents = $satellites.filter((s) => s.dependencies.some((d) => d.satellite === sat.name))}
					{#if dependents.length > 0}
						<div class="p-4">
							<p class="text-[0.6rem] text-gray-500 uppercase mb-2">Required by</p>
							{#each dependents as dep}
								<button
									onclick={() => (selectedSat = dep.name)}
									class="text-xs font-mono text-cyan-400 hover:text-white transition-colors block mb-1"
								>{dep.name}</button>
							{/each}
						</div>
					{/if}
				{/if}
			{:else}
				<!-- Legend -->
				<div class="p-4 border-b border-border">
					<p class="text-[0.6rem] text-gray-500 uppercase mb-3">State Colors</p>
					<div class="space-y-1.5">
						{#each Object.entries(STATE_COLOR) as [state, color]}
							<div class="flex items-center gap-2">
								<span class="w-3 h-3 rounded-full shrink-0" style="background: {color}"></span>
								<span class="text-xs font-mono text-gray-400">{state}</span>
							</div>
						{/each}
					</div>
				</div>
				<div class="p-4 border-b border-border">
					<p class="text-[0.6rem] text-gray-500 uppercase mb-3">Edge Types</p>
					<div class="space-y-2">
						{#each Object.entries(TRANS_COLOR) as [trans, color]}
							<div class="flex items-center gap-2">
								<svg width="32" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke={color} stroke-width="1.5" stroke-dasharray="4 2" /><polygon points="24,1 32,4 24,7" fill={color} /></svg>
								<span class="text-xs font-mono text-gray-400">{trans}</span>
							</div>
						{/each}
					</div>
				</div>
				<div class="p-4">
					<div class="flex items-start gap-2">
						<Info size={11} class="text-gray-600 mt-0.5 shrink-0" />
						<p class="text-[0.65rem] text-gray-600 leading-snug">Nodes are ordered by dependency depth. Click a node to inspect its require_after edges.</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
