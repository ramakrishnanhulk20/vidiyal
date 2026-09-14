import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Forks, not worker threads: on this machine a Bitget request made inside a vitest
    // worker thread comes back as a network error, while the same request from a forked
    // process succeeds. The LIVE=1 tests need real network, so the pool is set here
    // rather than remembered as a command line flag.
    pool: "forks",
  },
});
