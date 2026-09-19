import { env } from 'cloudflare:workers';
import { remoteRolloutStage } from '@/lib/network/remote-rollout.mjs';

export function GET() {
  return Response.json(
    { stage: remoteRolloutStage(env) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
