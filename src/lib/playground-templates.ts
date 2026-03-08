export const NODE_TEMPLATES = [
  {
    type: "Satellite State",
    color: "#3b82f6",
    emoji: "🛰",
    desc: "Emits the current FSM state of the selected satellite",
  },
  {
    type: "Metric Value",
    color: "#7c6af7",
    emoji: "📊",
    desc: "Live metric value streamed via CMDP STAT/ topics",
  },
  {
    type: "Threshold",
    color: "#f59e0b",
    emoji: "⚡",
    desc: "Compare a metric against a numeric threshold",
  },
  {
    type: "AND / OR Logic",
    color: "#06b6d4",
    emoji: "🔀",
    desc: "Boolean combiner — all inputs must satisfy the condition",
  },
  {
    type: "Action",
    color: "#10b981",
    emoji: "▶",
    desc: "Send a CSCP command to any satellite when triggered",
  },
  {
    type: "Alert",
    color: "#ef4444",
    emoji: "🔔",
    desc: "Emit a log notification when the condition fires",
  },
];

export type NodeTemplate = (typeof NODE_TEMPLATES)[number];
