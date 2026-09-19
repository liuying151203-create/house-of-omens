import { env } from 'cloudflare:workers';
import {
  createRemoteRoom,
  jsonResponse,
  routeErrorResponse,
} from '@/lib/network/remote-router.mjs';
import { canCreateRemoteRoom } from '@/lib/network/remote-rollout.mjs';

type RemoteEnv = {
  GAME_ROOMS: DurableObjectNamespace;
  REMOTE_RATE_LIMITERS: DurableObjectNamespace;
};

export async function POST(request: Request) {
  if (!canCreateRemoteRoom(env))
    return jsonResponse(
      { error: '远程房间暂不开放创建。', code: 'remote_creation_disabled' },
      503,
    );
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
