// Demo data generator — simulates a live Constellation with mock satellites,
// controllers, and listeners covering all protocol and architecture concepts.
import type {
  Satellite,
  Controller,
  Listener,
  LogEntry,
  RunRecord,
  MetricPoint,
  MetricSeries,
  SatelliteState,
  LogLevel,
  Protocol,
  CMDPTopic,
  CHIRPIdentity,
  LaunchDependency,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function md5Hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const a = (h >>> 0).toString(16).padStart(8, "0");
  const b = ((h >>> 0) ^ 0xdeadbeef).toString(16).padStart(8, "0");
  const c = ((h >>> 0) ^ 0xcafebabe).toString(16).padStart(8, "0");
  const d = ((h >>> 0) ^ 0x12345678).toString(16).padStart(8, "0");
  return a + b + c + d;
}

function chirpId(name: string, group = "TestBeamSetup"): CHIRPIdentity {
  return { groupHash: md5Hash(group), hostHash: md5Hash(name) };
}

function genPoints(
  count: number,
  base: number,
  variance: number,
  now: number,
): MetricPoint[] {
  const pts: MetricPoint[] = [];
  let v = base;
  for (let i = count; i >= 0; i--) {
    v = Math.max(0, v + (Math.random() - 0.5) * variance);
    pts.push({ time: now - i * 5000, value: Math.round(v * 100) / 100 });
  }
  return pts;
}

function genMetrics(now: number): MetricSeries[] {
  return [
    { name: "CPU_LOAD", unit: "%", points: genPoints(60, 35, 8, now) },
    { name: "MEM_USED", unit: "MB", points: genPoints(60, 512, 20, now) },
    { name: "RX_BYTES", unit: "B/s", points: genPoints(60, 4000, 800, now) },
    { name: "TX_BYTES", unit: "B/s", points: genPoints(60, 3200, 600, now) },
  ];
}

function metricSeriesToRecord(
  series: MetricSeries[],
): Record<string, MetricPoint[]> {
  return series.reduce<Record<string, MetricPoint[]>>(
    (acc, { name, points }) => {
      acc[name] = points;
      return acc;
    },
    {},
  );
}

function buildRunMetrics(
  now: number,
  satellites: string[],
): Record<string, Record<string, MetricPoint[]>> {
  const metrics: Record<string, Record<string, MetricPoint[]>> = {};
  for (const satellite of satellites) {
    metrics[satellite] = metricSeriesToRecord(genMetrics(now));
  }
  return metrics;
}

// ---------------------------------------------------------------------------
// Satellites — 8 total, maxLives: 3 (canonical default)
// ---------------------------------------------------------------------------

export function buildDemoSatellites(now: number): Satellite[] {
  return [
    {
      id: "sat-hv",
      name: "HighVoltage.hv1",
      type: "HighVoltage",
      instance: "hv1",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 5555,
      state: "INIT",
      status:
        "Initialized. Keithley SMU configured — bias 100V, ramp 10V/s. Ready to launch.",
      role: "ESSENTIAL",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now - 200,
      lastStateChange: now - 2000,
      extrasystole: false,
      config: {
        bias_voltage: 100,
        max_current_ua: 500,
        ramp_rate_v_s: 10,
        overvoltage_protection: 120,
        current_compliance_ua: 600,
      },
      availableCommands: [
        "get_voltage",
        "set_voltage",
        "get_current",
        "emergency_off",
      ],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("HighVoltage.hv1"),
      dependencies: [],
    },
    {
      id: "sat-h5w",
      name: "H5DataWriter.h5w1",
      type: "H5DataWriter",
      instance: "h5w1",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 5561,
      state: "INIT",
      status:
        "Initialized. HDF5 v1.14, SWMR mode enabled, output dir /data/runs ready.",
      role: "ESSENTIAL",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now - 150,
      lastStateChange: now - 1900,
      extrasystole: false,
      config: {
        output_dir: "/data/runs",
        swmr_mode: true,
        file_format: "HDF5",
        chunk_size: 1024,
        compression: "gzip",
        posix_file_locks: true,
        max_file_size_gb: 10,
      },
      availableCommands: [
        "get_file_path",
        "get_event_count",
        "get_file_size",
        "flush_buffers",
      ],
      metrics: [
        ...genMetrics(now).slice(0, 2),
        {
          name: "WRITE_RATE_MB",
          unit: "MB/s",
          points: genPoints(60, 12.5, 2, now),
        },
        {
          name: "FILE_SIZE_MB",
          unit: "MB",
          points: genPoints(60, 87, 0.8, now),
        },
      ],
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("H5DataWriter.h5w1"),
      dependencies: [
        {
          satellite: "HighVoltage.hv1",
          transition: "starting",
          requiredState: "RUN",
        },
      ],
    },
    {
      id: "sat-eudw",
      name: "EudaqNativeWriter.eudw1",
      type: "EudaqNativeWriter",
      instance: "eudw1",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 5562,
      state: "INIT",
      status:
        "Initialized. EUDAQ2 native writer ready — write_as_blocks=true, tag=ThorlabDataEvent.",
      role: "DYNAMIC",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now - 250,
      lastStateChange: now - 1800,
      extrasystole: false,
      config: {
        output_dir: "/data/eudaq",
        file_format: "EUDAQ2_native",
        write_as_blocks: true,
        newtic_event_tag: "ThorlabDataEvent",
      },
      availableCommands: [
        "get_file_path",
        "get_event_count",
        "get_block_count",
      ],
      metrics: [
        ...genMetrics(now).slice(0, 2),
        {
          name: "WRITE_RATE_MB",
          unit: "MB/s",
          points: genPoints(60, 8.2, 1.5, now),
        },
      ],
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("EudaqNativeWriter.eudw1"),
      dependencies: [
        {
          satellite: "HighVoltage.hv1",
          transition: "starting",
          requiredState: "RUN",
        },
      ],
    },
    {
      id: "sat-fw",
      name: "FlightRecorder.fr1",
      type: "FlightRecorder",
      instance: "fr1",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 5556,
      state: "INIT",
      status:
        "Initialized. Flight recorder ready — output /data/runs, max 1024 MB, rotate on size.",
      role: "DYNAMIC",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now - 180,
      lastStateChange: now - 1700,
      extrasystole: false,
      config: {
        mode: "run_n",
        output_dir: "/data/runs",
        max_file_size_mb: 1024,
        rotate_on_size: true,
      },
      availableCommands: ["get_log_path", "rotate_log", "get_event_count"],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("FlightRecorder.fr1"),
      dependencies: [
        {
          satellite: "RandomTransmitter.tx1",
          transition: "launching",
          requiredState: "ORBIT",
        },
      ],
    },
    {
      id: "sat-rx",
      name: "RandomTransmitter.tx1",
      type: "RandomTransmitter",
      instance: "tx1",
      host: "lab-pc-02",
      ip: "192.168.1.11",
      port: 5557,
      state: "INIT",
      status:
        "Initialized. PRNG seeded (42), rate 1 kHz, payload 256 B. Awaiting launch.",
      role: "DYNAMIC",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now - 850,
      lastStateChange: now - 1600,
      extrasystole: false,
      config: {
        event_rate_hz: 1000,
        payload_size_bytes: 256,
        seed: 42,
        data_grouping_threshold_bytes: 1024,
      },
      availableCommands: ["set_rate", "set_payload_size", "get_stats"],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("RandomTransmitter.tx1"),
      dependencies: [],
    },
    {
      id: "sat-temp",
      name: "TempSensor.ts1",
      type: "TempSensor",
      instance: "ts1",
      host: "lab-rpi-01",
      ip: "192.168.1.20",
      port: 5558,
      state: "INIT",
      status:
        "Initialized. Lakeshore 218, 8 channels online, RS-232 9600 baud. Awaiting launch.",
      role: "TRANSIENT",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 2000,
      lastHeartbeat: now - 400,
      lastStateChange: now - 1500,
      extrasystole: false,
      config: {
        sample_interval_s: 5,
        alert_threshold_c: 40,
        serial_port: "/dev/ttyUSB0",
        baud_rate: 9600,
        channels: 8,
      },
      availableCommands: [
        "get_temperature",
        "get_humidity",
        "set_sample_interval",
      ],
      metrics: [
        {
          name: "TEMPERATURE",
          unit: "°C",
          points: genPoints(60, 23, 0.5, now),
        },
        { name: "HUMIDITY", unit: "%", points: genPoints(60, 41, 1, now) },
      ],
      language: "Python",
      template: "Mariner",
      chirpId: chirpId("TempSensor.ts1"),
      dependencies: [],
    },
    {
      id: "sat-dnr",
      name: "DevNullReceiver.dnr1",
      type: "DevNullReceiver",
      instance: "dnr1",
      host: "lab-pc-02",
      ip: "192.168.1.11",
      port: 5559,
      state: "INIT",
      status:
        "Initialized. Buffer 64 MB ready. Will wait for RandomTransmitter.tx1 → ORBIT before completing launch.",
      role: "NONE",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now - 600,
      lastStateChange: now - 1400,
      extrasystole: false,
      config: { buffer_size_mb: 64 },
      availableCommands: ["get_drop_count", "reset_stats"],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("DevNullReceiver.dnr1"),
      dependencies: [
        {
          satellite: "RandomTransmitter.tx1",
          transition: "launching",
          requiredState: "ORBIT",
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Controllers (stateless)
// ---------------------------------------------------------------------------

export function buildDemoControllers(now: number): Controller[] {
  return [
    {
      id: "ctrl-mc",
      name: "MissionControl.main",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 9000,
      connected: true,
      discoveredSatellites: 7,
      lastActivity: now - 500,
      chirpId: chirpId("MissionControl.main"),
    },
    {
      id: "ctrl-cli",
      name: "ConstellationCLI.ops",
      host: "lab-pc-02",
      ip: "192.168.1.11",
      port: 9001,
      connected: true,
      discoveredSatellites: 7,
      lastActivity: now - 12000,
      chirpId: chirpId("ConstellationCLI.ops"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Listeners (stateless passive observers)
// ---------------------------------------------------------------------------

export function buildDemoListeners(now: number): Listener[] {
  return [
    {
      id: "lst-obs",
      name: "Observatory.main",
      kind: "Observatory",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 9100,
      connected: true,
      subscribedTopics: ["FSM", "CTRL", "DATA", "STAT", "UI"],
      subscriptionLevel: "DEBUG",
      lastActivity: now - 300,
      chirpId: chirpId("Observatory.main"),
    },
    {
      id: "lst-tc",
      name: "TelemetryConsole.live",
      kind: "TelemetryConsole",
      host: "lab-pc-02",
      ip: "192.168.1.11",
      port: 9101,
      connected: true,
      subscribedTopics: ["STAT", "FSM"],
      subscriptionLevel: "INFO",
      lastActivity: now - 1200,
      chirpId: chirpId("TelemetryConsole.live"),
    },
    {
      id: "lst-influx",
      name: "InfluxForwarder.ts",
      kind: "InfluxForwarder",
      host: "lab-pc-01",
      ip: "192.168.1.10",
      port: 9102,
      connected: true,
      subscribedTopics: ["STAT"],
      subscriptionLevel: "INFO",
      lastActivity: now - 800,
      chirpId: chirpId("InfluxForwarder.ts"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Per-satellite log sequences
// ---------------------------------------------------------------------------

export function buildSatelliteLogs(satName: string, now: number): LogEntry[] {
  const runStart = now - 45000;
  const run41End = now - 3200000;
  const run41Start = now - 3600000;

  type Row = [number, LogLevel, Protocol, string, CMDPTopic?];

  const sequences: Record<string, Row[]> = {
    "HighVoltage.hv1": [
      [
        now - 120000,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — HighVoltage.hv1 (C++/Sputnik) on 192.168.1.10:5555",
      ],
      [
        now - 119000,
        "STATUS",
        "CSCP",
        "← initialize received. Reply: SUCCESS. Entering INIT.",
        "CTRL",
      ],
      [
        now - 118500,
        "INFO",
        "CSCP",
        "Keithley SMU config: bias_voltage=100V, max_current=500μA, ramp_rate=10V/s",
        "CTRL",
      ],
      [
        now - 118000,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 117000,
        "STATUS",
        "CSCP",
        "← launch received. Ramping HV to 100V…",
        "CTRL",
      ],
      [
        now - 116000,
        "INFO",
        "CSCP",
        "HV ramp: 0V → 50V → 100V. Stabilised at 100.02V.",
        "CTRL",
      ],
      [
        now - 115500,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — state change INIT → ORBIT detected",
        "FSM",
      ],
      [
        run41Start + 200,
        "STATUS",
        "CDTP",
        "BOR received — run #41. Config snapshot written.",
        "DATA",
      ],
      [
        run41Start + 500,
        "STATUS",
        "CSCP",
        "← start received. Entering RUN.",
        "CTRL",
      ],
      [
        run41Start + 4000,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 31.2  STAT/CURRENT_UA = 487.6",
        "STAT",
      ],
      [
        run41End - 1000,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 33.8  STAT/CURRENT_UA = 484.1",
        "STAT",
      ],
      [
        run41End,
        "STATUS",
        "CDTP",
        "EOR received — run #41 complete. 12,841 events. Condition: DEGRADED.",
        "DATA",
      ],
      [
        run41End + 200,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — RUN → ORBIT after EOR",
        "FSM",
      ],
      [
        runStart,
        "STATUS",
        "CDTP",
        "BOR received — run #42. User tags: beam=120 GeV/c π⁺, detector=FEI4.",
        "DATA",
      ],
      [
        runStart + 200,
        "STATUS",
        "CSCP",
        "← start received. Entering RUN.",
        "CTRL",
      ],
      [
        runStart + 1500,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 34.7  STAT/CURRENT_UA = 482.3",
        "STAT",
      ],
      [
        now - 5000,
        "DEBUG",
        "CHP",
        "Heartbeat OK — state: RUN, lives: 3/3, interval: 1000ms",
      ],
      [
        now - 1000,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 36.1  STAT/CURRENT_UA = 481.8",
        "STAT",
      ],
    ],
    "H5DataWriter.h5w1": [
      [
        now - 120200,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — H5DataWriter.h5w1 (C++/Sputnik) on 192.168.1.10:5561",
      ],
      [
        now - 119100,
        "STATUS",
        "CSCP",
        "← initialize received. HDF5 v1.14, SWMR enabled, POSIX file locks active. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 118300,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 117200,
        "STATUS",
        "CSCP",
        "← launch received. Output: /data/runs/. Chunk: 1024. Compression: gzip.",
        "CTRL",
      ],
      [
        now - 115600,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        run41Start + 80,
        "STATUS",
        "CDTP",
        "BOR received — run #41. Created /data/runs/run41.h5 (SWMR). Analyst can read live.",
        "DATA",
      ],
      [
        run41Start + 300,
        "STATUS",
        "CSCP",
        "← start received. Recording.",
        "CTRL",
      ],
      [
        run41Start + 8000,
        "INFO",
        "CMDP",
        "STAT/WRITE_RATE_MB = 11.4  STAT/FILE_SIZE_MB = 42.8",
        "STAT",
      ],
      [
        run41End,
        "STATUS",
        "CDTP",
        "EOR received — run #41. 12,841 events. File finalised: run41.h5 (238 MB).",
        "DATA",
      ],
      [
        runStart + 30,
        "STATUS",
        "CDTP",
        "BOR received — run #42. Created /data/runs/run42.h5 (SWMR). Live read enabled.",
        "DATA",
      ],
      [
        runStart + 250,
        "STATUS",
        "CSCP",
        "← start received. Recording.",
        "CTRL",
      ],
      [
        now - 4000,
        "INFO",
        "CMDP",
        "STAT/WRITE_RATE_MB = 12.5  STAT/FILE_SIZE_MB = 87.3",
        "STAT",
      ],
      [now - 800, "DEBUG", "CHP", "Heartbeat OK — state: RUN, lives: 3/3"],
    ],
    "EudaqNativeWriter.eudw1": [
      [
        now - 120400,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — EudaqNativeWriter.eudw1 (C++/Sputnik) on 192.168.1.10:5562",
      ],
      [
        now - 119300,
        "STATUS",
        "CSCP",
        "← initialize received. EUDAQ2 native. write_as_blocks=true, newtic_event_tag=ThorlabDataEvent. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 118400,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 117300,
        "STATUS",
        "CSCP",
        "← launch received. Ready to write EUDAQ blocks.",
        "CTRL",
      ],
      [
        now - 115700,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        runStart + 60,
        "STATUS",
        "CDTP",
        "BOR received — run #42. eDAQ tags: ThorlabDataEvent, blocks=true. Output: run42.raw.",
        "DATA",
      ],
      [
        runStart + 280,
        "STATUS",
        "CSCP",
        "← start received. Recording EUDAQ blocks.",
        "CTRL",
      ],
      [
        now - 6000,
        "INFO",
        "CMDP",
        "STAT/WRITE_RATE_MB = 8.2  STAT/BLOCK_COUNT = 14089",
        "STAT",
      ],
      [now - 900, "DEBUG", "CHP", "Heartbeat OK — state: RUN, lives: 3/3"],
    ],
    "FlightRecorder.fr1": [
      [
        now - 120500,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — FlightRecorder.fr1 (C++/Sputnik) on 192.168.1.10:5556",
      ],
      [
        now - 119200,
        "STATUS",
        "CSCP",
        "← initialize received. output_dir=/data/runs, max_file_size_mb=1024. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 118100,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 117100,
        "STATUS",
        "CSCP",
        "← launch received. File handle opened. Ready to record.",
        "CTRL",
      ],
      [
        now - 115700,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        run41Start + 100,
        "STATUS",
        "CDTP",
        "BOR received — run #41. Snapshot: /data/runs/run41_bor.msgpack.",
        "DATA",
      ],
      [
        run41Start + 400,
        "STATUS",
        "CSCP",
        "← start received. Recording active.",
        "CTRL",
      ],
      [
        run41Start + 6000,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 39.5  STAT/WRITE_RATE_MB = 7.9",
        "STAT",
      ],
      [
        run41End - 500,
        "WARNING",
        "CDTP",
        "Run condition degraded — TempSensor.ts1 reported failure mid-run.",
        "DATA",
      ],
      [
        run41End,
        "STATUS",
        "CDTP",
        "EOR received — run #41. 12,841 events. Condition: DEGRADED. Duration: 400s.",
        "DATA",
      ],
      [
        run41End + 300,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — RUN → ORBIT after EOR",
        "FSM",
      ],
      [
        runStart + 50,
        "STATUS",
        "CDTP",
        "BOR received — run #42. Snapshot: /data/runs/run42_bor.msgpack.",
        "DATA",
      ],
      [
        runStart + 300,
        "STATUS",
        "CSCP",
        "← start received. Recording active.",
        "CTRL",
      ],
      [
        runStart + 5000,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 42.1  STAT/WRITE_RATE_MB = 8.4",
        "STAT",
      ],
      [
        now - 3000,
        "INFO",
        "CDTP",
        "14,392 events buffered. Write queue: 0. File size: 3.7 MB.",
        "DATA",
      ],
      [now - 500, "DEBUG", "CHP", "Heartbeat OK — state: RUN, lives: 3/3"],
    ],
    "RandomTransmitter.tx1": [
      [
        now - 121000,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — RandomTransmitter.tx1 (C++/Sputnik) on 192.168.1.11:5557",
      ],
      [
        now - 119500,
        "STATUS",
        "CSCP",
        "← initialize received. event_rate_hz=1000, payload=256B. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 118200,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 117200,
        "STATUS",
        "CSCP",
        "← launch received. PRNG seeded. Zero-copy allocator engaged.",
        "CTRL",
      ],
      [
        now - 115800,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        now - 115700,
        "INFO",
        "CMDP",
        "Data grouping active — payloads <1KB auto-buffered. Saturating 10G link with minimal CPU overhead.",
        "DATA",
      ],
      [
        run41Start + 150,
        "STATUS",
        "CDTP",
        "BOR received — run #41. TX at 800 Hz.",
        "DATA",
      ],
      [
        run41Start + 500,
        "STATUS",
        "CSCP",
        "← start received. Event loop active.",
        "CTRL",
      ],
      [
        run41End,
        "STATUS",
        "CDTP",
        "EOR received — run #41. Duration: 400s. TX avg: 798.2 Hz.",
        "DATA",
      ],
      [
        run41End + 200,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — RUN → ORBIT after EOR",
        "FSM",
      ],
      [
        runStart + 100,
        "STATUS",
        "CDTP",
        "BOR received — run #42. TX at 1000 Hz.",
        "DATA",
      ],
      [
        runStart + 400,
        "STATUS",
        "CSCP",
        "← start received. Event loop active.",
        "CTRL",
      ],
      [
        now - 8000,
        "WARNING",
        "CHP",
        "Missed heartbeat — lives: 2/3. Last HB 1847ms ago (threshold: 1500ms).",
      ],
      [
        now - 2000,
        "INFO",
        "CMDP",
        "STAT/CPU_LOAD = 58.2  STAT/TX_RATE_HZ = 998.4",
        "STAT",
      ],
      [
        now - 600,
        "DEBUG",
        "CHP",
        "Heartbeat recovered — state: RUN, lives: 2/3",
      ],
    ],
    "TempSensor.ts1": [
      [
        now - 122000,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — TempSensor.ts1 (Python/Mariner) on 192.168.1.20:5558",
      ],
      [
        now - 120800,
        "STATUS",
        "CSCP",
        "← initialize received. Lakeshore 218, 8 channels, RS-232 9600 baud. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 119800,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 2000ms (RPi reduced tick), maxLives: 3",
      ],
      [
        now - 118800,
        "STATUS",
        "CSCP",
        "← launch received. Sensor sampling active on 8 channels.",
        "CTRL",
      ],
      [
        now - 116500,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        run41Start + 200,
        "STATUS",
        "CDTP",
        "BOR received — run #41. Environment logging started.",
        "DATA",
      ],
      [run41Start + 600, "STATUS", "CSCP", "← start received.", "CTRL"],
      [
        run41Start + 30000,
        "WARNING",
        "CMDP",
        "Temperature spike: 41.3°C exceeded threshold 40°C. Alert on CMDP UI/ topic.",
        "UI",
      ],
      [
        run41Start + 35000,
        "CRITICAL",
        "CSCP",
        "Thermal alert unresolved. Entering SAFE state. HighVoltage.hv1 will autonomously ramp down via CHP observation.",
        "FSM",
      ],
      [
        run41End,
        "STATUS",
        "CDTP",
        "EOR received — run #41. Condition: DEGRADED (thermal fault). Duration: 400s.",
        "DATA",
      ],
      [
        run41End + 500,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — SAFE → ORBIT (recovered)",
        "FSM",
      ],
      [
        runStart + 150,
        "STATUS",
        "CDTP",
        "BOR received — run #42. Logging environment data.",
        "DATA",
      ],
      [runStart + 500, "STATUS", "CSCP", "← start received.", "CTRL"],
      [
        now - 10000,
        "INFO",
        "CMDP",
        "STAT/TEMPERATURE = 23.4°C  STAT/HUMIDITY = 41%",
        "STAT",
      ],
      [
        now - 4000,
        "WARNING",
        "CMDP",
        "Temperature rising: 38.2°C (threshold: 40°C). Monitoring.",
        "UI",
      ],
      [
        now - 700,
        "DEBUG",
        "CHP",
        "Heartbeat OK — state: RUN, lives: 3/3, interval: 2000ms",
      ],
    ],
    "DevNullReceiver.dnr1": [
      [
        now - 121500,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — DevNullReceiver.dnr1 (C++/Sputnik) on 192.168.1.11:5559",
      ],
      [
        now - 120200,
        "STATUS",
        "CSCP",
        "← initialize received. Buffer: 64MB. Role: NONE. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 119300,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 118300,
        "STATUS",
        "CSCP",
        "← launch received. Pausing — require_after: RandomTransmitter.tx1 must reach ORBIT.",
        "CTRL",
      ],
      [
        now - 116900,
        "INFO",
        "CSCP",
        "Dependency resolved: RandomTransmitter.tx1 reached ORBIT. Resuming launch.",
        "CTRL",
      ],
      [
        now - 116800,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        now - 40000,
        "INFO",
        "CSCP",
        "get_drop_count → 0 frames dropped. Reply: SUCCESS",
        "CTRL",
      ],
      [now - 10000, "WARNING", "CHP", "Lives: 2/3 — 1 missed heartbeat"],
      [now - 5200, "DEBUG", "CHP", "Heartbeat OK — state: ORBIT, lives: 2/3"],
      [
        now - 1200,
        "TRACE",
        "CHP",
        "Heartbeat: ORBIT, lives: 2/3, interval: 1000ms",
      ],
    ],
    "Mattermost.alerts": [
      [
        now - 120900,
        "INFO",
        "CHIRP",
        "CHIRP offer beacon sent — Mattermost.alerts (Python/Mariner) on 192.168.1.10:5560",
      ],
      [
        now - 119600,
        "STATUS",
        "CSCP",
        "← initialize received. webhook_url set, channel=#experiments. Reply: SUCCESS",
        "CTRL",
      ],
      [
        now - 118600,
        "INFO",
        "CHP",
        "CHP heartbeat publisher started — interval: 1000ms, maxLives: 3",
      ],
      [
        now - 117500,
        "STATUS",
        "CSCP",
        "← launch received. Webhook validated. Entering ORBIT.",
        "CTRL",
      ],
      [
        now - 116200,
        "INFO",
        "CHP",
        "⚡ Extrasystole emitted — INIT → ORBIT",
        "FSM",
      ],
      [
        now - 20000,
        "WARNING",
        "CSCP",
        "Webhook POST failed: connection refused. Retrying in 5s…",
        "CTRL",
      ],
      [
        now - 15000,
        "WARNING",
        "CSCP",
        "Webhook POST failed (attempt 2/3). Retrying…",
        "CTRL",
      ],
      [
        now - 10000,
        "CRITICAL",
        "CSCP",
        "Webhook unreachable after 3 retries. Entering ERROR. Reply: INCOMPLETE",
        "FSM",
      ],
      [
        now - 8000,
        "CRITICAL",
        "CHP",
        "⚡ Extrasystole emitted — ORBIT → ERROR. Lives: 1/3",
        "FSM",
      ],
      [
        now - 3000,
        "WARNING",
        "CSCP",
        "Recovery attempted: webhook still unreachable. Remaining in ERROR.",
        "CTRL",
      ],
      [
        now - 500,
        "TRACE",
        "CHP",
        "Heartbeat: ERROR, lives: 1/3, interval: 1000ms",
      ],
    ],
  };

  const seq: Row[] = sequences[satName] ?? [];
  return seq.map(([time, level, protocol, message, topic], i) => ({
    id: `satlog-${satName.replace(/\./g, "-")}-${i}`,
    time,
    level,
    protocol,
    satellite: satName,
    component: satName.includes(".") ? satName.split(".")[0] : satName,
    message,
    topic,
    isExtrasystole: message.includes("⚡") || message.includes("Extrasystole"),
    isBOR: message.startsWith("BOR") && protocol === "CDTP",
    isEOR: message.startsWith("EOR") && protocol === "CDTP",
  }));
}

// ---------------------------------------------------------------------------
// Aggregated log stream
// ---------------------------------------------------------------------------

export function buildDemoLogs(now: number): LogEntry[] {
  const satNames = [
    "HighVoltage.hv1",
    "H5DataWriter.h5w1",
    "EudaqNativeWriter.eudw1",
    "FlightRecorder.fr1",
    "RandomTransmitter.tx1",
    "TempSensor.ts1",
    "DevNullReceiver.dnr1",
  ];
  const runStart = now - 45000;

  const controllerEntries: LogEntry[] = [
    {
      id: "ctrl-0",
      time: now - 119800,
      level: "INFO",
      protocol: "CSCP",
      satellite: "MissionControl.main",
      component: "Controller",
      message: 'Broadcast "initialize" → 7 satellites. All replied SUCCESS.',
      topic: "CTRL",
    },
    {
      id: "ctrl-1",
      time: now - 117300,
      level: "INFO",
      protocol: "CSCP",
      satellite: "MissionControl.main",
      component: "Controller",
      message: 'All ACK. Broadcasting "launch"…',
      topic: "CTRL",
    },
    {
      id: "ctrl-dep",
      time: now - 116950,
      level: "INFO",
      protocol: "CSCP",
      satellite: "MissionControl.main",
      component: "Controller",
      message:
        "DevNullReceiver.dnr1 pausing — require_after: RandomTransmitter.tx1 must reach ORBIT.",
      topic: "CTRL",
    },
    {
      id: "ctrl-2",
      time: now - 115200,
      level: "STATUS",
      protocol: "CHIRP",
      satellite: "MissionControl.main",
      component: "Controller",
      message:
        "All 7 satellites ORBIT. Dependency graph resolved. Ready for run.",
      topic: "FSM",
    },
    {
      id: "ctrl-3",
      time: runStart - 100,
      level: "STATUS",
      protocol: "CDTP",
      satellite: "MissionControl.main",
      component: "Controller",
      message:
        "BOR broadcast — run #42. User tags: beam=120 GeV/c π⁺, detector=FEI4 quad module.",
      topic: "DATA",
    },
    {
      id: "ctrl-4",
      time: runStart + 50,
      level: "INFO",
      protocol: "CSCP",
      satellite: "MissionControl.main",
      component: "Controller",
      message: 'Broadcast "start" → 6 active + 2 data receivers.',
      topic: "CTRL",
    },
  ];

  const listenerEntries: LogEntry[] = [
    {
      id: "lst-0",
      time: now - 119900,
      level: "INFO",
      protocol: "CHIRP",
      satellite: "Observatory.main",
      component: "Listener",
      message:
        "CHIRP offer — Observatory subscribing to all CMDP topics (source-side filter: DEBUG+).",
    },
    {
      id: "lst-1",
      time: now - 119850,
      level: "INFO",
      protocol: "CHIRP",
      satellite: "InfluxForwarder.ts",
      component: "Listener",
      message:
        "CHIRP offer — InfluxForwarder subscribing to STAT topics → InfluxDB (source-side filter: INFO+).",
    },
    {
      id: "lst-2",
      time: now - 5000,
      level: "DEBUG",
      protocol: "CMDP",
      satellite: "InfluxForwarder.ts",
      component: "Listener",
      message: "Forwarded 847 STAT/ datapoints to InfluxDB in last 60s.",
      topic: "STAT",
    },
  ];

  const satEntries = satNames.flatMap((name) => buildSatelliteLogs(name, now));
  return [...satEntries, ...controllerEntries, ...listenerEntries].sort(
    (a, b) => a.time - b.time,
  );
}

// ---------------------------------------------------------------------------
// Run records — BOR user tags + eDAQ tags
// ---------------------------------------------------------------------------

export function buildDemoRuns(now: number): RunRecord[] {
  return [
    {
      id: "run-42",
      runNumber: 42,
      startTime: now - 45000,
      endTime: now - 2000,
      runIdentifier: {
        label: "TB24 beam test with new FEI4 sensor",
        sequence: 42,
      },
      condition: "GOOD",
      satellites: [
        "HighVoltage.hv1",
        "H5DataWriter.h5w1",
        "EudaqNativeWriter.eudw1",
        "FlightRecorder.fr1",
        "RandomTransmitter.tx1",
        "TempSensor.ts1",
      ],
      eventCount: 14392,
      borConfig: {
        "HighVoltage.hv1": {
          bias_voltage: 100,
          max_current_ua: 500,
          ramp_rate_v_s: 10,
        },
        "H5DataWriter.h5w1": { swmr_mode: true, output: "/data/runs/run42.h5" },
        "EudaqNativeWriter.eudw1": {
          write_as_blocks: true,
          newtic_event_tag: "ThorlabDataEvent",
        },
        "RandomTransmitter.tx1": {
          event_rate_hz: 1000,
          payload_size_bytes: 256,
          data_grouping_threshold_bytes: 1024,
        },
      },
      borUserTags: {
        beamMomentum: "120 GeV/c π⁺",
        detectorPrototype: "FEI4 quad module",
        testStand: "TB24-North",
      },
      borEdaqTags: { newticEventTag: "ThorlabDataEvent", writeAsBlocks: true },
      eorMeta: {
        duration_s: 45,
        total_events: 14392,
        condition: "GOOD",
        time_start: now - 45000,
        time_end: now - 2000,
      },
      eorMetrics: null,
      license: "ODC-By-1.0",
    },
    {
      id: "run-41",
      runNumber: 41,
      startTime: now - 3600000,
      endTime: now - 3200000,
      runIdentifier: { label: "TB24 thermal stress test", sequence: 41 },
      condition: "DEGRADED",
      satellites: [
        "HighVoltage.hv1",
        "H5DataWriter.h5w1",
        "FlightRecorder.fr1",
        "RandomTransmitter.tx1",
        "TempSensor.ts1",
      ],
      eventCount: 12841,
      borConfig: {
        "HighVoltage.hv1": { bias_voltage: 95, max_current_ua: 500 },
        "H5DataWriter.h5w1": { swmr_mode: true, output: "/data/runs/run41.h5" },
        "RandomTransmitter.tx1": {
          event_rate_hz: 800,
          payload_size_bytes: 256,
        },
      },
      borUserTags: {
        beamMomentum: "120 GeV/c π⁺",
        detectorPrototype: "FEI4 quad module",
      },
      borEdaqTags: { newticEventTag: "ThorlabDataEvent", writeAsBlocks: true },
      eorMeta: {
        duration_s: 400,
        total_events: 12841,
        condition: "DEGRADED",
        failed_satellites: ["TempSensor.ts1"],
        time_start: now - 3600000,
        time_end: now - 3200000,
      },
      eorMetrics: {
        "HighVoltage.hv1": {
          CPU_LOAD: genPoints(30, 31, 5, now - 3200000),
          CURRENT_UA: genPoints(30, 487, 8, now - 3200000),
        },
        "H5DataWriter.h5w1": {
          CPU_LOAD: genPoints(30, 38, 4, now - 3200000),
          WRITE_RATE_MB: genPoints(30, 11.2, 1.2, now - 3200000),
        },
        "FlightRecorder.fr1": {
          CPU_LOAD: genPoints(30, 40, 6, now - 3200000),
          WRITE_RATE_MB: genPoints(30, 8.1, 0.6, now - 3200000),
        },
        "RandomTransmitter.tx1": {
          CPU_LOAD: genPoints(30, 54, 8, now - 3200000),
          TX_RATE_HZ: genPoints(30, 796, 15, now - 3200000),
        },
        "TempSensor.ts1": {
          TEMPERATURE: genPoints(30, 38, 2.5, now - 3200000),
          HUMIDITY: genPoints(30, 43, 2, now - 3200000),
        },
      },
      license: "ODC-By-1.0",
    },
    {
      id: "run-40",
      runNumber: 40,
      startTime: now - 7200000,
      endTime: now - 6800000,
      runIdentifier: { label: "TB24 baseline measurement", sequence: 40 },
      condition: "GOOD",
      satellites: [
        "HighVoltage.hv1",
        "H5DataWriter.h5w1",
        "FlightRecorder.fr1",
        "RandomTransmitter.tx1",
      ],
      eventCount: 18203,
      borConfig: {
        "HighVoltage.hv1": { bias_voltage: 100, max_current_ua: 500 },
        "H5DataWriter.h5w1": { swmr_mode: true, output: "/data/runs/run40.h5" },
        "RandomTransmitter.tx1": {
          event_rate_hz: 1000,
          payload_size_bytes: 256,
        },
      },
      borUserTags: {
        beamMomentum: "120 GeV/c π⁺",
        detectorPrototype: "FEI4 quad module",
      },
      eorMeta: {
        duration_s: 400,
        total_events: 18203,
        condition: "GOOD",
        failed_satellites: [],
        time_start: now - 7200000,
        time_end: now - 6800000,
      },
      eorMetrics: {
        "HighVoltage.hv1": {
          CPU_LOAD: genPoints(30, 33, 4, now - 6800000),
          CURRENT_UA: genPoints(30, 492, 7, now - 6800000),
        },
        "H5DataWriter.h5w1": {
          CPU_LOAD: genPoints(30, 36, 3, now - 6800000),
          WRITE_RATE_MB: genPoints(30, 12.1, 0.9, now - 6800000),
        },
        "FlightRecorder.fr1": {
          CPU_LOAD: genPoints(30, 44, 5, now - 6800000),
          WRITE_RATE_MB: genPoints(30, 9.2, 0.5, now - 6800000),
        },
        "RandomTransmitter.tx1": {
          CPU_LOAD: genPoints(30, 60, 7, now - 6800000),
          TX_RATE_HZ: genPoints(30, 999, 5, now - 6800000),
        },
      },
      license: "ODC-By-1.0",
    },
    {
      id: "run-39",
      runNumber: 39,
      startTime: now - 10800000,
      endTime: now - 10650000,
      runIdentifier: { label: "TB24 calibration (aborted)", sequence: 39 },
      condition: "INCOMPLETE",
      satellites: [
        "HighVoltage.hv1",
        "H5DataWriter.h5w1",
        "FlightRecorder.fr1",
      ],
      eventCount: 3210,
      borConfig: {
        "HighVoltage.hv1": { bias_voltage: 100, max_current_ua: 500 },
        "H5DataWriter.h5w1": { swmr_mode: true, output: "/data/runs/run39.h5" },
      },
      borUserTags: {
        beamMomentum: "80 GeV/c π⁻",
        detectorPrototype: "FEI4 quad module",
      },
      eorMeta: {
        duration_s: 150,
        total_events: 3210,
        condition: "INCOMPLETE",
        abort_reason: "HighVoltage.hv1 entered ERROR state",
        time_start: now - 10800000,
        time_end: now - 10650000,
      },
      eorMetrics: {
        "HighVoltage.hv1": {
          CPU_LOAD: genPoints(10, 28, 3, now - 10650000),
          CURRENT_UA: genPoints(10, 503, 15, now - 10650000),
        },
        "H5DataWriter.h5w1": {
          CPU_LOAD: genPoints(10, 35, 3, now - 10650000),
          WRITE_RATE_MB: genPoints(10, 10.4, 0.8, now - 10650000),
        },
        "FlightRecorder.fr1": {
          CPU_LOAD: genPoints(10, 37, 4, now - 10650000),
          WRITE_RATE_MB: genPoints(10, 6.8, 0.4, now - 10650000),
        },
      },
      license: "ODC-By-1.0",
    },
  ];
}

// ---------------------------------------------------------------------------
// Project 2: ATLAS-CalibRun — ready to launch, all satellites in INIT
// ---------------------------------------------------------------------------

export function buildDemoSatellitesP2(now: number): Satellite[] {
  return [
    {
      id: "sat-atlas-daq1",
      name: "DAQBoard.daq1",
      type: "DAQBoard",
      instance: "daq1",
      host: "atlas-srv-01",
      ip: "192.168.1.11",
      port: 6001,
      state: "INIT",
      status:
        "DAQ board ready — registers verified, clock synchronization nominal.",
      role: "ESSENTIAL",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 500,
      lastHeartbeat: now,
      lastStateChange: now - 9000,
      extrasystole: false,
      config: { bufferSize: 8192, rate_hz: 100 },
      availableCommands: ["initialize", "interrupt"],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("DAQBoard.daq1", "atlas-daq"),
      dependencies: [],
    },
    {
      id: "sat-atlas-h5w1",
      name: "H5DataWriter.atlas1",
      type: "H5DataWriter",
      instance: "atlas1",
      host: "atlas-srv-01",
      ip: "192.168.1.11",
      port: 6002,
      state: "INIT",
      status:
        "HDF5 writer ready — output directory mounted, SWMR mode available.",
      role: "ESSENTIAL",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 500,
      lastHeartbeat: now,
      lastStateChange: now - 7500,
      extrasystole: false,
      config: { compression: "gzip-4", chunking: true },
      availableCommands: ["initialize", "interrupt"],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("H5DataWriter.atlas1", "atlas-daq"),
      dependencies: [],
    },
    {
      id: "sat-atlas-env1",
      name: "SlowControl.env1",
      type: "SlowControl",
      instance: "env1",
      host: "atlas-srv-02",
      ip: "192.168.1.12",
      port: 6003,
      state: "INIT",
      status:
        "Slow-control ready — RS-485 bus enumerated, 12 sensor channels online.",
      role: "DYNAMIC",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now,
      lastStateChange: now - 5000,
      extrasystole: false,
      config: { sampleInterval_ms: 5000 },
      availableCommands: ["initialize", "interrupt"],
      metrics: genMetrics(now),
      language: "Python",
      template: "Mariner",
      chirpId: chirpId("SlowControl.env1", "atlas-daq"),
      dependencies: [],
    },
    {
      id: "sat-atlas-tlu1",
      name: "TriggerLogic.tlu1",
      type: "TriggerLogic",
      instance: "tlu1",
      host: "atlas-srv-02",
      ip: "192.168.1.12",
      port: 6004,
      state: "INIT",
      status:
        "Trigger logic ready — threshold 45 mV configured, awaiting initialization.",
      role: "DYNAMIC",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 500,
      lastHeartbeat: now,
      lastStateChange: now - 3000,
      extrasystole: false,
      config: { threshold_mV: 45, prescale: 1 },
      availableCommands: ["initialize", "interrupt"],
      metrics: genMetrics(now),
      language: "C++",
      template: "Sputnik",
      chirpId: chirpId("TriggerLogic.tlu1", "atlas-daq"),
      dependencies: [],
    },
    {
      id: "sat-mm",
      name: "Mattermost.alerts",
      type: "Mattermost",
      instance: "alerts",
      host: "atlas-srv-00",
      ip: "192.168.1.10",
      port: 5560,
      state: "INIT",
      status:
        "Notification service ready — webhook configured, channel #experiments.",
      role: "TRANSIENT",
      lives: 3,
      maxLives: 3,
      heartbeatInterval: 1000,
      lastHeartbeat: now,
      lastStateChange: now - 2000,
      extrasystole: false,
      config: {
        webhook_url: "${MATTERMOST_WEBHOOK}",
        channel: "#experiments",
        level_filter: "WARNING",
      },
      availableCommands: ["initialize", "interrupt"],
      metrics: genMetrics(now),
      language: "Python",
      template: "Mariner",
      chirpId: chirpId("Mattermost.alerts", "atlas-daq"),
      dependencies: [],
    },
  ];
}

export function buildDemoControllersP2(now: number): Controller[] {
  return [
    {
      id: "ctrl-atlas-mc",
      name: "MissionControl.atlas",
      host: "atlas-srv-00",
      ip: "192.168.1.10",
      port: 5555,
      connected: true,
      discoveredSatellites: 5,
      lastActivity: now,
      chirpId: chirpId("MissionControl.atlas", "atlas-daq"),
    },
  ];
}

export function buildDemoListenersP2(now: number): Listener[] {
  return [
    {
      id: "list-atlas-obs",
      name: "Observatory.atlas",
      host: "atlas-srv-00",
      ip: "192.168.1.10",
      port: 5556,
      connected: true,
      subscribedTopics: ["DATA"],
      subscriptionLevel: "INFO",
      lastActivity: now,
      kind: "Observatory",
      chirpId: chirpId("Observatory.atlas", "atlas-daq"),
    },
  ];
}

export function buildDemoLogsP2(now: number): LogEntry[] {
  return [
    {
      id: "log-p2-1",
      time: now - 420000,
      level: "STATUS",
      protocol: "CHP",
      satellite: "MissionControl.atlas",
      component: "MissionControl",
      topic: "FSM",
      message:
        "BOR: All 4 core satellites transitioned to RUN. Calibration run 15 started.",
    },
    {
      id: "log-p2-2",
      time: now - 415000,
      level: "INFO",
      protocol: "CHP",
      satellite: "H5DataWriter.atlas1",
      component: "H5DataWriter",
      topic: "DATA",
      message:
        "HDF5 file opened: calib_run_15.h5 — SWMR mode active, chunk size 1024.",
    },
    {
      id: "log-p2-3",
      time: now - 400000,
      level: "WARNING",
      protocol: "CHP",
      satellite: "Mattermost.alerts",
      component: "Mattermost",
      topic: "STAT",
      message:
        "Webhook POST failed (HTTP 503). Role TRANSIENT — retrying in 60 s.",
    },
    {
      id: "log-p2-4",
      time: now - 300000,
      level: "STATUS",
      protocol: "CMDP",
      satellite: "DAQBoard.daq1",
      component: "DAQBoard",
      topic: "STAT",
      message:
        "HV scan: 25/100 points complete (625 V). Rate stable at 9.4 M ev/min.",
    },
    {
      id: "log-p2-5",
      time: now - 180000,
      level: "INFO",
      protocol: "CMDP",
      satellite: "SlowControl.env1",
      component: "SlowControl",
      topic: "STAT",
      message:
        "Temperature excursion +0.08°C at 13:47 — within tolerance, logged.",
    },
    {
      id: "log-p2-6",
      time: now - 90000,
      level: "STATUS",
      protocol: "CMDP",
      satellite: "TriggerLogic.tlu1",
      component: "TriggerLogic",
      topic: "STAT",
      message: "Trigger efficiency 99.8% — no dead-time events, rate 4.2 kHz.",
    },
    {
      id: "log-p2-7",
      time: now - 30000,
      level: "DEBUG",
      protocol: "CHP",
      satellite: "H5DataWriter.atlas1",
      component: "H5DataWriter",
      topic: "DATA",
      message: "Flushed 4096 events. Total written: 3.7 GB. Throughput 97.1%.",
    },
    {
      id: "log-p2-8",
      time: now - 5000,
      level: "STATUS",
      protocol: "CMDP",
      satellite: "DAQBoard.daq1",
      component: "DAQBoard",
      topic: "STAT",
      message:
        "HV scan: 47/100 points (1175 V). Acquisition running, buffer at 31%.",
    },
  ];
}

export function buildDemoRunsP2(now: number): RunRecord[] {
  const atlasSatellites = [
    "DAQBoard.daq1",
    "H5DataWriter.atlas1",
    "SlowControl.env1",
    "TriggerLogic.tlu1",
  ];
  return [
    {
      id: "run-atlas-14",
      runNumber: 14,
      startTime: now - 3600000,
      endTime: now - 1800000,
      condition: "GOOD",
      runIdentifier: {
        label: "Calibration run — HV linearity scan 0–2500V, 100 points",
        sequence: 14,
      },
      satellites: [...atlasSatellites],
      eventCount: 8120000,
      borConfig: {
        "DAQBoard.daq1": { rate_hz: 100, trigger_mode: "physics" },
        "H5DataWriter.atlas1": {
          swmr_mode: true,
          output: "/data/atlas/run14.h5",
        },
      },
      borUserTags: { beamType: "e+", energy_gev: 10 },
      borEdaqTags: {
        newticEventTag: "ATLASCalibEvent",
        writeAsBlocks: false,
      },
      eorMeta: {
        duration_s: 1800,
        total_events: 8120000,
        condition: "GOOD",
        abort_reason: null,
        time_start: now - 3600000,
        time_end: now - 1800000,
      },
      eorMetrics: buildRunMetrics(now - 1800000, atlasSatellites),
      license: "CC-BY-4.0",
    },
    {
      id: "run-atlas-13",
      runNumber: 13,
      startTime: now - 7200000,
      endTime: now - 5400000,
      condition: "GOOD",
      runIdentifier: {
        label: "Pedestal run — baseline measurement, 1M events",
        sequence: 13,
      },
      satellites: [...atlasSatellites],
      eventCount: 1000000,
      borConfig: {
        "DAQBoard.daq1": { rate_hz: 100, trigger_mode: "pedestal" },
        "H5DataWriter.atlas1": {
          swmr_mode: true,
          output: "/data/atlas/run13.h5",
        },
      },
      borUserTags: { runType: "PEDESTAL" },
      borEdaqTags: {
        newticEventTag: "ATLASPedestalEvent",
        writeAsBlocks: true,
      },
      eorMeta: {
        duration_s: 1800,
        total_events: 1000000,
        condition: "GOOD",
        abort_reason: null,
        time_start: now - 7200000,
        time_end: now - 5400000,
      },
      eorMetrics: buildRunMetrics(now - 5400000, atlasSatellites),
      license: "CC-BY-4.0",
    },
  ];
}
