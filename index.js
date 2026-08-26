// Entry redirector: keeps the installable root manifest one hop away from the
// compiled plugin in packages/dsh-bridge/dist. The Cordis loader imports this
// package by name; every export the loader reads (name, Config, apply) lives
// in the real entry.
export * from "./packages/dsh-bridge/dist/src/index.js";
