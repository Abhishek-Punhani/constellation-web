// Core types mirroring Constellation's protocol structures

// ---------------------------------------------------------------------------
// FSM
// ---------------------------------------------------------------------------

export type SatelliteState =
  | "NEW"
  | "INIT"
  | "initializing"
  | "ORBIT"
  | "launching"
  | "landing"
  | "RUN"
  | "starting"
  | "stopping"
  | "reconfiguring"
  | "SAFE"
  | "interrupting"
  | "ERROR"
  | "DEAD"
  | "TRANSITIONING";

export type AutonomyRole = "ESSENTIAL" | "DYNAMIC" | "TRANSIENT" | "NONE";

export type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "WARNING"
  | "STATUS"
  | "CRITICAL";

export type Protocol = "CHIRP" | "CSCP" | "CHP" | "CMDP" | "CDTP";
export type RunCondition = "GOOD" | "DEGRADED" | "TAINTED" | "INCOMPLETE";

/** CMDP topic categories published by satellites */
export type CMDPTopic = "FSM" | "CTRL" | "DATA" | "STAT" | "UI";

/** Log topics — finer-grained than CMDP topics, describe the source subsystem */
export type LogTopic =
  | "FSM"
  | "LINK"
  | "DATA"
  | "CTRL"
  | "STAT"
  | "UI"
  | string; // satellites can publish type-specific topics (e.g. "SPUTNIK", "HV")

/** CSCP reply codes returned by satellites */
export type CSCPReply = "SUCCESS" | "INVALID" | "UNKNOWN" | "INCOMPLETE";

// ---------------------------------------------------------------------------
// Project / Workspace
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  groupName: string;
  color: string; // hex color code for icon background
  initial: string; // 1-2 letter icon text
}

/** Programming language / framework template of a satellite */
export type SatelliteLanguage = "C++" | "Python";
export type SatelliteTemplate = "Sputnik" | "Mariner";

// ---------------------------------------------------------------------------
// CHIRP discovery — MD5-based identity
// ---------------------------------------------------------------------------

export interface CHIRPIdentity {
  /** 16-byte MD5 hash of the group name */
  groupHash: string;
  /** 16-byte MD5 hash of the host identifier */
  hostHash: string;
}

export type CHIRPBeaconType = "OFFER" | "REQUEST" | "DEPART";

// ---------------------------------------------------------------------------
// Satellite
// ---------------------------------------------------------------------------

export interface Satellite {
  id: string;
  name: string; // canonical: "Type.InstanceName"
  type: string;
  instance: string;
  host: string;
  ip: string;
  port: number;
  state: SatelliteState;
  status: string; // human-readable status string
  role: AutonomyRole;
  lives: number;
  maxLives: number;
  heartbeatInterval: number; // ms
  lastHeartbeat: number; // timestamp ms
  lastStateChange: number; // timestamp ms
  extrasystole: boolean; // true briefly when out-of-order HB received
  config: Record<string, unknown>;
  availableCommands: string[];
  metrics: MetricSeries[];

  /** C++ (Sputnik template) or Python (Mariner template) */
  language: SatelliteLanguage;
  template: SatelliteTemplate;

  /** CHIRP 16-byte MD5 identity hashes */
  chirpId: CHIRPIdentity;

  /** require_after dependencies — satellite names that must reach the target
   *  state before this satellite proceeds past its own transition checkpoint */
  dependencies: LaunchDependency[];
}

export interface LaunchDependency {
  /** Name of the satellite this one depends on */
  satellite: string;
  /** The transition during which the checkpoint is evaluated */
  transition: "launching" | "starting" | "initializing";
  /** The required state the dependency must reach */
  requiredState: SatelliteState;
}

// ---------------------------------------------------------------------------
// Controller — stateless command interface (first-class entity)
// ---------------------------------------------------------------------------

export interface Controller {
  id: string;
  name: string;
  host: string;
  ip: string;
  port: number;
  /** Controllers are inherently stateless — this tracks connection liveness */
  connected: boolean;
  /** Number of satellites this controller has discovered */
  discoveredSatellites: number;
  lastActivity: number; // timestamp ms
  chirpId: CHIRPIdentity;
}

// ---------------------------------------------------------------------------
// Listener — stateless passive observer (first-class entity)
// ---------------------------------------------------------------------------

export type ListenerKind =
  | "TelemetryConsole"
  | "Observatory"
  | "InfluxForwarder"
  | "CustomListener";

export interface Listener {
  id: string;
  name: string;
  kind: ListenerKind;
  host: string;
  ip: string;
  port: number;
  connected: boolean;
  /** CMDP topic subscriptions this listener cares about */
  subscribedTopics: CMDPTopic[];
  /** Minimum log level this listener subscribes to (source-side filtering) */
  subscriptionLevel: LogLevel;
  lastActivity: number; // timestamp ms
  chirpId: CHIRPIdentity;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface MetricPoint {
  time: number; // ms timestamp
  value: number;
}

export interface MetricSeries {
  name: string;
  unit: string;
  points: MetricPoint[];
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export interface LogEntry {
  id: string;
  time: number;
  level: LogLevel;
  protocol: Protocol;
  satellite: string;
  component: string;
  message: string;
  /** Log topic — finer-grained subsystem tag (FSM, LINK, DATA, or type-specific) */
  topic?: LogTopic;
  isExtrasystole?: boolean;
  isBOR?: boolean;
  isEOR?: boolean;
}

/** Response payload from a CSCP command */
export interface CommandResponse {
  command: string;
  target: string;
  reply: CSCPReply;
  payload: unknown;
  timestamp: number;
}

/** Run identifier: free-text label + auto-incrementing sequence counter */
export interface RunIdentifier {
  /** User-defined free-text label, e.g. "beam test with new sensor" */
  label: string;
  /** Auto-incrementing sequence counter, persisted across controller restarts */
  sequence: number;
}

/** Per-sender or per-topic subscription level override */
export interface SubscriptionOverride {
  /** The sender name (satellite canonical name) or topic string */
  key: string;
  /** The minimum log level to receive from this sender/topic */
  level: LogLevel;
}

// ---------------------------------------------------------------------------
// BOR / EOR — structured run bookends
// ---------------------------------------------------------------------------

export interface BORUserTags {
  /** e.g. "120 GeV/c pion" */
  beamMomentum?: string;
  /** e.g. "FEI4 quad module" */
  detectorPrototype?: string;
  /** Arbitrary user key-values */
  [key: string]: unknown;
}

export interface BOREdaqTags {
  /** Event class identifier for EUDAQ2 compatibility, e.g. "ThorlabDataEvent" */
  newticEventTag?: string;
  /** If true, receiver interprets payload as distinct EUDAQ blocks; otherwise sub-events */
  writeAsBlocks?: boolean;
}

// ---------------------------------------------------------------------------
// Run record
// ---------------------------------------------------------------------------

export interface RunRecord {
  id: string;
  runNumber: number;
  /** Run identifier: free-text label + auto-incremented sequence counter */
  runIdentifier: RunIdentifier;
  startTime: number;
  endTime: number | null;
  condition: RunCondition;
  satellites: string[];
  eventCount: number;

  /** Per-satellite config snapshot injected into the BOR */
  borConfig: Record<string, unknown>;
  /** User-provided tags in the BOR (beam, detector, custom) */
  borUserTags?: BORUserTags;
  /** EUDAQ2 compatibility tags in the BOR */
  borEdaqTags?: BOREdaqTags;

  eorMeta: Record<string, unknown> | null;
  eorMetrics: Record<string, Record<string, MetricPoint[]>> | null;
  license: string;
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

export interface ConstellationState {
  name: string;
  groupName: string;
  globalState: SatelliteState;
  /** True when satellites are in mixed (different) states — display "≊" suffix */
  isMixedState: boolean;
  globalStatus: string;
  satellites: Satellite[];
  controllers: Controller[];
  listeners: Listener[];
  logs: LogEntry[];
  runs: RunRecord[];
  connected: boolean;
  runActive: boolean;
  currentRun: RunRecord | null;

  /** Global subscription level — minimum log level received from all senders */
  globalSubscriptionLevel: LogLevel;
  /** Per-sender subscription level overrides */
  senderSubscriptions: SubscriptionOverride[];
  /** Per-topic subscription level overrides */
  topicSubscriptions: SubscriptionOverride[];
  /** Command response history */
  commandResponses: CommandResponse[];
  /** Next run identifier label (user sets before starting) */
  nextRunLabel: string;
  /** Next sequence counter (auto-incremented) */
  nextRunSequence: number;
}

export type FSMCommand =
  | "initialize"
  | "launch"
  | "land"
  | "start"
  | "stop"
  | "reconfigure"
  | "interrupt"
  | "recover"
  | "shutdown";
