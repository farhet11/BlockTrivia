// Mock for 'server-only' package in test environment.
// The real package throws at import time in non-server contexts.
// In tests we just need the module to be importable.
export {};
