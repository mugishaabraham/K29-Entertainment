import { handleApiRequest } from '../_lib/cloudflare-backend.js';

export async function onRequest(context) {
  return handleApiRequest(context);
}
