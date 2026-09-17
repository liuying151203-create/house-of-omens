import { env } from 'cloudflare:workers';
import {
  joinRemoteRoom,
  routeErrorResponse,
} from '@/lib/network/remote-router.mjs';

type RemoteEnv = {
  GAME_ROOMS: DurableObjectNamespace;
};

export async function POST(request: Request) {
  try {
    return await joinRemoteRoom(
      (env as unknown as RemoteEnv).GAME_ROOMS,
      request,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
