import { writable, derived, get } from "svelte/store";
import type {
  ConstellationState,
  Satellite,
  Controller,
  Listener,
  LogEntry,
  FSMCommand,
  SatelliteState,
  LogLevel,
  CommandResponse,
  SubscriptionOverride,
  RunRecord,
  Project,
} from "./types";
import { LOG_LEVEL_ORDER } from "./constants";
/** Simulation heartbeat/metric tick interval in ms — consumed by the metrics page for correct ptCount. */
export const METRIC_INTERVAL_MS = 1500;
import {
  buildDemoSatellites,
  buildDemoControllers,
  buildDemoListeners,
  buildDemoLogs,
  buildDemoRuns,
  buildDemoSatellitesP2,
  buildDemoControllersP2,
  buildDemoListenersP2,
  buildDemoLogsP2,
  buildDemoRunsP2,
} from "./demo";

const now = Date.now();

// ---------------------------------------------------------------------------
// Project Management
// ---------------------------------------------------------------------------

export const DEMO_PROJECTS: Project[] = [
  {
    id: "proj-tb",
    name: "TestBeamSetup",
    groupName: "lab-network",
    color: "#7c6af7",
    initial: "TB",
  },
  {
    id: "proj-atlas",
    name: "ATLAS-CalibRun",
    groupName: "atlas-daq",
    color: "#06b6d4",
    initial: "AC",
  },
];

const BUILT_IN_DEMO_PROJECT_IDS = new Set(
  DEMO_PROJECTS.map((project) => project.id),
);

const DEFAULT_PROJECT = DEMO_PROJECTS[0]!;
const PROJECT_BY_ID = new Map(
  DEMO_PROJECTS.map((project) => [project.id, project]),
);

function getProjectById(projectId: string): Project {
  return PROJECT_BY_ID.get(projectId) ?? DEFAULT_PROJECT;
}

const projectStateCache = new Map<string, ConstellationState>();

/** Register a brand-new project so switchProject can find it. */
export function addDemoProject(proj: Project) {
  DEMO_PROJECTS.push(proj);
  PROJECT_BY_ID.set(proj.id, proj);
}

/** Remove a project by id (cannot remove the last one). */
export function removeDemoProject(id: string) {
  const idx = DEMO_PROJECTS.findIndex((p) => p.id === id);
  if (idx !== -1 && DEMO_PROJECTS.length > 1) {
    DEMO_PROJECTS.splice(idx, 1);
    PROJECT_BY_ID.delete(id);
    projectStateCache.delete(id);
  }
}

function buildProjectState(
  projectId: string,
  _now: number,
): ConstellationState {
  const project = getProjectById(projectId);
  if (!BUILT_IN_DEMO_PROJECT_IDS.has(projectId)) {
    return buildEmptyProjectState(project);
  }
  const isAtlas = project.id === "proj-atlas";
  const satellites = isAtlas
    ? buildDemoSatellitesP2(_now)
    : buildDemoSatellites(_now);
  const controllers = isAtlas
    ? buildDemoControllersP2(_now)
    : buildDemoControllers(_now);
  const listeners = isAtlas
    ? buildDemoListenersP2(_now)
    : buildDemoListeners(_now);
  const logs = isAtlas ? buildDemoLogsP2(_now) : buildDemoLogs(_now);
  const runs = isAtlas ? buildDemoRunsP2(_now) : buildDemoRuns(_now);
  const {
    state: globalState,
    mixed,
    globalStatus,
  } = deriveGlobalState(satellites);
  const currentRun =
    runs.find((run) => run.endTime === null) ?? runs[0] ?? null;
  const maxSequence = runs.reduce(
    (max, run) => Math.max(max, run.runIdentifier.sequence),
    0,
  );
  return {
    name: project.name,
    groupName: project.groupName,
    globalState,
    isMixedState: mixed,
    globalStatus,
    satellites,
    controllers,
    listeners,
    logs,
    runs,
    connected: true,
    runActive: Boolean(currentRun && currentRun.endTime === null),
    currentRun,
    globalSubscriptionLevel: "INFO",
    senderSubscriptions: [],
    topicSubscriptions: [],
    commandResponses: [],
    nextRunLabel: "",
    nextRunSequence: maxSequence + 1,
  };
}

function buildEmptyProjectState(project: Project): ConstellationState {
  return {
    name: project.name,
    groupName: project.groupName,
    globalState: "NEW",
    isMixedState: false,
    globalStatus: "No satellites connected.",
    satellites: [],
    controllers: [],
    listeners: [],
    logs: [],
    runs: [],
    connected: true,
    runActive: false,
    currentRun: null,
    globalSubscriptionLevel: "INFO",
    senderSubscriptions: [],
    topicSubscriptions: [],
    commandResponses: [],
    nextRunLabel: "",
    nextRunSequence: 1,
  };
}

function logLevelIndex(level: LogLevel): number {
  return LOG_LEVEL_ORDER.indexOf(level);
}

/**
 * Derive the global constellation state from the current satellite array.
 *
 * Per the CHP spec, only ESSENTIAL and DYNAMIC satellites can elevate the
 * global state to ERROR or SAFE — TRANSIENT/NONE satellites in those states
 * mark the run as DEGRADED but do not block the constellation.
 */
function deriveGlobalState(satellites: Satellite[]): {
  state: SatelliteState;
  mixed: boolean;
  globalStatus: string;
} {
  if (satellites.length === 0) {
    return {
      state: "NEW",
      mixed: false,
      globalStatus: "No satellites connected.",
    };
  }
  const isMixed = new Set(satellites.map((s) => s.state)).size > 1;
  // Only ESSENTIAL + DYNAMIC trigger an ERROR/SAFE escalation
  const blocking = satellites.filter(
    (s) => s.role === "ESSENTIAL" || s.role === "DYNAMIC",
  );
  let lowest: SatelliteState = "RUN";
  for (const prio of ["ERROR", "SAFE"] as SatelliteState[]) {
    if (blocking.some((s) => s.state === prio)) {
      lowest = prio;
      break;
    }
  }
  if (lowest === "RUN") {
    for (const prio of ["NEW", "INIT", "ORBIT", "RUN"] as SatelliteState[]) {
      if (satellites.some((s) => s.state === prio)) {
        lowest = prio;
        break;
      }
    }
  }
  const c = (st: SatelliteState) =>
    satellites.filter((s) => s.state === st).length;
  const parts: string[] = [];
  if (c("RUN")) parts.push(`${c("RUN")} in RUN`);
  if (c("ORBIT")) parts.push(`${c("ORBIT")} in ORBIT`);
  if (c("INIT")) parts.push(`${c("INIT")} in INIT`);
  if (c("NEW")) parts.push(`${c("NEW")} in NEW`);
  if (c("ERROR")) parts.push(`${c("ERROR")} in ERROR`);
  if (c("SAFE")) parts.push(`${c("SAFE")} in SAFE`);
  const globalStatus =
    parts.length > 0
      ? parts.join(", ") + "."
      : `${satellites.length} satellites connected.`;
  return { state: lowest, mixed: isMixed, globalStatus };
}

function createConstellationStore() {
  const demoSats = buildDemoSatellites(now);
  const demoRuns = buildDemoRuns(now);
  const {
    state: initGlobal,
    mixed: initMixed,
    globalStatus: initStatus,
  } = deriveGlobalState(demoSats);

  const initial: ConstellationState = {
    name: "TestBeamSetup",
    groupName: "lab-network",
    globalState: initGlobal,
    isMixedState: initMixed,
    globalStatus: initStatus,
    satellites: demoSats,
    controllers: buildDemoControllers(now),
    listeners: buildDemoListeners(now),
    logs: buildDemoLogs(now),
    runs: demoRuns,
    connected: true,
    runActive: Boolean(demoRuns[0] && demoRuns[0].endTime === null),
    currentRun: demoRuns.find((r) => r.endTime === null) ?? demoRuns[0] ?? null,
    globalSubscriptionLevel: "INFO",
    senderSubscriptions: [],
    topicSubscriptions: [],
    commandResponses: [],
    nextRunLabel: "",
    nextRunSequence: 43,
  };

  const { subscribe, update, set } = writable<ConstellationState>(initial);

  // Simulate live heartbeats, metric updates, and log entries
  function startSimulation() {
    let logCount = 200;

    const LOG_TEMPLATES = [
      {
        level: "INFO" as const,
        protocol: "CHP" as const,
        topic: "LINK" as const,
        msg: (s: string) => `Heartbeat OK — ${s} alive`,
      },
      {
        level: "DEBUG" as const,
        protocol: "CMDP" as const,
        topic: "STAT" as const,
        msg: (s: string) => `Metric update from ${s}`,
      },
      {
        level: "INFO" as const,
        protocol: "CSCP" as const,
        topic: "CTRL" as const,
        msg: () => "Command acknowledged",
      },
      {
        level: "WARNING" as const,
        protocol: "CMDP" as const,
        topic: "STAT" as const,
        msg: (s: string) => `${s}: high CPU load detected`,
      },
      {
        level: "TRACE" as const,
        protocol: "CHP" as const,
        topic: "LINK" as const,
        msg: (s: string) => `${s} heartbeat interval: 1000ms`,
      },
      {
        level: "STATUS" as const,
        protocol: "CSCP" as const,
        topic: "FSM" as const,
        msg: (s: string) => `${s} transitioned to new state`,
      },
    ];

    // Heartbeat + metric tick every 1.5s
    const hbInterval = setInterval(() => {
      update((state) => {
        const t = Date.now();
        const sats = state.satellites.map((s) => {
          const newPoint = {
            time: t,
            value: Math.max(
              0,
              (s.metrics[0]?.points.slice(-1)[0]?.value ?? 30) +
                (Math.random() - 0.5) * 5,
            ),
          };
          return {
            ...s,
            lastHeartbeat: t - Math.random() * 200,
            extrasystole: false,
            metrics: s.metrics.map((m, i) => ({
              ...m,
              points: [
                ...m.points.slice(-119),
                {
                  time: t,
                  value: Math.max(
                    0,
                    (m.points.slice(-1)[0]?.value ?? 30) +
                      (Math.random() - 0.5) *
                        (i === 0 ? 5 : i === 1 ? 10 : 300),
                  ),
                },
              ],
            })),
          };
        });

        // Occasionally toggle a satellite state for realism
        const idx = Math.floor(Math.random() * sats.length);
        if (Math.random() < 0.04) {
          sats[idx] = { ...sats[idx], extrasystole: true };
        }

        // Update current run event count
        const _speed = get(simSpeedMultiplier);
        let currentRun = state.currentRun;
        if (currentRun && state.runActive) {
          currentRun = {
            ...currentRun,
            eventCount:
              currentRun.eventCount +
              Math.floor((Math.random() * 50 + 10) * _speed),
          };
        }

        // Keep runs array in sync so run history reflects live event count
        const runs =
          currentRun && state.runActive
            ? state.runs.map((r) => (r.id === currentRun.id ? currentRun : r))
            : state.runs;

        const { state: global, mixed, globalStatus } = deriveGlobalState(sats);
        return {
          ...state,
          satellites: sats,
          currentRun,
          runs,
          globalState: global,
          isMixedState: mixed,
          globalStatus,
        };
      });
    }, 1500);

    // New log entry every 2s
    const logInterval = setInterval(() => {
      update((state) => {
        const t = state;
        const sat =
          t.satellites[Math.floor(Math.random() * t.satellites.length)];
        const tmpl =
          LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];

        // Check subscription level before generating log
        const _logSpeed = get(simSpeedMultiplier);
        if (_logSpeed < 1 && Math.random() > _logSpeed) return state;
        const levelIdx = logLevelIndex(tmpl.level);
        const globalIdx = logLevelIndex(state.globalSubscriptionLevel);
        if (levelIdx < globalIdx) {
          return state; // below subscription level, skip
        }

        const entry: LogEntry = {
          id: `log-live-${logCount++}`,
          time: Date.now(),
          level: tmpl.level,
          protocol: tmpl.protocol,
          satellite: sat.name,
          component: sat.type,
          message: tmpl.msg(sat.name),
          topic: tmpl.topic,
          isExtrasystole: false,
        };
        return {
          ...state,
          logs: [...state.logs.slice(-999), entry],
        };
      });
    }, 2000);

    return () => {
      clearInterval(hbInterval);
      clearInterval(logInterval);
    };
  }

  return {
    subscribe,
    startSimulation,

    sendCommand(
      satelliteId: string | "all",
      command: FSMCommand,
      payload?: unknown,
    ) {
      update((state) => {
        const stateMap: Partial<Record<FSMCommand, SatelliteState>> = {
          initialize: "INIT",
          launch: "ORBIT",
          land: "INIT",
          start: "RUN",
          stop: "ORBIT",
          interrupt: "SAFE",
          recover: "INIT",
          reconfigure: "ORBIT",
          shutdown: "DEAD",
        };
        const newSatState = stateMap[command];
        const newSats = state.satellites.map((s) => {
          if (satelliteId !== "all" && s.id !== satelliteId) return s;
          if (!newSatState) return s;
          return {
            ...s,
            state: newSatState,
            lastStateChange: Date.now(),
            extrasystole: true,
          };
        });

        const targetName =
          satelliteId === "all"
            ? "All Satellites"
            : (newSats.find((s) => s.id === satelliteId)?.name ?? "");

        // Run lifecycle bookkeeping
        let runs = state.runs;
        let currentRun = state.currentRun;
        let runActive = state.runActive;
        let nextRunSequence = state.nextRunSequence;
        let nextRunLabel = state.nextRunLabel;

        if (command === "start") {
          const label = state.nextRunLabel || `run-${state.nextRunSequence}`;
          const newRun: RunRecord = {
            id: `run-${state.nextRunSequence}`,
            runNumber: state.nextRunSequence,
            runIdentifier: { label, sequence: state.nextRunSequence },
            startTime: Date.now(),
            endTime: null,
            condition: "GOOD",
            satellites: newSats.map((s) => s.name),
            eventCount: 0,
            borConfig: Object.fromEntries(
              newSats.map((s) => [s.name, s.config]),
            ),
            borUserTags: {},
            eorMeta: null,
            eorMetrics: null,
            license: "CC0-1.0",
          };
          runs = [newRun, ...state.runs];
          currentRun = newRun;
          runActive = true;
          nextRunSequence = state.nextRunSequence + 1;
          nextRunLabel = "";
        } else if (
          command === "stop" &&
          satelliteId === "all" &&
          state.currentRun
        ) {
          const hasTransientError = newSats.some(
            (s) =>
              (s.role === "TRANSIENT" || s.role === "NONE") &&
              s.state === "ERROR",
          );
          const closedRun: RunRecord = {
            ...state.currentRun,
            endTime: Date.now(),
            condition: hasTransientError ? "DEGRADED" : "GOOD",
            eorMeta: {
              completedAt: new Date().toISOString(),
              totalEvents: state.currentRun.eventCount,
            },
          };
          runs = state.runs.map((r) => (r.id === closedRun.id ? closedRun : r));
          currentRun = closedRun;
          runActive = false;
        }

        const logEntry: LogEntry = {
          id: `log-cmd-${Date.now()}`,
          time: Date.now(),
          level: "INFO",
          protocol: "CSCP",
          satellite: targetName,
          component: "Controller",
          message: `Command "${command}" sent ${satelliteId === "all" ? "to all satellites" : `to ${targetName}`}`,
          topic: "CTRL",
        };

        // Simulate a CSCP response
        const response: CommandResponse = {
          command,
          target: targetName,
          reply: "SUCCESS",
          payload:
            payload ??
            (command === "start"
              ? {
                  run_number: nextRunSequence - 1,
                  run_identifier: currentRun?.runIdentifier.label ?? "",
                }
              : { state: newSatState }),
          timestamp: Date.now(),
        };

        const {
          state: global,
          mixed,
          globalStatus,
        } = deriveGlobalState(newSats);
        return {
          ...state,
          satellites: newSats,
          globalState: global,
          isMixedState: mixed,
          globalStatus,
          runs,
          currentRun,
          runActive,
          nextRunSequence,
          nextRunLabel,
          logs: [...state.logs.slice(-999), logEntry],
          commandResponses: [...state.commandResponses.slice(-49), response],
        };
      });
    },

    addSatellite(name: string, type: string, host: string) {
      update((state) => {
        const newSat: Satellite = {
          id: `sat-${Math.random().toString(36).slice(2, 8)}`,
          name: `${type}.${name}`,
          type,
          instance: name,
          host,
          ip: "192.168.1.99",
          port: 5600 + state.satellites.length,
          state: "NEW",
          status: "Satellite discovered via CHIRP offer beacon.",
          role: "DYNAMIC",
          lives: 3,
          maxLives: 3,
          heartbeatInterval: 1000,
          lastHeartbeat: Date.now(),
          lastStateChange: Date.now(),
          extrasystole: false,
          config: {},
          availableCommands: ["get_status", "get_name"],
          metrics: [],
          language: "C++",
          template: "Sputnik",
          chirpId: {
            groupHash: "00000000",
            hostHash: Math.random().toString(16).slice(2, 34),
          },
          dependencies: [],
        };
        return { ...state, satellites: [...state.satellites, newSat] };
      });
    },

    removeSatellite(satelliteId: string) {
      update((state) => ({
        ...state,
        satellites: state.satellites.filter((s) => s.id !== satelliteId),
      }));
    },

    addController(name: string, host: string, port: number) {
      update((state) => {
        const newCtrl: Controller = {
          id: `ctrl-${Math.random().toString(36).slice(2, 8)}`,
          name,
          host,
          ip: "192.168.1.99",
          port,
          connected: true,
          discoveredSatellites: 0,
          lastActivity: Date.now(),
          chirpId: {
            groupHash: "00000000",
            hostHash: Math.random().toString(16).slice(2, 34),
          },
        };
        return { ...state, controllers: [...state.controllers, newCtrl] };
      });
    },

    removeController(controllerId: string) {
      update((state) => ({
        ...state,
        controllers: state.controllers.filter((c) => c.id !== controllerId),
      }));
    },

    switchProject(projectId: string) {
      const currentState = get({ subscribe });
      const currentProjectId =
        DEMO_PROJECTS.find((project) => project.name === currentState.name)
          ?.id ?? DEFAULT_PROJECT.id;
      projectStateCache.set(currentProjectId, currentState);
      let nextState = projectStateCache.get(projectId);
      if (!nextState) {
        nextState = buildProjectState(projectId, Date.now());
        projectStateCache.set(projectId, nextState);
      }
      set(nextState);
    },

    updateConfig(satelliteId: string, config: Record<string, unknown>) {
      update((state) => ({
        ...state,
        satellites: state.satellites.map((s) =>
          s.id === satelliteId
            ? { ...s, config: { ...s.config, ...config } }
            : s,
        ),
      }));
    },

    /** Clear all log entries */
    clearLogs() {
      update((state) => ({ ...state, logs: [] }));
    },

    /** Set the global subscription level (source-side filtering) */
    setGlobalSubscriptionLevel(level: LogLevel) {
      update((state) => ({ ...state, globalSubscriptionLevel: level }));
    },

    /** Set a per-sender subscription level override */
    setSenderSubscription(sender: string, level: LogLevel) {
      update((state) => {
        const existing = state.senderSubscriptions.filter(
          (s) => s.key !== sender,
        );
        return {
          ...state,
          senderSubscriptions: [...existing, { key: sender, level }],
        };
      });
    },

    /** Remove a per-sender subscription override */
    removeSenderSubscription(sender: string) {
      update((state) => ({
        ...state,
        senderSubscriptions: state.senderSubscriptions.filter(
          (s) => s.key !== sender,
        ),
      }));
    },

    /** Set a per-topic subscription level override */
    setTopicSubscription(topic: string, level: LogLevel) {
      update((state) => {
        const existing = state.topicSubscriptions.filter(
          (s) => s.key !== topic,
        );
        return {
          ...state,
          topicSubscriptions: [...existing, { key: topic, level }],
        };
      });
    },

    /** Remove a per-topic subscription override */
    removeTopicSubscription(topic: string) {
      update((state) => ({
        ...state,
        topicSubscriptions: state.topicSubscriptions.filter(
          (s) => s.key !== topic,
        ),
      }));
    },

    /** Set the next run identifier label */
    setNextRunLabel(label: string) {
      update((state) => ({ ...state, nextRunLabel: label }));
    },

    /** Deduce the full configuration from all running satellites — aggregates
     *  config, _autonomy, and _data sections into a TOML-like structure */
    deduceConfig(): Record<string, unknown> {
      const state = get({ subscribe });
      const deduced: Record<string, unknown> = {};
      for (const sat of state.satellites) {
        const typeKey = sat.type;
        const instanceKey = sat.instance;
        const fullKey = `${typeKey}.${instanceKey}`;

        // Main config section
        deduced[fullKey] = { ...sat.config };

        // _autonomy subsection
        (deduced[fullKey] as Record<string, unknown>)["_autonomy"] = {
          max_heartbeat_interval: sat.heartbeatInterval,
          role: sat.role,
        };

        // _data subsection (simulated values based on role)
        (deduced[fullKey] as Record<string, unknown>)["_data"] = {
          bor_timeout: "5s",
          data_timeout: "10s",
          eor_timeout: "5s",
          license: state.currentRun?.license ?? "CC0-1.0",
          payload_threshold: 4096,
          queue_size: 128,
          receive_from: sat.dependencies.map((d) => d.satellite),
          allow_overwriting: false,
        };
      }
      return deduced;
    },
  };
}

export function getAllowedCommands(state: SatelliteState): FSMCommand[] {
  switch (state) {
    case "NEW":
    case "ERROR":
    case "SAFE":
      return ["initialize", "recover"];
    case "INIT":
      return ["launch", "recover", "shutdown"];
    case "ORBIT":
      return ["start", "land", "reconfigure", "interrupt"];
    case "RUN":
      return ["stop", "interrupt"];
    default:
      return [];
  }
}

export const constellation = createConstellationStore();

/** Simulation speed multiplier — 0.25 | 0.5 | 1 | 2 | 4.
 *  Used by the heartbeat/log intervals to scale event generation rate. */
export const simSpeedMultiplier = writable(1);

export const satellites = derived(constellation, ($c) => $c.satellites);
export const controllers = derived(constellation, ($c) => $c.controllers);
export const listeners = derived(constellation, ($c) => $c.listeners);
export const logs = derived(constellation, ($c) => $c.logs);
export const runs = derived(constellation, ($c) => $c.runs);
export const globalState = derived(constellation, ($c) => $c.globalState);
export const isMixedState = derived(constellation, ($c) => $c.isMixedState);
export const commandResponses = derived(
  constellation,
  ($c) => $c.commandResponses,
);
export const globalSubscriptionLevel = derived(
  constellation,
  ($c) => $c.globalSubscriptionLevel,
);
export const senderSubscriptions = derived(
  constellation,
  ($c) => $c.senderSubscriptions,
);
export const topicSubscriptions = derived(
  constellation,
  ($c) => $c.topicSubscriptions,
);
