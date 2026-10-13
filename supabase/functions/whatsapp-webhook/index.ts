import { handleWhatsAppWebhook } from './handler.ts';
Deno.serve(handleWhatsAppWebhook);
