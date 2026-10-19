import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { parseOrderEnvelope, type OrderEnvelope } from './order-envelope.js';

export interface OrderSource { load(): Promise<OrderEnvelope>; }
export async function confinedFile(root: string, name: string): Promise<string> {
  const base = await realpath(root), file = await realpath(resolve(base, name));
  const local = relative(base, file);
  if (!local || local.startsWith('..') || isAbsolute(local) || extname(file) !== '.json') throw new Error('OrderFileBoundary: only JSON files inside the current project are allowed');
  if ((await stat(file)).size > 1_048_576) throw new Error('OrderFileTooLarge');
  return file;
}
export class JsonFileOrderSource implements OrderSource {
  constructor(readonly filename: string, readonly root = process.cwd()) {}
  async load(): Promise<OrderEnvelope> { return parseOrderEnvelope(JSON.parse(await readFile(await confinedFile(this.root, this.filename), 'utf8'))); }
}
export type ReadEndpoint = { path: string; method: 'GET' | 'POST'; operation: 'read-order' | 'read-quote' };
export function localhostBase(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('HttpOrderSource requires an explicitly configured credential-free localhost HTTP origin');
  return u;
}
export class HttpOrderSource implements OrderSource {
  constructor(readonly base: string, readonly endpoint: ReadEndpoint, readonly allowlist: ReadEndpoint[], readonly request?: Record<string, string>) {
    localhostBase(base);
    if (!/^\/[A-Za-z0-9_/-]+$/.test(endpoint.path) || endpoint.path.includes('..') || !['read-order', 'read-quote'].includes(endpoint.operation) || !allowlist.some(e => e.path === endpoint.path && e.method === endpoint.method && e.operation === endpoint.operation)) throw new Error('HttpReadNotAllowlisted');
    if (!['GET', 'POST'].includes(endpoint.method) || (endpoint.method === 'GET' && request)) throw new Error('Unsupported HTTP read shape');
    if (request && Object.keys(request).some(key => !['orderHash', 'listingId', 'collection', 'tokenId', 'buyer'].includes(key))) throw new Error('Unsupported quote request field');
  }
  async load(): Promise<OrderEnvelope> {
    const r = await fetch(new URL(this.endpoint.path, localhostBase(this.base)), { method: this.endpoint.method, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json', ...(this.endpoint.method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(this.request ? { body: JSON.stringify(this.request) } : {}) });
    if (!r.ok || !r.body) throw new Error(`OrderReadFailed: HTTP ${r.status}`);
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > 1_048_576) throw new Error('OrderResponseTooLarge'); chunks.push(chunk); }
    return parseOrderEnvelope(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }
}
