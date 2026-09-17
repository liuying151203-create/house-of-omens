import handler from 'vinext/server/fetch-handler';
import {
  connectRemoteRoom,
  routeErrorResponse,
} from './lib/network/remote-router.mjs';

export { GameRoom } from './lib/network/game-room-do.mjs';

const REMOTE_SOCKET_PATH = /^\/api\/remote\/rooms\/([^/]+)\/socket\/?$/;

const worker = {
  async fetch(request, env, ctx) {
    const match = new URL(request.url).pathname.match(REMOTE_SOCKET_PATH);
    if (match) {
      try {
        return await connectRemoteRoom(
          env.GAME_ROOMS,
          request,
          decodeURIComponent(match[1]),
        );
      } catch (error) {
        return routeErrorResponse(error);
      }
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
