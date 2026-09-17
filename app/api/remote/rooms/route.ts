import { env } from 'cloudflare:workers';
import {
  createRemoteRoom,
  routeErrorResponse,
} from '@/lib/network/remote-router.mjs';

type RemoteEnv = {
  GAME_ROOMS: DurableObjectNamespace;
};

export async function POST(request: Request) {
  try {
    return await createRemoteRoom(
      (env as unknown as RemoteEnv).GAME_ROOMS,
      request,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
