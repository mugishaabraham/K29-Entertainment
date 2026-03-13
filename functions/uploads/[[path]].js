import { handleUploadsRequest } from '../_lib/cloudflare-backend.js';

export async function onRequest(context) {
  return handleUploadsRequest(context);
}
