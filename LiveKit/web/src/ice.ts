import type { Room } from "livekit-client";

export type IceType = "host" | "srflx" | "relay" | "unknown";

export type IceSnapshot = {
  publish: IceType;
  subscribe: IceType;
};

const knownTypes = new Set<IceType>(["host", "srflx", "relay"]);

function asIceType(value: unknown): IceType {
  return typeof value === "string" && knownTypes.has(value as IceType)
    ? (value as IceType)
    : "unknown";
}

function localCandidateId(stats: RTCStatsReport): string | undefined {
  for (const report of stats.values()) {
    if (report.type !== "transport" || !("selectedCandidatePairId" in report)) {
      continue;
    }
    const pairId = report.selectedCandidatePairId;
    if (typeof pairId !== "string") {
      continue;
    }
    const pair = stats.get(pairId);
    if (pair && "localCandidateId" in pair && typeof pair.localCandidateId === "string") {
      return pair.localCandidateId;
    }
  }

  for (const report of stats.values()) {
    if (
      report.type === "candidate-pair" &&
      "selected" in report &&
      report.selected === true &&
      "localCandidateId" in report &&
      typeof report.localCandidateId === "string"
    ) {
      return report.localCandidateId;
    }
  }

  return undefined;
}

export function iceTypeFromReport(stats: RTCStatsReport): IceType {
  const candidateId = localCandidateId(stats);
  if (!candidateId) {
    return "unknown";
  }
  const local = stats.get(candidateId);
  if (!local || local.type !== "local-candidate" || !("candidateType" in local)) {
    return "unknown";
  }
  return asIceType(local.candidateType);
}

async function iceTypeOf(
  stats: Promise<RTCStatsReport> | undefined,
): Promise<IceType> {
  if (!stats) {
    return "unknown";
  }
  try {
    return iceTypeFromReport(await stats);
  } catch {
    return "unknown";
  }
}

export async function readIce(room: Room): Promise<IceSnapshot> {
  const manager = room.engine.pcManager;
  const [publish, subscribe] = await Promise.all([
    iceTypeOf(manager?.publisher.getStats()),
    iceTypeOf(manager?.subscriber?.getStats()),
  ]);
  return { publish, subscribe };
}
