<script lang="ts">
    import { satellites } from '$lib/store';
    import { NODE_TEMPLATES, type NodeTemplate } from '$lib/playground-templates';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    let selectedSatId = $state<string>($satellites[0]?.id ?? '');
    let running = $state(false);
    let evalLog: { text: string; ok: boolean }[] = $state([]);

    function runMobile() {
        const sat = $satellites.find(s => s.id === selectedSatId);
        if (!sat) return;
        running = true;
        evalLog = [];
        const cpu = sat.metrics.find(m => m.name === 'CPU_LOAD')?.points.at(-1)?.value ?? 35.2;
        const below = cpu < 80;
        const msgs = [
            { text: `⚙  Evaluating rule for ${sat.name}…`, ok: true },
            { text: `🛰  ${sat.name} → state: ${sat.state}`, ok: true },
            { text: `📊  CPU_LOAD = ${cpu.toFixed(1)}% — threshold 80% → ${below ? 'BELOW ✗' : 'EXCEEDED ✓'}`, ok: !below },
            { text: below ? '🔀  AND gate: condition NOT met — actions suppressed' : '🔀  AND gate: all conditions met — propagating…', ok: !below },
            { text: below ? '✅  Evaluation complete. No actions triggered.' : `🚨  Action fired: interrupt → ${sat.name}`, ok: true }
        ];
        let i = 0;
        const interval = setInterval(() => {
            if (i < msgs.length) { evalLog = [...evalLog, msgs[i++]]; }
            else { clearInterval(interval); running = false; }
        }, 450);
    }

    function openFull() { goto('/playground?full=1'); }
    function addNodeQuick(t: NodeTemplate) { /* lightweight placeholder: open full playground to add */ openFull(); }

    onMount(() => {});
</script>

<div class="flex flex-col h-full p-3">
    <div class="flex items-center justify-between mb-3">
        <div>
            <h2 class="text-lg font-semibold">Playground (Mobile)</h2>
            <p class="text-xs text-gray-500">Compact editor — tap to open full canvas</p>
        </div>
        <button class="px-3 py-1 rounded bg-bg-elevated" onclick={openFull}>Open Full</button>
    </div>

    <div class="mb-3">
        <select bind:value={selectedSatId} class="w-full bg-bg-primary border border-border text-sm px-2 py-2 rounded">
            {#each $satellites as s}
                <option value={s.id}>{s.name}</option>
            {/each}
        </select>
    </div>

    <div class="mb-3">
        <div class="flex gap-2 overflow-x-auto pb-2">
                {#each NODE_TEMPLATES as t}
                <button class="flex flex-col items-center gap-1 px-3 py-2 rounded bg-bg-card text-xs" onclick={() => addNodeQuick(t)}>
                    <div class="text-sm">{t.emoji}</div>
                    <div class="leading-tight text-[11px] text-gray-300">{t.type}</div>
                </button>
            {/each}
        </div>
    </div>

    <div class="mb-3">
        <button class="w-full py-2 rounded bg-accent text-white" onclick={runMobile} disabled={running}>{running ? 'Running…' : 'Run'}</button>
    </div>

    <div class="flex-1 overflow-y-auto bg-bg-secondary p-2 rounded">
        {#each evalLog as l, i}
            <div class="text-[13px] {i === evalLog.length - 1 ? 'text-white' : 'text-gray-400'}">{l.text}</div>
        {/each}
        {#if evalLog.length === 0}
            <div class="text-gray-600 text-sm">Run the simulation to see evaluation logs.</div>
        {/if}
    </div>
</div>
