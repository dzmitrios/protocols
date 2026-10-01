import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from "livekit-client";
import { readIce, type IceSnapshot } from "./ice";

const tokenUrl = "http://localhost:3001/get-token";

type ParticipantRow = {
  identity: string;
  isLocal: boolean;
  isSpeaking: boolean;
};

type VoiceSnapshot = {
  connection: ConnectionLabel;
  ice: IceSnapshot;
  micPublished: boolean;
  micEnabled: boolean;
  participants: ParticipantRow[];
  remoteTracks: RemoteTrack[];
};

type ConnectionLabel = "connecting" | "connected" | "reconnecting" | "disconnected";

const unknownIce: IceSnapshot = { publish: "unknown", subscribe: "unknown" };

const idleSnapshot: VoiceSnapshot = {
  connection: "disconnected",
  ice: unknownIce,
  micPublished: false,
  micEnabled: false,
  participants: [],
  remoteTracks: [],
};

function connectionLabel(state: ConnectionState): ConnectionLabel {
  switch (state) {
    case ConnectionState.Connecting:
      return "connecting";
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return "reconnecting";
    default:
      return "disconnected";
  }
}

function snapshotFromRoom(room: Room, ice: IceSnapshot): VoiceSnapshot {
  const participants = new Map<string, ParticipantRow>();
  const local = room.localParticipant;
  participants.set(local.identity, {
    identity: local.identity,
    isLocal: true,
    isSpeaking: local.isSpeaking,
  });
  room.remoteParticipants.forEach((participant) => {
    if (participants.has(participant.identity)) {
      return;
    }
    participants.set(participant.identity, {
      identity: participant.identity,
      isLocal: false,
      isSpeaking: participant.isSpeaking,
    });
  });

  const remoteTracks: RemoteTrack[] = [];
  room.remoteParticipants.forEach((participant) => {
    participant.audioTrackPublications.forEach((publication) => {
      if (publication.track && publication.source === Track.Source.Microphone) {
        remoteTracks.push(publication.track);
      }
    });
  });

  const microphone = local.getTrackPublication(Track.Source.Microphone);

  return {
    connection: connectionLabel(room.state),
    ice,
    micPublished: Boolean(microphone?.track),
    micEnabled: local.isMicrophoneEnabled,
    participants: Array.from(participants.values()),
    remoteTracks,
  };
}

async function requestToken(roomName: string, participantName: string) {
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName, participantName }),
    });
  } catch {
    throw new Error("Сервер токенов недоступен");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Ошибка ${response.status}`;
    throw new Error(message);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("token" in body) ||
    !("url" in body) ||
    typeof body.token !== "string" ||
    typeof body.url !== "string"
  ) {
    throw new Error("Сервер токенов вернул неожиданный ответ");
  }

  return { token: body.token, url: body.url };
}

function RemoteAudio({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    track.attach(element);
    void element.play().catch(() => undefined);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return <audio ref={ref} autoPlay data-remote-audio={track.sid} />;
}

export function App() {
  const roomRef = useRef<Room | null>(null);
  const [roomName, setRoomName] = useState("study");
  const [participantName, setParticipantName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceSnapshot>(idleSnapshot);
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !inRoom) {
      return;
    }

    let cancelled = false;
    const publishIce = async () => {
      const ice = await readIce(room);
      if (!cancelled) {
        setVoice((current) => ({ ...current, ice }));
      }
    };

    void publishIce();
    const timer = window.setInterval(() => {
      void publishIce();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [inRoom, voice.connection]);

  function bind(room: Room) {
    const refresh = () => {
      setVoice((current) => snapshotFromRoom(room, current.ice));
    };
    const events = [
      RoomEvent.ConnectionStateChanged,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
    ] as const;
    const onDisconnected = () => {
      if (roomRef.current !== room) {
        return;
      }
      roomRef.current = null;
      setInRoom(false);
      setJoining(false);
      setVoice(idleSnapshot);
    };
    events.forEach((event) => room.on(event, refresh));
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      events.forEach((event) => room.off(event, refresh));
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (joining || roomRef.current) {
      return;
    }

    setError(null);
    setJoining(true);
    const room = new Room({ singlePeerConnection: false });
    roomRef.current = room;
    const unbind = bind(room);

    try {
      const access = await requestToken(roomName, participantName);
      setVoice((current) => ({ ...current, connection: "connecting" }));
      await room.connect(access.url, access.token);
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setError("Браузер не дал доступ к микрофону. Комната остаётся подключённой.");
      }
      setInRoom(true);
      setVoice(snapshotFromRoom(room, unknownIce));
    } catch (joinError) {
      unbind();
      await room.disconnect();
      roomRef.current = null;
      setInRoom(false);
      setVoice(idleSnapshot);
      setError(joinError instanceof Error ? joinError.message : "Не удалось войти");
    } finally {
      setJoining(false);
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) {
      return;
    }
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    setVoice((current) => snapshotFromRoom(room, current.ice));
  }

  async function leave() {
    const room = roomRef.current;
    setError(null);
    if (!room) {
      setInRoom(false);
      setVoice(idleSnapshot);
      return;
    }
    await room.disconnect();
  }

  return (
    <main className="app">
      <h1>Голосовая комната</h1>
      <p className="lede">Соединение, ICE и микрофон видны прямо на странице.</p>

      <section className="panel">
        <h2>Вход</h2>
        <form className="join" onSubmit={(event) => void join(event)}>
          <label>
            <span>Комната</span>
            <input
              name="room"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              autoComplete="off"
              disabled={inRoom || joining}
            />
          </label>
          <label>
            <span>Имя</span>
            <input
              name="participant"
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              autoComplete="off"
              disabled={inRoom || joining}
            />
          </label>
          <div className="actions">
            <button type="submit" disabled={inRoom || joining}>
              {joining ? "Входим…" : "Войти"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void toggleMute()}
              disabled={!inRoom}
              data-muted={voice.micEnabled ? "false" : "true"}
            >
              {voice.micEnabled ? "Заглушить" : "Включить микрофон"}
            </button>
            <button type="button" className="secondary" onClick={() => void leave()} disabled={!inRoom}>
              Выйти
            </button>
          </div>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel" aria-label="Соединение">
        <h2>Соединение</h2>
        <dl className="stats">
          <dt>Состояние</dt>
          <dd className={`connection-${voice.connection}`} data-connection-state={voice.connection}>
            {voice.connection}
          </dd>
          <dt>ICE публикация</dt>
          <dd data-ice-publish={voice.ice.publish}>{voice.ice.publish}</dd>
          <dt>ICE подписка</dt>
          <dd data-ice-subscribe={voice.ice.subscribe}>{voice.ice.subscribe}</dd>
          <dt>Микрофон</dt>
          <dd data-mic-published={voice.micPublished ? "true" : "false"}>
            {voice.micPublished ? "опубликован" : "не опубликован"}
          </dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Участники</h2>
        {voice.participants.length === 0 ? (
          <p className="empty">Пока никого нет.</p>
        ) : (
          <ul className="participants">
            {voice.participants.map((participant) => (
              <li
                key={participant.identity}
                data-identity={participant.identity}
                data-local={participant.isLocal ? "true" : "false"}
                data-speaking={participant.isSpeaking ? "true" : "false"}
              >
                <span>{participant.identity}</span>
                {participant.isLocal ? <span className="you">вы</span> : null}
                {participant.isSpeaking ? <span className="speaking-mark">говорит</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="remote-audio">
        {voice.remoteTracks.map((track) => (
          <RemoteAudio key={track.sid} track={track} />
        ))}
      </div>
    </main>
  );
}
