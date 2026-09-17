import { env } from 'cloudflare:workers';
import {
  accessRemoteRoom,
  routeErrorResponse,
} from '@/lib/network/remote-router.mjs';

type RemoteEnv = {
  GAME_ROOMS: DurableObjectNamespace;
};

type RouteContext = {
  params: Promise<{ code: string }>;
};

async function handle(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    return await accessRemoteRoom(
      (env as unknown as RemoteEnv).GAME_ROOMS,
      request,
      code,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
