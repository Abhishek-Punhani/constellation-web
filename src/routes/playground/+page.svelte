<script lang="ts">
	import { satellites } from '$lib/store';
	import {
		ConnectionMode,
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		type Connection,
		type Edge,
		type Node,
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import {
		Plus,
		Play,
		Save,
		Trash2,
		HelpCircle,
		ChevronDown,
		Zap,
		Activity,
		AlertTriangle,
		CheckCircle2,
		Link2,
		Unplug,
		RefreshCw,
		Settings2,
		PanelRight,
		X,
	} from 'lucide-svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { NODE_TEMPLATES } from '$lib/playground-templates';
	import {
		availableMetricNames,
		availableMetricUnits,
		clearPlaygroundDraft,
		createDemoGraph,
		createPlaygroundEdge,
		createPlaygroundNode,
		evaluatePlayground,
		getActionCommands,
		getKindFromTemplate,
		loadPlaygroundDraft,
		savePlaygroundDraft,
		stylePlaygroundEdges,
		stylePlaygroundNodes,
		updateNodeData,
		validateConnection,
		validatePlayground,
		type PlaygroundEdge,
		type PlaygroundNode,
		type PlaygroundNodeData,
		type SatelliteStateNodeData,
		type MetricValueNodeData,
		type ThresholdNodeData,
		type LogicNodeData,
		type ActionNodeData,
		type AlertNodeData,
		type InputMode,
		type LogicMode,
		type ThresholdComparator,
	} from '$lib/playground';
	import type { SatelliteState } from '$lib/types';

	const STATE_OPTIONS: SatelliteState[] = ['NEW', 'INIT', 'ORBIT', 'RUN', 'SAFE', 'ERROR', 'DEAD'];
	const THRESHOLD_OPERATORS: ThresholdComparator[] = ['>', '>=', '<', '<=', '==', '!='];
	const LOGIC_MODES: LogicMode[] = ['AND', 'OR'];
	const INPUT_MODES: InputMode[] = ['ALL', 'ANY'];
	const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
	const STATE_COLOR: Record<string, string> = {
		NEW: '#6b7280',
		INIT: '#3b82f6',
		ORBIT: '#06b6d4',
		RUN: '#10b981',
		SAFE: '#f59e0b',
		ERROR: '#ef4444',
		DEAD: '#9ca3af',
	};

	let isMobile = $state(browser ? window.innerWidth < 768 : false);
	let hydrated = $state(false);
	let running = $state(false);
	let evalLog = $state<{ text: string; ok: boolean; nodeId?: string }[]>([]);
	let saveState = $state<'idle' | 'saved'>('idle');
	let selectedSatId = $state('');
	let graphNodes = $state<PlaygroundNode[]>([]);
	let graphEdges = $state<PlaygroundEdge[]>([]);
	let flowNodes = $state<PlaygroundNode[]>([]);
	let selectedNodeId = $state<string | null>(null);
	let selectedEdgeId = $state<string | null>(null);
	let inspectorOpen = $state(true);

	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let runTimer: ReturnType<typeof setInterval> | null = null;

	const selectedSat = $derived($satellites.find((sat) => sat.id === selectedSatId) ?? $satellites[0] ?? null);
	const satMetrics = $derived(
		selectedSat?.metrics.map((metric) => ({
			name: metric.name,
			value: metric.points.at(-1)?.value?.toFixed(1) ?? '—',
			unit: metric.unit ?? '',
		})) ?? []
	);
	const validation = $derived(validatePlayground(graphNodes, graphEdges));
	const displayEdges = $derived(stylePlaygroundEdges(graphEdges, graphNodes, selectedEdgeId, validation));
	const selectedNode = $derived(graphNodes.find((node) => node.id === selectedNodeId) ?? null);
	const selectedEdge = $derived(displayEdges.find((edge) => edge.id === selectedEdgeId) ?? null);
	const hasSelection = $derived(Boolean(selectedNodeId || selectedEdgeId));
	const inspectorButtonLabel = $derived(
		selectedNode ? 'Edit selected node' : selectedEdge ? 'Edit selected edge' : 'Open inspector'
	);
	const metricNames = $derived(availableMetricNames(selectedSat));
	const metricUnits = $derived(availableMetricUnits(selectedSat));
	const selectedNodeIssues = $derived(
		selectedNodeId ? validation.issues.filter((issue) => issue.targetId === selectedNodeId || issue.targetType === 'graph') : []
	);

	$effect(() => {
		graphNodes;
		selectedNodeId;
		selectedSat;
		validation;
		flowNodes = stylePlaygroundNodes(graphNodes, selectedNodeId, validation, selectedSat);
	});

	$effect(() => {
		if (!graphNodes.length || graphNodes.length !== flowNodes.length) return;
		let changed = false;
		const nextNodes = graphNodes.map((node) => {
			const rendered = flowNodes.find((entry) => entry.id === node.id);
			if (!rendered) return node;
			if (rendered.position.x !== node.position.x || rendered.position.y !== node.position.y) {
				changed = true;
				return { ...node, position: rendered.position };
			}
			return node;
		});
		if (changed) graphNodes = nextNodes;
	});

	$effect(() => {
		if (!browser || !hydrated) return;
		savePlaygroundDraft({
			version: 1,
			selectedSatId: selectedSatId || selectedSat?.id || '',
			nodes: graphNodes,
			edges: graphEdges,
		});
	});

	onMount(() => {
		function handleResize() {
			isMobile = window.innerWidth < 768;
		}

		function handleKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
			if (typing) return;
			if (event.key === 'Delete' || event.key === 'Backspace') {
				if (selectedEdgeId) {
					event.preventDefault();
					deleteSelectedEdge();
				} else if (selectedNodeId) {
					event.preventDefault();
					deleteSelectedNode();
				}
			}
		}

		if (browser) {
			const params = new URLSearchParams(window.location.search);
			const forceFull = params.get('full') === '1' || params.get('full') === 'true';
			if (window.innerWidth < 768 && !forceFull) goto('/playground/mobile');
			window.addEventListener('resize', handleResize);
			window.addEventListener('keydown', handleKeyDown);
			if (forceFull) {
				const url = new URL(window.location.href);
				url.searchParams.delete('full');
				history.replaceState(null, '', url.toString());
			}
		}

		const draft = browser ? loadPlaygroundDraft() : null;
		if (draft?.nodes?.length) {
			selectedSatId = draft.selectedSatId || $satellites[0]?.id || '';
			graphNodes = draft.nodes;
			graphEdges = draft.edges;
		} else {
			selectedSatId = $satellites[0]?.id ?? '';
			if ($satellites.length > 0) {
				const demo = createDemoGraph();
				graphNodes = demo.nodes;
				graphEdges = demo.edges;
			} else {
				graphNodes = [];
				graphEdges = [];
			}
		}
		hydrated = true;

		return () => {
			if (browser) {
				window.removeEventListener('resize', handleResize);
				window.removeEventListener('keydown', handleKeyDown);
			}
			if (runTimer) clearInterval(runTimer);
			if (saveTimer) clearTimeout(saveTimer);
		};
	});

	function addNode(template: (typeof NODE_TEMPLATES)[number]) {
		const kind = getKindFromTemplate(template.type);
		const offset = graphNodes.length * 22;
		graphNodes = [
			...graphNodes,
			createPlaygroundNode(kind, {
				x: 150 + (offset % 280),
				y: 120 + ((offset * 3) % 220),
			}),
		];
	}

	function handleConnect(connection: Connection) {
		if (!validateConnection(connection, graphNodes, graphEdges)) return;
		const nextEdge = createPlaygroundEdge(connection.source!, connection.target!);
		graphEdges = [...graphEdges, nextEdge];
		selectedEdgeId = nextEdge.id;
		selectedNodeId = null;
	}

	function handleNodeClick(node: PlaygroundNode, event?: MouseEvent | TouchEvent) {
		selectedNodeId = node.id;
		selectedEdgeId = null;
		if (event instanceof MouseEvent && event.detail >= 2) {
			inspectorOpen = true;
		}
	}

	function handleEdgeClick(edge: PlaygroundEdge, event?: MouseEvent) {
		selectedEdgeId = edge.id;
		selectedNodeId = null;
		if (event && event.detail >= 2) {
			inspectorOpen = true;
		}
	}

	function handleSelectionChange({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
		if (nodes.length > 0) {
			selectedNodeId = (nodes[0] as PlaygroundNode).id;
			selectedEdgeId = null;
		} else if (edges.length > 0) {
			selectedEdgeId = (edges[0] as PlaygroundEdge).id;
			selectedNodeId = null;
		}
	}

	function handlePaneClick() {
		selectedNodeId = null;
		selectedEdgeId = null;
	}

	function deleteSelectedNode() {
		const nodeId = selectedNode?.id ?? selectedNodeId;
		if (!nodeId) return;
		graphNodes = graphNodes.filter((node) => node.id !== nodeId);
		graphEdges = graphEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
		selectedNodeId = null;
		selectedEdgeId = null;
	}

	function deleteSelectedEdge() {
		const edgeId = selectedEdge?.id ?? selectedEdgeId;
		if (!edgeId) return;
		graphEdges = graphEdges.filter((edge) => edge.id !== edgeId);
		selectedEdgeId = null;
		selectedNodeId = null;
	}

	function clearPlayground() {
		graphNodes = [];
		graphEdges = [];
		flowNodes = [];
		selectedNodeId = null;
		selectedEdgeId = null;
		inspectorOpen = true;
		evalLog = [];
		clearPlaygroundDraft();
	}

	function resetDemoGraph() {
		const demo = createDemoGraph();
		graphNodes = demo.nodes;
		graphEdges = demo.edges;
		selectedNodeId = null;
		selectedEdgeId = null;
		inspectorOpen = true;
		evalLog = [];
	}

	function closeInspector() {
		inspectorOpen = false;
	}

	function openInspector() {
		inspectorOpen = true;
	}

	function saveDraftNow() {
		savePlaygroundDraft({
			version: 1,
			selectedSatId: selectedSatId || selectedSat?.id || '',
			nodes: graphNodes,
			edges: graphEdges,
		});
		saveState = 'saved';
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveState = 'idle';
		}, 1400);
	}

	function runPlayground() {
		if (!selectedSat || running) return;
		if (runTimer) clearInterval(runTimer);
		const lines = evaluatePlayground(graphNodes, graphEdges, selectedSat);
		running = true;
		evalLog = [];
		let index = 0;
		runTimer = setInterval(() => {
			if (index < lines.length) {
				evalLog = [...evalLog, lines[index++]];
				return;
			}
			if (runTimer) clearInterval(runTimer);
			running = false;
		}, 300);
	}

	function updateSelectedNodeValue(patch: Partial<PlaygroundNodeData>) {
		if (!selectedNodeId) return;
		graphNodes = updateNodeData(graphNodes, selectedNodeId, patch);
	}

	async function startTour() {
		const driverModule = await import('driver.js');
		await import('driver.js/dist/driver.css');
		const driverFn = driverModule.driver ?? (driverModule as any).default ?? driverModule;
		driverFn({
			showProgress: true,
			steps: [
				{
					element: '#pg-context',
					popover: {
						title: '🛰 Satellite Context',
						description: 'Rules evaluate against the selected satellite. Metric nodes and state conditions read from this live context.',
					},
				},
				{
					element: '#pg-palette',
					popover: {
						title: '🧩 Node Palette',
						description: 'Add condition, logic, action, and alert nodes here. Then connect them on the canvas.',
					},
				},
				{
					element: '#pg-canvas',
					popover: {
						title: '🖱 Graph Canvas',
						description: 'Drag nodes, connect outputs to inputs, click nodes or edges to edit or delete them, and use validation feedback in the inspector.',
					},
				},
				{
					element: '#pg-inspector',
					popover: {
						title: '🛠 Inspector',
						description: 'Edit node conditions, commands, alert text, and review validation issues before running.',
					},
				},
			],
		}).drive();
	}
</script>

<div class="flex flex-col h-full">
	{#if isMobile}
		<div class="px-4 pt-3 pb-3 border-b border-border bg-bg-secondary shrink-0 space-y-2">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h1 class="text-lg font-semibold text-white">Condition Playground</h1>
					<p class="text-xs text-gray-500 mt-0.5">Full editor is available on larger screens</p>
				</div>
				<div class="flex items-center gap-2">
					<button class="btn-ghost p-2 rounded" onclick={startTour} title="Tour"><HelpCircle size={14} /></button>
					<button class="btn-primary px-3 py-1 text-xs" onclick={() => goto('/playground/mobile')}>Mobile View</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="px-5 pt-4 pb-3 border-b border-border bg-bg-secondary shrink-0 space-y-3">
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<div>
				<h1 class="text-lg font-semibold text-white">Condition Playground</h1>
				<p class="text-xs text-gray-500 mt-0.5">
					Build validated automation rules with editable conditions, live graph execution, and draft persistence.
				</p>
			</div>
			<div class="flex items-center gap-2 flex-wrap">
				<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={startTour} title="Take a tour">
					<HelpCircle size={13} /> Tour
				</button>
				<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={resetDemoGraph}>
					<RefreshCw size={12} /> Reset Demo
				</button>
				<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={clearPlayground}>
					<Trash2 size={12} /> Clear
				</button>
				<button class="btn-ghost text-xs flex items-center gap-1.5" onclick={saveDraftNow}>
					<Save size={12} /> {saveState === 'saved' ? 'Saved' : 'Save'}
				</button>
				<button
					id="pg-run"
					class="btn-primary text-xs flex items-center gap-1.5"
					class:opacity-60={running || !validation.isValid}
					onclick={runPlayground}
					disabled={running || !selectedSat || !validation.isValid}
				>
					<Play size={12} /> {running ? 'Running…' : 'Run'}
				</button>
				<NotificationCenter />
			</div>
		</div>

		<div id="pg-context" class="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary border border-border flex-wrap">
			<span class="text-[0.65rem] text-gray-500 uppercase tracking-wider shrink-0">Rule applies to</span>
			<div class="relative">
				<select
					class="appearance-none bg-bg-elevated border border-border-bright text-white text-xs font-mono rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
					bind:value={selectedSatId}
				>
					{#each $satellites as s}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>
				<ChevronDown size={12} class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
			</div>

			{#if selectedSat}
				<div class="flex items-center gap-1.5 ml-1">
					<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:{STATE_COLOR[selectedSat.state] ?? '#6b7280'}"></span>
					<span class="text-xs font-mono" style="color:{STATE_COLOR[selectedSat.state] ?? '#6b7280'}">{selectedSat.state}</span>
				</div>
				<span class="text-gray-700">·</span>
				<span class="text-[0.65rem] text-gray-500 font-mono">{selectedSat.host}:{selectedSat.port}</span>
				<span class="text-gray-700">·</span>
				<div class="flex items-center gap-3 ml-1 overflow-x-auto">
					{#each satMetrics.slice(0, 4) as m}
						<div class="flex items-center gap-1 shrink-0">
							<Activity size={10} class="text-gray-600" />
							<span class="text-[0.65rem] font-mono text-gray-400">{m.name}</span>
							<span class="text-[0.65rem] font-mono text-white">{m.value}{m.unit}</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="ml-auto flex items-center gap-2 text-[0.65rem] text-gray-600 shrink-0 flex-wrap">
				<span class="flex items-center gap-1"><Zap size={10} /> {graphNodes.length} nodes</span>
				<span>·</span>
				<span>{graphEdges.length} edges</span>
				<span>·</span>
				<span class={validation.isValid ? 'text-green-400' : 'text-red-400'}>
					{validation.isValid ? 'graph valid' : `${validation.issues.filter((issue) => issue.level === 'error').length} error(s)`}
				</span>
			</div>
		</div>

		<div id="pg-palette" class="flex gap-2 flex-wrap">
			{#each NODE_TEMPLATES as tmpl}
				<button
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all hover:brightness-125"
					style="border-color:{tmpl.color}44; background:{tmpl.color}0f; color:{tmpl.color};"
					onclick={() => addNode(tmpl)}
					title={tmpl.desc}
				>
					<Plus size={11} />
					{tmpl.emoji} {tmpl.type}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-1 overflow-hidden min-h-0">
		<div id="pg-canvas" class="relative flex-1 min-w-0">
			<SvelteFlow
				bind:nodes={flowNodes}
				edges={displayEdges}
				fitView
				fitViewOptions={{ padding: 0.28, maxZoom: 0.9 }}
				connectionMode={ConnectionMode.Loose}
				connectionRadius={40}
				clickConnect
				class="bg-bg-primary"
				style="--xy-background-color: #0a0a0f; --xy-node-background-color: #13131f;"
				deleteKey={null}
				onconnect={handleConnect}
				onnodeclick={({ node, event }) => handleNodeClick(node as PlaygroundNode, event)}
				onedgeclick={({ edge, event }) => handleEdgeClick(edge as PlaygroundEdge, event)}
				onselectionchange={handleSelectionChange}
				onpaneclick={handlePaneClick}
				isValidConnection={(connection) => validateConnection(connection, graphNodes, graphEdges)}
			>
				<Controls style="background:#13131f; border-color:#1e1e30;" />
				<Background bgColor="#0a0a0f" patternColor="#1a1a2e" gap={28} />
				<MiniMap style="background:#0f0f1a; border:1px solid #1e1e30;" nodeColor="#7c6af7" />
			</SvelteFlow>

			{#if !inspectorOpen}
				<button
					class="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-gray-300 shadow-lg transition-colors hover:border-border-bright hover:text-white"
					onclick={openInspector}
					aria-label="Open inspector"
				>
					<PanelRight size={14} class="text-accent" />
					{inspectorButtonLabel}
					{#if hasSelection}
						<span class="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[0.6rem] text-accent">selection</span>
					{/if}
				</button>
			{/if}
		</div>

		{#if inspectorOpen}
		<div id="pg-inspector" class="w-100 max-w-[40vw] min-w-[20rem] border-l border-border bg-bg-secondary shrink-0 overflow-y-auto">
			<div class="p-4 border-b border-border">
				<div class="mb-1 flex items-center justify-between gap-3">
					<div class="flex items-center gap-2">
						<PanelRight size={14} class="text-accent" />
						<h2 class="text-sm font-semibold text-white">Inspector</h2>
					</div>
					<button class="btn-ghost flex items-center gap-1 text-xs" onclick={closeInspector} aria-label="Close inspector">
						<X size={12} /> Close
					</button>
				</div>
				<p class="text-xs text-gray-500">
					Select a node or edge, then double-click it to open editing here. Press <span class="font-mono text-gray-400">Delete</span> to remove the current selection.
				</p>
			</div>

			<div class="p-4 space-y-4">
				{#if selectedNode}
					<div class="space-y-4">
						<div class="rounded-lg border border-border bg-bg-primary p-3">
							<div class="flex items-center justify-between gap-3">
								<div>
									<div class="text-sm font-semibold" style="color:{selectedNode.data.color}">{selectedNode.data.emoji} {selectedNode.data.title}</div>
									<div class="text-[0.7rem] text-gray-500 mt-0.5">{selectedNode.id}</div>
								</div>
								<button class="btn-ghost text-xs flex items-center gap-1" onclick={deleteSelectedNode}>
									<Trash2 size={12} /> Delete node
								</button>
							</div>
						</div>

						<div class="rounded-lg border border-border bg-bg-primary p-3 space-y-3">
							<div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Display</div>
							<div>
								<label for="playground-node-title" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Title</label>
								<input
									id="playground-node-title"
									class="input w-full"
									type="text"
									value={selectedNode.data.title}
									oninput={(e) => updateSelectedNodeValue({ title: e.currentTarget.value })}
								/>
							</div>
							<div class="grid grid-cols-[5rem_1fr] gap-3 items-end">
								<div>
									<label for="playground-node-emoji" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Emoji</label>
									<input
										id="playground-node-emoji"
										class="input w-full text-center"
										type="text"
										maxlength="2"
										value={selectedNode.data.emoji}
										oninput={(e) => updateSelectedNodeValue({ emoji: e.currentTarget.value || '•' })}
									/>
								</div>
								<div>
									<label for="playground-node-color" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Accent color</label>
									<input
										id="playground-node-color"
										class="h-10 w-full cursor-pointer rounded border border-border bg-transparent px-1"
										type="color"
										value={selectedNode.data.color}
										oninput={(e) => updateSelectedNodeValue({ color: e.currentTarget.value })}
									/>
								</div>
							</div>
							<div>
								<label for="playground-node-description" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Notes</label>
								<textarea
									id="playground-node-description"
									class="input w-full min-h-20"
									value={selectedNode.data.description}
									oninput={(e) => updateSelectedNodeValue({ description: e.currentTarget.value })}
								></textarea>
							</div>
						</div>

						{#if selectedNode.data.kind === 'satellite-state'}
							{@const data = selectedNode.data as SatelliteStateNodeData}
							<div class="space-y-3">
								<div>
									<label for="playground-state-comparator" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Comparator</label>
									<select id="playground-state-comparator" class="input w-full" value={data.stateComparator} onchange={(e) => updateSelectedNodeValue({ stateComparator: e.currentTarget.value })}>
										<option value="is">State is</option>
										<option value="is-not">State is not</option>
									</select>
								</div>
								<div>
									<label for="playground-expected-state" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Expected state</label>
									<select id="playground-expected-state" class="input w-full" value={data.expectedState} onchange={(e) => updateSelectedNodeValue({ expectedState: e.currentTarget.value })}>
										{#each STATE_OPTIONS as option}
											<option value={option}>{option}</option>
										{/each}
									</select>
								</div>
							</div>
						{:else if selectedNode.data.kind === 'metric-value'}
							{@const data = selectedNode.data as MetricValueNodeData}
							<div>
								<label for="playground-metric-name" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Metric</label>
								<select id="playground-metric-name" class="input w-full" value={data.metricName} onchange={(e) => updateSelectedNodeValue({ metricName: e.currentTarget.value })}>
									{#each metricNames as metricName}
										<option value={metricName}>{metricName}</option>
									{/each}
								</select>
								<p class="text-[0.7rem] text-gray-500 mt-1">Current unit: {metricUnits[data.metricName] ?? '—'}</p>
							</div>
						{:else if selectedNode.data.kind === 'threshold'}
							{@const data = selectedNode.data as ThresholdNodeData}
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label for="playground-threshold-operator" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Operator</label>
									<select id="playground-threshold-operator" class="input w-full" value={data.comparator} onchange={(e) => updateSelectedNodeValue({ comparator: e.currentTarget.value })}>
										{#each THRESHOLD_OPERATORS as operator}
											<option value={operator}>{operator}</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="playground-threshold-value" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Value</label>
									<input id="playground-threshold-value" class="input w-full" type="number" value={data.threshold} oninput={(e) => updateSelectedNodeValue({ threshold: Number(e.currentTarget.value) })} />
								</div>
							</div>
						{:else if selectedNode.data.kind === 'logic'}
							{@const data = selectedNode.data as LogicNodeData}
							<div>
								<label for="playground-logic-mode" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Logic mode</label>
								<select id="playground-logic-mode" class="input w-full" value={data.mode} onchange={(e) => updateSelectedNodeValue({ mode: e.currentTarget.value })}>
									{#each LOGIC_MODES as mode}
										<option value={mode}>{mode}</option>
									{/each}
								</select>
							</div>
						{:else if selectedNode.data.kind === 'action'}
							{@const data = selectedNode.data as ActionNodeData}
							<div class="space-y-3">
								<div>
									<label for="playground-action-command" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Command</label>
									<select id="playground-action-command" class="input w-full" value={data.command} onchange={(e) => updateSelectedNodeValue({ command: e.currentTarget.value })}>
										{#each getActionCommands() as command}
											<option value={command}>{command}</option>
										{/each}
									</select>
								</div>
								<div class="grid grid-cols-2 gap-3">
									<div>
										<label for="playground-action-target" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Target</label>
										<select id="playground-action-target" class="input w-full" value={data.target} onchange={(e) => updateSelectedNodeValue({ target: e.currentTarget.value })}>
											<option value="selected">Selected satellite</option>
											<option value="all">All satellites</option>
										</select>
									</div>
									<div>
										<label for="playground-action-input-mode" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Input policy</label>
										<select id="playground-action-input-mode" class="input w-full" value={data.inputMode} onchange={(e) => updateSelectedNodeValue({ inputMode: e.currentTarget.value })}>
											{#each INPUT_MODES as mode}
												<option value={mode}>{mode}</option>
											{/each}
										</select>
									</div>
								</div>
							</div>
						{:else if selectedNode.data.kind === 'alert'}
							{@const data = selectedNode.data as AlertNodeData}
							<div class="space-y-3">
								<div>
									<label for="playground-alert-severity" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Severity</label>
									<select id="playground-alert-severity" class="input w-full" value={data.severity} onchange={(e) => updateSelectedNodeValue({ severity: e.currentTarget.value })}>
										{#each ALERT_SEVERITIES as severity}
											<option value={severity}>{severity}</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="playground-alert-message" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Message</label>
									<textarea id="playground-alert-message" class="input w-full min-h-24" value={data.message} oninput={(e) => updateSelectedNodeValue({ message: e.currentTarget.value })}></textarea>
								</div>
								<div>
									<label for="playground-alert-input-mode" class="text-[0.65rem] text-gray-500 uppercase tracking-wider block mb-1">Input policy</label>
									<select id="playground-alert-input-mode" class="input w-full" value={data.inputMode} onchange={(e) => updateSelectedNodeValue({ inputMode: e.currentTarget.value })}>
										{#each INPUT_MODES as mode}
											<option value={mode}>{mode}</option>
										{/each}
									</select>
								</div>
							</div>
						{/if}

						<div class="rounded-lg border border-border bg-bg-primary p-3">
							<div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2">Validation</div>
							{#if selectedNodeIssues.length > 0}
								<div class="space-y-2">
									{#each selectedNodeIssues as issue}
										<div class="text-xs rounded border px-2 py-1.5 {issue.level === 'error' ? 'border-red-900/40 text-red-300 bg-red-950/20' : 'border-amber-900/40 text-amber-300 bg-amber-950/20'}">
											{issue.message}
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle2 size={12} /> Node configuration looks good.</div>
							{/if}
						</div>
					</div>
				{:else if selectedEdge}
					<div class="space-y-4">
						<div class="rounded-lg border border-border bg-bg-primary p-3">
							<div class="flex items-center justify-between gap-2">
								<div>
									<div class="text-sm font-semibold text-white flex items-center gap-2"><Link2 size={14} class="text-accent" /> Edge</div>
									<div class="text-[0.7rem] text-gray-500 mt-0.5">{selectedEdge.source} → {selectedEdge.target}</div>
								</div>
								<button class="btn-ghost text-xs flex items-center gap-1" onclick={deleteSelectedEdge}>
									<Unplug size={12} /> Delete edge
								</button>
							</div>
						</div>
						<div class="text-xs text-gray-500">Connection validity is checked automatically when new edges are created.</div>
					</div>
				{:else}
					<div class="space-y-4">
						<div class="rounded-lg border border-border bg-bg-primary p-3">
							<div class="text-sm font-semibold text-white mb-1">Graph Summary</div>
							<div class="text-xs text-gray-500 leading-5">
								{graphNodes.length} node(s), {graphEdges.length} edge(s), {validation.issues.length} issue(s) total.
							</div>
							<div class="mt-3 text-xs {validation.isValid ? 'text-green-400' : 'text-red-300'} flex items-center gap-1.5">
								{#if validation.isValid}
									<CheckCircle2 size={12} /> Graph is runnable.
								{:else}
									<AlertTriangle size={12} /> Fix validation errors before running.
								{/if}
							</div>
						</div>

						<div class="rounded-lg border border-border bg-bg-primary p-3">
							<div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Settings2 size={11} /> Validation Issues</div>
							{#if validation.issues.length > 0}
								<div class="space-y-2 max-h-64 overflow-y-auto">
									{#each validation.issues as issue}
										<div class="text-xs rounded border px-2 py-1.5 {issue.level === 'error' ? 'border-red-900/40 text-red-300 bg-red-950/20' : 'border-amber-900/40 text-amber-300 bg-amber-950/20'}">
											{issue.message}
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-xs text-green-400">No validation issues. The graph is ready to run.</div>
							{/if}
						</div>
					</div>
				{/if}

				<div class="rounded-lg border border-border bg-bg-primary p-3">
					<div class="flex items-center gap-2 mb-3">
						<span class="text-xs font-semibold text-gray-300 uppercase tracking-wider">Evaluation Log</span>
						{#if selectedSat}
							<span class="ml-auto text-[0.6rem] font-mono text-gray-500 border border-border-bright rounded px-1.5 py-0.5">{selectedSat.name}</span>
						{/if}
					</div>
					<div class="space-y-2 max-h-72 overflow-y-auto">
						{#each evalLog as line, i}
							<div class="text-xs font-mono {i === evalLog.length - 1 ? 'text-white' : line.ok ? 'text-gray-300' : 'text-red-300'}">
								{line.text}
							</div>
						{/each}
						{#if running}
							<div class="text-xs text-[#a78bfa] animate-pulse font-mono">Evaluating…</div>
						{:else if evalLog.length === 0}
							<div class="text-xs text-gray-600">Run the graph to stream evaluation output here.</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
		{/if}
	</div>
</div>
