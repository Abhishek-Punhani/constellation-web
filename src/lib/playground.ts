import {
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type XYPosition,
} from "@xyflow/svelte";
import type {
  FSMCommand,
  MetricSeries,
  Satellite,
  SatelliteState,
} from "$lib/types";
import { NODE_TEMPLATES } from "$lib/playground-templates";

export type PlaygroundNodeKind =
  | "satellite-state"
  | "metric-value"
  | "threshold"
  | "logic"
  | "action"
  | "alert";

export type ThresholdComparator = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type LogicMode = "AND" | "OR";
export type InputMode = "ALL" | "ANY";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface BasePlaygroundNodeData {
  [key: string]: unknown;
  kind: PlaygroundNodeKind;
  title: string;
  color: string;
  emoji: string;
  description: string;
  label?: string;
}

export interface SatelliteStateNodeData extends BasePlaygroundNodeData {
  kind: "satellite-state";
  expectedState: SatelliteState;
  stateComparator: "is" | "is-not";
}

export interface MetricValueNodeData extends BasePlaygroundNodeData {
  kind: "metric-value";
  metricName: string;
}

export interface ThresholdNodeData extends BasePlaygroundNodeData {
  kind: "threshold";
  comparator: ThresholdComparator;
  threshold: number;
}

export interface LogicNodeData extends BasePlaygroundNodeData {
  kind: "logic";
  mode: LogicMode;
}

export interface ActionNodeData extends BasePlaygroundNodeData {
  kind: "action";
  command: FSMCommand;
  target: "selected" | "all";
  inputMode: InputMode;
}

export interface AlertNodeData extends BasePlaygroundNodeData {
  kind: "alert";
  message: string;
  severity: AlertSeverity;
  inputMode: InputMode;
}

export type PlaygroundNodeData =
  | SatelliteStateNodeData
  | MetricValueNodeData
  | ThresholdNodeData
  | LogicNodeData
  | ActionNodeData
  | AlertNodeData;

export type PlaygroundNode = Node<PlaygroundNodeData>;
export type PlaygroundEdge = Edge;

export interface PlaygroundIssue {
  level: "error" | "warning";
  targetType: "node" | "edge" | "graph";
  targetId?: string;
  message: string;
}

export interface PlaygroundValidationResult {
  issues: PlaygroundIssue[];
  nodeIssueCount: Record<string, number>;
  edgeIssueCount: Record<string, number>;
  isValid: boolean;
}

export interface PlaygroundEvalLine {
  text: string;
  ok: boolean;
  nodeId?: string;
}

interface EvalSignal {
  type: "number" | "boolean";
  value: number | boolean;
  ok: boolean;
  lines: PlaygroundEvalLine[];
}

export interface PlaygroundDraft {
  version: 1;
  selectedSatId: string;
  nodes: PlaygroundNode[];
  edges: PlaygroundEdge[];
}

export const PLAYGROUND_STORAGE_KEY = "constellation-playground-draft-v1";

const NODE_KIND_BY_TEMPLATE: Record<string, PlaygroundNodeKind> = {
  "Satellite State": "satellite-state",
  "Metric Value": "metric-value",
  Threshold: "threshold",
  "AND / OR Logic": "logic",
  Action: "action",
  Alert: "alert",
};

const NODE_META_BY_KIND: Record<
  PlaygroundNodeKind,
  { title: string; color: string; emoji: string; description: string }
> = Object.fromEntries(
  NODE_TEMPLATES.map((template) => {
    const kind = NODE_KIND_BY_TEMPLATE[template.type];
    return [
      kind,
      {
        title: template.type,
        color: template.color,
        emoji: template.emoji,
        description: template.desc,
      },
    ];
  }),
) as Record<
  PlaygroundNodeKind,
  { title: string; color: string; emoji: string; description: string }
>;

const DEFAULT_POSITIONS: Record<PlaygroundNodeKind, XYPosition> = {
  "satellite-state": { x: 60, y: 100 },
  "metric-value": { x: 60, y: 260 },
  threshold: { x: 320, y: 180 },
  logic: { x: 580, y: 180 },
  action: { x: 840, y: 100 },
  alert: { x: 840, y: 260 },
};

const ALLOWED_ACTION_COMMANDS: FSMCommand[] = [
  "initialize",
  "launch",
  "land",
  "start",
  "stop",
  "reconfigure",
  "interrupt",
  "recover",
  "shutdown",
];

const TERMINAL_NODE_KINDS: PlaygroundNodeKind[] = ["action", "alert"];
const BOOLEAN_SOURCE_KINDS: PlaygroundNodeKind[] = [
  "satellite-state",
  "threshold",
  "logic",
];

export function getActionCommands(): FSMCommand[] {
  return [...ALLOWED_ACTION_COMMANDS];
}

export function getKindFromTemplate(type: string): PlaygroundNodeKind {
  return NODE_KIND_BY_TEMPLATE[type] ?? "alert";
}

export function createPlaygroundNode(
  kind: PlaygroundNodeKind,
  position?: XYPosition,
  id?: string,
): PlaygroundNode {
  const meta = NODE_META_BY_KIND[kind];
  const nodeId = id ?? `${kind}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: nodeId,
    type: "default",
    position: position ?? { ...DEFAULT_POSITIONS[kind] },
    data: defaultNodeData(kind, meta),
  };
}

function defaultNodeData(
  kind: PlaygroundNodeKind,
  meta: { title: string; color: string; emoji: string; description: string },
): PlaygroundNodeData {
  switch (kind) {
    case "satellite-state":
      return { ...meta, kind, expectedState: "RUN", stateComparator: "is" };
    case "metric-value":
      return { ...meta, kind, metricName: "CPU_LOAD" };
    case "threshold":
      return { ...meta, kind, comparator: ">=", threshold: 80 };
    case "logic":
      return { ...meta, kind, mode: "AND" };
    case "action":
      return {
        ...meta,
        kind,
        command: "interrupt",
        target: "selected",
        inputMode: "ALL",
      };
    case "alert":
      return {
        ...meta,
        kind,
        message: "High CPU detected",
        severity: "WARNING",
        inputMode: "ALL",
      };
  }
}

export function createDemoGraph(): {
  nodes: PlaygroundNode[];
  edges: PlaygroundEdge[];
} {
  const nodes = [
    createPlaygroundNode("satellite-state", { x: 60, y: 100 }, "sat-state-1"),
    createPlaygroundNode("metric-value", { x: 60, y: 270 }, "metric-1"),
    createPlaygroundNode("threshold", { x: 320, y: 200 }, "threshold-1"),
    createPlaygroundNode("logic", { x: 580, y: 200 }, "logic-1"),
    createPlaygroundNode("action", { x: 840, y: 110 }, "action-1"),
    createPlaygroundNode("alert", { x: 840, y: 290 }, "alert-1"),
  ];
  const edges: PlaygroundEdge[] = [
    createPlaygroundEdge("metric-1", "threshold-1", "e2"),
    createPlaygroundEdge("sat-state-1", "logic-1", "e1"),
    createPlaygroundEdge("threshold-1", "logic-1", "e3"),
    createPlaygroundEdge("logic-1", "action-1", "e4"),
    createPlaygroundEdge("logic-1", "alert-1", "e5"),
  ];
  return { nodes, edges };
}

export function createPlaygroundEdge(
  source: string,
  target: string,
  id?: string,
): PlaygroundEdge {
  return {
    id:
      id ??
      `edge-${source}-${target}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    target,
    animated: true,
    selectable: true,
    interactionWidth: 36,
  };
}

export function getNodeTitle(data: PlaygroundNodeData): string {
  return `${data.emoji} ${data.title}`;
}

export function getNodeSubtitle(
  node: PlaygroundNode,
  selectedSatellite?: Satellite | null,
): string[] {
  const { data } = node;
  switch (data.kind) {
    case "satellite-state":
      return [
        selectedSatellite?.name ?? "selected satellite",
        `${data.stateComparator === "is" ? "State is" : "State is not"} ${data.expectedState}`,
      ];
    case "metric-value": {
      const metric = selectedSatellite?.metrics.find(
        (entry) => entry.name === data.metricName,
      );
      const current = metric?.points.at(-1)?.value;
      return [
        selectedSatellite?.name ?? "selected satellite",
        `${data.metricName}${current !== undefined ? ` = ${current.toFixed(1)} ${metric?.unit ?? ""}` : ""}`.trim(),
      ];
    }
    case "threshold":
      return [`Pass when input ${data.comparator} ${data.threshold}`];
    case "logic":
      return [`${data.mode} gate`, "Combines boolean inputs"];
    case "action":
      return [
        `${data.command} → ${data.target === "all" ? "all satellites" : "selected satellite"}`,
        `Fire when ${data.inputMode} upstream inputs are true`,
      ];
    case "alert":
      return [`${data.severity} alert`, data.message];
    default:
      return [];
  }
}

export function stylePlaygroundNodes(
  nodes: PlaygroundNode[],
  selectedNodeId: string | null,
  validation: PlaygroundValidationResult,
  selectedSatellite?: Satellite | null,
): PlaygroundNode[] {
  return nodes.map((node) => {
    const issueCount = validation.nodeIssueCount[node.id] ?? 0;
    const isSelected = node.id === selectedNodeId;
    const borderColor = issueCount > 0 ? "#ef4444" : node.data.color;
    const shadow = isSelected
      ? `0 0 0 1px ${borderColor}, 0 0 20px ${borderColor}22`
      : `0 0 0 1px ${borderColor}55`;
    const lines = [
      getNodeTitle(node.data),
      ...getNodeSubtitle(node, selectedSatellite),
    ];
    if (issueCount > 0) {
      lines.push(
        `⚠ ${issueCount} validation issue${issueCount === 1 ? "" : "s"}`,
      );
    }
    return {
      ...node,
      data: { ...node.data, label: lines.join("\n") } as PlaygroundNodeData,
      style: [
        "background:#13131f",
        `border:1px solid ${borderColor}`,
        `color:${issueCount > 0 ? "#fca5a5" : node.data.color}`,
        "border-radius:10px",
        "padding:12px",
        "font-size:12px",
        "font-family:monospace",
        "white-space:pre",
        "min-width:200px",
        `box-shadow:${shadow}`,
      ].join(";"),
    };
  });
}

export function stylePlaygroundEdges(
  edges: PlaygroundEdge[],
  nodes: PlaygroundNode[],
  selectedEdgeId: string | null,
  validation: PlaygroundValidationResult,
): PlaygroundEdge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const source = nodeMap.get(edge.source);
    const selected = edge.id === selectedEdgeId;
    const invalid = (validation.edgeIssueCount[edge.id] ?? 0) > 0;
    const color = invalid ? "#ef4444" : (source?.data.color ?? "#7c6af7");
    return {
      ...edge,
      animated: selected || !invalid,
      selectable: true,
      interactionWidth: selected ? 44 : 36,
      zIndex: selected ? 1000 : invalid ? 900 : 10,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: selected ? 22 : 18,
        height: selected ? 22 : 18,
      },
      style: [
        `stroke:${color}`,
        `stroke-width:${selected ? 5 : 2.5}`,
        selected ? "stroke-dasharray: 10 6" : "stroke-dasharray: none",
        selected ? `filter: drop-shadow(0 0 10px ${color})` : "filter: none",
      ].join(";"),
    };
  });
}

export function updateNodeData<T extends PlaygroundNodeData>(
  nodes: PlaygroundNode[],
  nodeId: string,
  patch: Partial<T>,
): PlaygroundNode[] {
  return nodes.map((node) =>
    node.id === nodeId
      ? { ...node, data: { ...node.data, ...patch } as PlaygroundNodeData }
      : node,
  );
}

export function validateConnection(
  connection: Connection | { source?: string | null; target?: string | null },
  nodes: PlaygroundNode[],
  edges: PlaygroundEdge[],
): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  if (
    edges.some(
      (edge) =>
        edge.source === connection.source && edge.target === connection.target,
    )
  )
    return false;
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return false;
  if (TERMINAL_NODE_KINDS.includes(sourceNode.data.kind)) return false;
  if (
    targetNode.data.kind === "metric-value" ||
    targetNode.data.kind === "satellite-state"
  )
    return false;
  if (targetNode.data.kind === "threshold")
    return sourceNode.data.kind === "metric-value";
  if (targetNode.data.kind === "logic")
    return BOOLEAN_SOURCE_KINDS.includes(sourceNode.data.kind);
  if (targetNode.data.kind === "action" || targetNode.data.kind === "alert")
    return BOOLEAN_SOURCE_KINDS.includes(sourceNode.data.kind);
  return false;
}

export function validatePlayground(
  nodes: PlaygroundNode[],
  edges: PlaygroundEdge[],
): PlaygroundValidationResult {
  const issues: PlaygroundIssue[] = [];
  const nodeIssueCount: Record<string, number> = {};
  const edgeIssueCount: Record<string, number> = {};
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incoming = buildIncomingEdges(edges);
  const outgoing = buildOutgoingEdges(edges);

  for (const edge of edges) {
    if (
      !validateConnection(
        edge,
        nodes,
        edges.filter((entry) => entry.id !== edge.id),
      )
    ) {
      pushIssue({
        level: "error",
        targetType: "edge",
        targetId: edge.id,
        message: "Invalid connection between these node types.",
      });
    }
  }

  for (const node of nodes) {
    const nodeIncoming = incoming.get(node.id) ?? [];
    const nodeOutgoing = outgoing.get(node.id) ?? [];
    switch (node.data.kind) {
      case "satellite-state":
        if (nodeOutgoing.length === 0) {
          pushIssue({
            level: "warning",
            targetType: "node",
            targetId: node.id,
            message: "State condition is disconnected.",
          });
        }
        break;
      case "metric-value":
        if (!node.data.metricName.trim()) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Metric node must select a metric.",
          });
        }
        if (nodeIncoming.length > 0) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Metric nodes cannot have incoming connections.",
          });
        }
        if (nodeOutgoing.length === 0) {
          pushIssue({
            level: "warning",
            targetType: "node",
            targetId: node.id,
            message: "Metric node is not connected to a threshold.",
          });
        }
        break;
      case "threshold":
        if (nodeIncoming.length !== 1) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Threshold nodes require exactly one metric input.",
          });
        }
        break;
      case "logic":
        if (nodeIncoming.length < 1) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Logic nodes require at least one boolean input.",
          });
        }
        break;
      case "action":
        if (nodeIncoming.length < 1) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Action nodes require an upstream condition.",
          });
        }
        if (nodeOutgoing.length > 0) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Action nodes cannot have outgoing connections.",
          });
        }
        break;
      case "alert":
        if (!node.data.message.trim()) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Alert nodes require a message.",
          });
        }
        if (nodeIncoming.length < 1) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Alert nodes require an upstream condition.",
          });
        }
        if (nodeOutgoing.length > 0) {
          pushIssue({
            level: "error",
            targetType: "node",
            targetId: node.id,
            message: "Alert nodes cannot have outgoing connections.",
          });
        }
        break;
    }
  }

  const duplicateIds = new Set<string>();
  for (const node of nodes) {
    if (duplicateIds.has(node.id)) {
      pushIssue({
        level: "error",
        targetType: "node",
        targetId: node.id,
        message: "Duplicate node id detected.",
      });
    }
    duplicateIds.add(node.id);
  }

  if (hasCycle(nodes, edges)) {
    pushIssue({
      level: "error",
      targetType: "graph",
      message: "Cycles are not supported in the playground graph.",
    });
  }

  return {
    issues,
    nodeIssueCount,
    edgeIssueCount,
    isValid: !issues.some((issue) => issue.level === "error"),
  };

  function pushIssue(issue: PlaygroundIssue) {
    issues.push(issue);
    if (issue.targetType === "node" && issue.targetId) {
      nodeIssueCount[issue.targetId] =
        (nodeIssueCount[issue.targetId] ?? 0) + 1;
    }
    if (issue.targetType === "edge" && issue.targetId) {
      edgeIssueCount[issue.targetId] =
        (edgeIssueCount[issue.targetId] ?? 0) + 1;
    }
    if (issue.targetType === "edge" && issue.targetId) {
      const edge = edges.find((entry) => entry.id === issue.targetId);
      if (edge) {
        nodeIssueCount[edge.source] = (nodeIssueCount[edge.source] ?? 0) + 1;
        nodeIssueCount[edge.target] = (nodeIssueCount[edge.target] ?? 0) + 1;
      }
    }
  }
}

export function evaluatePlayground(
  nodes: PlaygroundNode[],
  edges: PlaygroundEdge[],
  satellite: Satellite,
): PlaygroundEvalLine[] {
  const validation = validatePlayground(nodes, edges);
  if (!validation.isValid) {
    return [
      {
        text: `⚠ Graph is invalid — fix ${validation.issues.filter((issue) => issue.level === "error").length} error(s) before running.`,
        ok: false,
      },
      ...validation.issues
        .filter((issue) => issue.level === "error")
        .map((issue) => ({
          text: `• ${issue.message}`,
          ok: false,
          nodeId: issue.targetId,
        })),
    ];
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incoming = buildIncomingEdges(edges);
  const memo = new Map<string, EvalSignal>();
  const lines: PlaygroundEvalLine[] = [
    {
      text: `⚙ Evaluating ${satellite.name} against ${nodes.length} nodes and ${edges.length} edges…`,
      ok: true,
    },
  ];
  const terminalNodes = nodes.filter(
    (node) => node.data.kind === "action" || node.data.kind === "alert",
  );
  if (terminalNodes.length === 0) {
    return [
      ...lines,
      {
        text: "⚠ Add at least one Action or Alert node to finish the rule chain.",
        ok: false,
      },
    ];
  }

  for (const terminal of terminalNodes) {
    const result = evaluateNode(terminal.id);
    lines.push(...result.lines);
  }

  const deduped: PlaygroundEvalLine[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.nodeId ?? "global"}:${line.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(line);
    }
  }
  return deduped;

  function evaluateNode(nodeId: string): EvalSignal {
    const cached = memo.get(nodeId);
    if (cached) return cached;
    const node = nodeMap.get(nodeId);
    if (!node) {
      const missing: EvalSignal = {
        type: "boolean",
        value: false,
        ok: false,
        lines: [
          { text: "Unknown node reference found in graph.", ok: false, nodeId },
        ],
      };
      memo.set(nodeId, missing);
      return missing;
    }
    const parentEdges = incoming.get(node.id) ?? [];
    let result: EvalSignal;
    switch (node.data.kind) {
      case "satellite-state": {
        const stateMatches =
          node.data.stateComparator === "is"
            ? satellite.state === node.data.expectedState
            : satellite.state !== node.data.expectedState;
        result = {
          type: "boolean",
          value: stateMatches,
          ok: stateMatches,
          lines: [
            {
              text: `🛰 ${satellite.name} state ${node.data.stateComparator === "is" ? "==" : "!="} ${node.data.expectedState} → ${stateMatches ? "TRUE" : "FALSE"}`,
              ok: stateMatches,
              nodeId: node.id,
            },
          ],
        };
        break;
      }
      case "metric-value": {
        const data = node.data as MetricValueNodeData;
        const metric = satellite.metrics.find(
          (entry) => entry.name === data.metricName,
        );
        const latest = metric?.points.at(-1)?.value;
        const hasValue = latest !== undefined;
        result = {
          type: "number",
          value: latest ?? 0,
          ok: hasValue,
          lines: [
            {
              text: `📊 ${data.metricName} = ${hasValue ? `${latest?.toFixed(1)} ${metric?.unit ?? ""}`.trim() : "n/a"}`,
              ok: hasValue,
              nodeId: node.id,
            },
          ],
        };
        break;
      }
      case "threshold": {
        const parent = parentEdges[0]
          ? evaluateNode(parentEdges[0].source)
          : null;
        const numericValue =
          parent?.type === "number" ? Number(parent.value) : NaN;
        const passed = compareThreshold(
          numericValue,
          node.data.comparator,
          node.data.threshold,
        );
        result = {
          type: "boolean",
          value: passed,
          ok: passed,
          lines: [
            ...(parent?.lines ?? []),
            {
              text: `⚡ Threshold ${Number.isFinite(numericValue) ? numericValue.toFixed(1) : "n/a"} ${node.data.comparator} ${node.data.threshold} → ${passed ? "TRUE" : "FALSE"}`,
              ok: passed,
              nodeId: node.id,
            },
          ],
        };
        break;
      }
      case "logic": {
        const parentSignals = parentEdges.map((edge) =>
          evaluateNode(edge.source),
        );
        const bools = parentSignals
          .filter((signal) => signal.type === "boolean")
          .map((signal) => Boolean(signal.value));
        const passed =
          node.data.mode === "AND" ? bools.every(Boolean) : bools.some(Boolean);
        result = {
          type: "boolean",
          value: passed,
          ok: passed,
          lines: [
            ...parentSignals.flatMap((signal) => signal.lines),
            {
              text: `🔀 ${node.data.mode} gate over ${bools.length} input(s) → ${passed ? "TRUE" : "FALSE"}`,
              ok: passed,
              nodeId: node.id,
            },
          ],
        };
        break;
      }
      case "action": {
        const parentSignals = parentEdges.map((edge) =>
          evaluateNode(edge.source),
        );
        const bools = parentSignals
          .filter((signal) => signal.type === "boolean")
          .map((signal) => Boolean(signal.value));
        const fired = combineInputMode(bools, node.data.inputMode);
        result = {
          type: "boolean",
          value: fired,
          ok: fired,
          lines: [
            ...parentSignals.flatMap((signal) => signal.lines),
            {
              text: `${fired ? "🚨" : "🛑"} Action ${node.data.command} → ${node.data.target === "all" ? "all satellites" : satellite.name} ${fired ? "would fire" : "suppressed"}`,
              ok: fired,
              nodeId: node.id,
            },
          ],
        };
        break;
      }
      case "alert": {
        const parentSignals = parentEdges.map((edge) =>
          evaluateNode(edge.source),
        );
        const bools = parentSignals
          .filter((signal) => signal.type === "boolean")
          .map((signal) => Boolean(signal.value));
        const fired = combineInputMode(bools, node.data.inputMode);
        result = {
          type: "boolean",
          value: fired,
          ok: fired,
          lines: [
            ...parentSignals.flatMap((signal) => signal.lines),
            {
              text: `${fired ? "🔔" : "🔕"} ${node.data.severity} alert ${fired ? `"${node.data.message}"` : "not emitted"}`,
              ok: fired,
              nodeId: node.id,
            },
          ],
        };
        break;
      }
    }
    memo.set(nodeId, result);
    return result;
  }
}

export function savePlaygroundDraft(draft: PlaygroundDraft) {
  try {
    localStorage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function loadPlaygroundDraft(): PlaygroundDraft | null {
  try {
    const raw = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlaygroundDraft;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPlaygroundDraft() {
  try {
    localStorage.removeItem(PLAYGROUND_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function availableMetricNames(
  satellite: Satellite | null | undefined,
): string[] {
  return satellite?.metrics.map((metric) => metric.name) ?? [];
}

export function availableMetricUnits(
  satellite: Satellite | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    (satellite?.metrics ?? []).map((metric) => [metric.name, metric.unit]),
  );
}

export function getMetricSeries(
  satellite: Satellite | null | undefined,
  metricName: string,
): MetricSeries | undefined {
  return satellite?.metrics.find((metric) => metric.name === metricName);
}

function buildIncomingEdges(
  edges: PlaygroundEdge[],
): Map<string, PlaygroundEdge[]> {
  const map = new Map<string, PlaygroundEdge[]>();
  for (const edge of edges) {
    const list = map.get(edge.target) ?? [];
    list.push(edge);
    map.set(edge.target, list);
  }
  return map;
}

function buildOutgoingEdges(
  edges: PlaygroundEdge[],
): Map<string, PlaygroundEdge[]> {
  const map = new Map<string, PlaygroundEdge[]>();
  for (const edge of edges) {
    const list = map.get(edge.source) ?? [];
    list.push(edge);
    map.set(edge.source, list);
  }
  return map;
}

function hasCycle(nodes: PlaygroundNode[], edges: PlaygroundEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges)
    (adjacency.get(edge.source) ?? []).push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

function compareThreshold(
  left: number,
  comparator: ThresholdComparator,
  right: number,
): boolean {
  if (!Number.isFinite(left)) return false;
  switch (comparator) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
  }
}

function combineInputMode(values: boolean[], mode: InputMode): boolean {
  if (values.length === 0) return false;
  return mode === "ALL" ? values.every(Boolean) : values.some(Boolean);
}
