import { env } from 'cloudflare:workers';
import {
  createRemoteRoom,
  routeErrorResponse,
} from '@/lib/network/remote-router.mjs';

type RemoteEnv = {
  GAME_ROOMS: DurableObjectNamespace;
  REMOTE_RATE_LIMITERS: DurableObjectNamespace;
};

export async function POST(request: Request) {
  try {
    return await createRemoteRoom(
      (env as unknown as RemoteEnv).GAME_ROOMS,
      request,
      (env as unknown as RemoteEnv).REMOTE_RATE_LIMITERS,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
