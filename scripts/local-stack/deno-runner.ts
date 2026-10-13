// Starts an Edge Function on the port given in PORT (local testing only).
const serve = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Deno.ServeHandler) => serve({ port: Number(Deno.env.get('PORT')) }, handler);
await import(Deno.args[0]);
