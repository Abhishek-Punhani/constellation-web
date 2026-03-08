<script lang="ts">
	import type { SatelliteState } from '$lib/types';
	import { STATE_COLORS } from '$lib/constants';

	const { state, onTransition }: {
		state: SatelliteState;
		onTransition?: (cmd: string) => void;
	} = $props();

	// Normalise transitional states to their base for highlighting
	const baseState = $derived((() => {
		if (state === 'initializing') return 'INIT';
		if (state === 'launching' || state === 'landing' || state === 'reconfiguring') return 'ORBIT';
		if (state === 'starting' || state === 'stopping') return 'RUN';
		if (state === 'interrupting') return 'SAFE';
		return state as string;
	})());

	// Is the satellite in a transitional state right now?
	const isTransitioning = $derived(['initializing','launching','landing','starting','stopping','reconfiguring','interrupting'].includes(state));

	// Steady-state node definitions
	type Node = { id: string; x: number; y: number; label: string; subLabel?: string };
	const nodes: Node[] = [
		{ id: 'NEW',   x: 70,  y: 44,  label: 'NEW',   subLabel: 'Started' },
		{ id: 'INIT',  x: 210, y: 44,  label: 'INIT',  subLabel: 'Configured' },
		{ id: 'ORBIT', x: 360, y: 44,  label: 'ORBIT', subLabel: 'Ready' },
		{ id: 'RUN',   x: 500, y: 44,  label: 'RUN',   subLabel: 'Taking data' },
		{ id: 'ERROR', x: 210, y: 160, label: 'ERROR', subLabel: 'Failure' },
		{ id: 'SAFE',  x: 360, y: 160, label: 'SAFE',  subLabel: 'Safe mode' },
	];
	const nodeW = 100;
	const nodeH = 46;
	const rx = 8;

	// Derive color per node
	function nodeColor(id: string): string {
		return STATE_COLORS[id] ?? '#6b7280';
	}
	function isActive(id: string): boolean { return baseState === id; }

	// Arrow definitions: from, to, label, cmd, midX?, midY?
	type Arrow = {
		from: string; to: string; label: string; cmd: string;
		// control points for curved arrows
		cpx?: number; cpy?: number;
		labelOffX?: number; labelOffY?: number;
		bidirectional?: boolean;
	};
	const arrows: Arrow[] = [
		// main track — forward
		{ from: 'NEW',   to: 'INIT',  label: 'initialize', cmd: 'initialize' },
		{ from: 'INIT',  to: 'ORBIT', label: 'launch',     cmd: 'launch' },
		{ from: 'ORBIT', to: 'RUN',   label: 'start',      cmd: 'start' },
		// reverse track
		{ from: 'RUN',   to: 'ORBIT', label: 'stop',       cmd: 'stop',  cpx: 430, cpy: 6, labelOffY: -14 },
		{ from: 'ORBIT', to: 'INIT',  label: 'land',       cmd: 'land',  cpx: 285, cpy: 6, labelOffY: -14 },
		// reconfigure self-loop
		{ from: 'ORBIT', to: 'ORBIT', label: 'reconfigure', cmd: 'reconfigure', cpx: 360, cpy: -12, labelOffY: -18 },
		// error / safe transitions
		{ from: 'INIT',  to: 'ERROR', label: 'failure', cmd: '',  labelOffX: -20 },
		{ from: 'ORBIT', to: 'SAFE',  label: 'interrupt', cmd: 'interrupt', labelOffX: 8 },
		{ from: 'ERROR', to: 'INIT',  label: 'recover', cmd: 'recover', cpx: 160, cpy: 102, labelOffX: -30 },
		{ from: 'SAFE',  to: 'INIT',  label: 'recover', cmd: 'recover', cpx: 285, cpy: 102, labelOffX: -8 },
	];

	function nodeCenter(id: string): { x: number; y: number } {
		const n = nodes.find(n => n.id === id);
		if (!n) return { x: 0, y: 0 };
		return { x: n.x + nodeW / 2, y: n.y + nodeH / 2 };
	}

	// Build SVG path for an arrow
	function arrowPath(a: Arrow): string {
		const { x: x1, y: y1 } = nodeCenter(a.from);
		const { x: x2, y: y2 } = nodeCenter(a.to);

		if (a.from === a.to) {
			// Self-loop (reconfigure)
			const bx = x1;
			return `M ${bx - 18} ${y1 - nodeH / 2 + 2} C ${bx - 30} ${y1 - 50} ${bx + 30} ${y1 - 50} ${bx + 18} ${y1 - nodeH / 2 + 2}`;
		}
		if (a.cpx !== undefined && a.cpy !== undefined) {
			// Quadratic bezier for reversed arrows (go above the nodes)
			return `M ${x1} ${y1 - nodeH / 2} Q ${a.cpx} ${a.cpy} ${x2} ${y2 - nodeH / 2}`;
		}
		// Straight line between node edges
		const dx = x2 - x1;
		const dy = y2 - y1;
		const len = Math.sqrt(dx * dx + dy * dy);
		const ux = dx / len;
		const uy = dy / len;
		const hw = nodeW / 2 + 2;
		const hh = nodeH / 2 + 2;
		// Clip to node boundary
		const t1 = Math.min(Math.abs(hw / ux), Math.abs(hh / uy));
		const t2 = Math.min(Math.abs(hw / ux), Math.abs(hh / uy));
		const sx = x1 + ux * t1;
		const sy = y1 + uy * t1;
		const ex = x2 - ux * t2;
		const ey = y2 - uy * t2;
		return `M ${sx} ${sy} L ${ex} ${ey}`;
	}

	// Label position midpoint along path
	function arrowLabelPos(a: Arrow): { x: number; y: number } {
		const { x: x1, y: y1 } = nodeCenter(a.from);
		const { x: x2, y: y2 } = nodeCenter(a.to);
		let x: number, y: number;
		if (a.from === a.to) {
			x = x1;
			y = y1 - nodeH / 2 - 28;
		} else if (a.cpx !== undefined && a.cpy !== undefined) {
			// midpoint of quadratic bezier at t=0.5
			x = 0.25 * x1 + 0.5 * a.cpx + 0.25 * x2;
			y = 0.25 * (y1 - nodeH / 2) + 0.5 * a.cpy + 0.25 * (y2 - nodeH / 2);
		} else {
			x = (x1 + x2) / 2;
			y = (y1 + y2) / 2;
		}
		return { x: x + (a.labelOffX ?? 0), y: y + (a.labelOffY ?? 0) };
	}

	function isArrowActive(a: Arrow): boolean {
		// Glow the arrow whose cmd matches the current transition
		if (!isTransitioning) return false;
		const transitionToCmdMap: Record<string, string> = {
			initializing: 'initialize', launching: 'launch', landing: 'land',
			starting: 'start', stopping: 'stop', reconfiguring: 'reconfigure',
			interrupting: 'interrupt'
		};
		return transitionToCmdMap[state] === a.cmd;
	}

	// Use onTransition to trigger commands only for valid cmd arrows
	function handleArrowClick(a: Arrow) {
		if (a.cmd && onTransition) onTransition(a.cmd);
	}
</script>

<svg
	viewBox="-10 -30 600 230"
	class="w-full select-none"
	xmlns="http://www.w3.org/2000/svg"
>
	<defs>
		<!-- Arrow head markers -->
		<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
			<polygon points="0 0, 8 3, 0 6" fill="#4b5563" />
		</marker>
		<marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
			<polygon points="0 0, 8 3, 0 6" fill="#7c6af7" />
		</marker>
		{#each nodes as n}
			{#if isActive(n.id)}
				<filter id="glow-{n.id}">
					<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			{/if}
		{/each}
	</defs>

	<!-- Arrows — drawn behind nodes -->
	{#each arrows as a}
		{@const active = isArrowActive(a)}
		<g
			class={a.cmd && onTransition ? 'cursor-pointer' : ''}
			role="button"
			tabindex="0"
			aria-label={a.cmd ? `Send ${a.cmd} command` : a.label}
			onclick={() => handleArrowClick(a)}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleArrowClick(a); }}
		>
			<path
				d={arrowPath(a)}
				fill="none"
				stroke={active ? '#7c6af7' : '#2d2d4a'}
				stroke-width={active ? 2 : 1.5}
				stroke-dasharray={a.cmd === '' ? '4,3' : undefined}
				marker-end={a.from === a.to ? undefined : (active ? 'url(#arrowhead-active)' : 'url(#arrowhead)')}
				class="transition-all duration-300"
			/>
			{#if a.from === a.to}
				<!-- Self loop: draw arrowhead manually at end -->
				<polygon
					points="0 0, 8 3, 0 6"
					transform={`translate(${nodeCenter(a.from).x + 16}, ${nodeCenter(a.from).y - nodeH / 2 - 2}) rotate(-30)`}
					fill={active ? '#7c6af7' : '#2d2d4a'}
				/>
			{/if}
			<!-- Arrow label -->
			<text
				x={arrowLabelPos(a).x}
				y={arrowLabelPos(a).y}
				text-anchor="middle"
				dominant-baseline="middle"
				font-size="8"
				fill={active ? '#a89ef7' : '#4b5563'}
				class="transition-colors duration-300 pointer-events-none font-mono"
			>{a.label}</text>
		</g>
	{/each}

	<!-- State nodes -->
	{#each nodes as n}
		{@const active = isActive(n.id)}
		{@const color = nodeColor(n.id)}
		<g class="cursor-default">
			<!-- Outer glow ring for active state -->
			{#if active}
				<rect
					x={n.x - 4}
					y={n.y - 4}
					width={nodeW + 8}
					height={nodeH + 8}
					rx={rx + 3}
					fill="none"
					stroke={color}
					stroke-width="1.5"
					opacity="0.35"
					class={isTransitioning ? 'animate-pulse' : ''}
					filter={`url(#glow-${n.id})`}
				/>
				<rect
					x={n.x - 2}
					y={n.y - 2}
					width={nodeW + 4}
					height={nodeH + 4}
					rx={rx + 1}
					fill="none"
					stroke={color}
					stroke-width="1"
					opacity="0.6"
				/>
			{/if}
			<!-- Node background -->
			<rect
				x={n.x}
				y={n.y}
				width={nodeW}
				height={nodeH}
				rx={rx}
				fill={active ? `${color}1a` : '#0d0d1a'}
				stroke={active ? color : '#2d2d4a'}
				stroke-width={active ? 1.5 : 1}
				class="transition-all duration-300"
			/>
			<!-- State label -->
			<text
				x={n.x + nodeW / 2}
				y={n.y + 15}
				text-anchor="middle"
				dominant-baseline="middle"
				font-size="11"
				font-weight="600"
				font-family="monospace"
				fill={active ? color : '#6b7280'}
				class="transition-colors duration-300"
			>{n.label}</text>
			<!-- Sub-label -->
			<text
				x={n.x + nodeW / 2}
				y={n.y + 31}
				text-anchor="middle"
				dominant-baseline="middle"
				font-size="7.5"
				fill={active ? `${color}99` : '#374151'}
				class="transition-colors duration-300"
			>{n.subLabel}</text>
			<!-- Animated pulse dot for active transitional -->
			{#if active && isTransitioning}
				<circle
					cx={n.x + nodeW - 10}
					cy={n.y + 10}
					r="3"
					fill={color}
					class="animate-ping"
					opacity="0.8"
				/>
			{/if}
		</g>
	{/each}
</svg>
