/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload script loaded with tsx --require. */
// Lets CLI scripts (the seed) import server modules guarded by "server-only", which otherwise
// throws outside a React Server Components bundle.
const Module = require("node:module");
const path = require.resolve("server-only");
require.cache[path] = new Module.Module(path);
require.cache[path].loaded = true;
require.cache[path].exports = {};
