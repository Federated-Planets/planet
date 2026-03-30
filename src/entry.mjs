// Custom entry point to export Durable Objects alongside Astro
export * from '../dist/server/entry.mjs';
export { default } from '../dist/server/entry.mjs';
export { TrafficControl } from './pages/api/v1/control-ws';
