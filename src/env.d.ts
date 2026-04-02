/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly TRAFFIC_CONTROL: import("@cloudflare/workers-types").DurableObjectNamespace;
  readonly PUBLIC_SIM_PLANET_NAME?: string;
  readonly PUBLIC_SIM_PLANET_DESCRIPTION?: string;
  readonly PUBLIC_SIM_LANDING_SITE?: string;
  readonly PUBLIC_SIM_WARP_LINKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type Runtime = import("@astrojs/cloudflare").Runtime<ImportMetaEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
