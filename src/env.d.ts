/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly KV: import("@cloudflare/workers-types").KVNamespace;
  readonly DB: import("@cloudflare/workers-types").D1Database;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type Runtime = import("@astrojs/cloudflare").Runtime<ImportMetaEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
