## 1. Local LiveKit

- [x] 1.1 Add `LiveKit/docker-compose.yml` for `livekit/livekit-server` with `--dev --bind 0.0.0.0` and published ports 7880/tcp, 7881/tcp, and 7882/udp, and verify `docker compose config` lists those ports

## 2. Token server

- [x] 2.1 Create the `LiveKit/server` TypeScript package with Express, `@types/express`, and `livekit-server-sdk`, run it in development with `tsx`, and verify dependency installation and `tsc --noEmit` succeed
- [x] 2.2 Implement `POST /get-token` using `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`, returning `{ token, url }` whose identity is the participant name and whose grant allows join, publish, and subscribe in that room only, and verify a valid body returns a token and the configured URL without the signing secret
- [x] 2.3 Reject a missing or blank `roomName` or `participantName` with HTTP 400 and no token, and verify both cases by request
- [x] 2.4 Allow the Vite origin through CORS, and verify a cross-origin token request from that origin is accepted

## 3. Web client join

- [x] 3.1 Create the `LiveKit/web` package with Vite, React, TypeScript, and `livekit-client`, and verify the dev server starts and `tsc --noEmit` succeeds
- [x] 3.2 Add the join form for room name and participant name, call `POST /get-token`, and verify a failed token response leaves the client disconnected and shows the error
- [x] 3.3 On a successful token, connect a `Room` to the returned URL and enable the microphone from the join action, and verify the connection state reaches connected while LiveKit is running

## 4. Connection inspector

- [x] 4.1 Show the connection state as `connecting`, `connected`, `reconnecting`, or `disconnected`, and verify the panel updates when the room state changes
- [x] 4.2 Read the selected local ICE candidate type from `getStats()` for the publisher and subscriber peer connections and show `host`, `srflx`, `relay`, or `unknown`, and verify `unknown` before a selected pair exists and a concrete type after connect
- [x] 4.3 Show whether the local microphone track is published, including a denied microphone permission that leaves the room connected, and verify the panel matches the publication state

## 5. Voice room controls

- [x] 5.1 List the local participant and remote participants with one row per identity and a speaking marker, and verify a second participant appears and the same identity stays a single row
- [x] 5.2 Play remote microphone tracks, and verify remote audio is heard while connected and the remote microphone is unmuted
- [x] 5.3 Mute and unmute the local microphone without leaving the room, and verify the control shows the muted state and mute stops sending audio
- [x] 5.4 Leave the room by disconnecting, and verify the connection state becomes `disconnected`

## 6. Two-session check

- [x] 6.1 Run Compose, the token server, and the web app together, join one room from two browser sessions with different names, and verify both participants are listed, the inspector shows `connected` and an ICE type, mute does not drop the room, and leave disconnects that session
