import { env } from 'cloudflare:workers';
import {
  joinRemoteRoom,
  routeErrorResponse,
} from '@/lib/network/remote-router.mjs';

type RemoteEnv = {
  GAME_ROOMS: DurableObjectNamespace;
  REMOTE_RATE_LIMITERS: DurableObjectNamespace;
};

export async function POST(request: Request) {
  try {
    return await joinRemoteRoom(
      (env as unknown as RemoteEnv).GAME_ROOMS,
      request,
      (env as unknown as RemoteEnv).REMOTE_RATE_LIMITERS,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
