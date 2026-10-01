import cors from "cors";
import express, { type Request, type Response } from "express";
import { AccessToken } from "livekit-server-sdk";

const port = Number(process.env.PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const apiKey = process.env.LIVEKIT_API_KEY ?? "devkey";
const apiSecret = process.env.LIVEKIT_API_SECRET ?? "secret";
const livekitUrl = process.env.LIVEKIT_URL ?? "ws://localhost:7880";

const app = express();
app.use(cors({ origin: webOrigin }));
app.use(express.json());

type TokenBody = {
  roomName?: unknown;
  participantName?: unknown;
};

function requiredName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

app.post("/get-token", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as TokenBody;
  const roomName = requiredName(body.roomName);
  const participantName = requiredName(body.participantName);

  if (!roomName || !participantName) {
    res.status(400).json({ error: "roomName and participantName are required" });
    return;
  }

  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
  });
  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await accessToken.toJwt();
  res.json({ token, url: livekitUrl });
});

app.listen(port, () => {
  console.log(`token server http://localhost:${port} -> ${livekitUrl}`);
});
