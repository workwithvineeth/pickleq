// Local only (not committed): lets vitest read the shared node_modules symlink.
import { mergeConfig } from 'vite';
import base from './vite.config';
export default (env: { mode: string; command: 'serve' | 'build' }) => mergeConfig((base as (e: typeof env) => object)(env), { server: { fs: { strict: false } }, test: { maxWorkers: 1 } });
