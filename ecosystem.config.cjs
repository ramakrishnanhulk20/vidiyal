// pm2 keeps the review loop running across crashes and reboots. Secrets are not here:
// the loop reads .env itself through dotenv, so this file is safe to publish.
const { resolve } = require("node:path");

module.exports = {
  apps: [
    {
      name: "vidiyal-review",
      // The same thing `npx tsx scripts/review-loop.ts` does, named directly. pm2 on
      // Windows hands script to node, and node cannot read npx.cmd.
      script: resolve(__dirname, "node_modules/tsx/dist/cli.mjs"),
      args: "scripts/review-loop.ts",
      cwd: __dirname,
      autorestart: true,
      // The loop's own watchdog exits with code 2 after ten minutes of silence, so a
      // restart here is either that or a crash. Twenty tries a minute apart is about
      // twenty minutes of trying, after which a human should look.
      max_restarts: 20,
      restart_delay: 60000,
      out_file: resolve(__dirname, "data/state/logs/review-out.log"),
      error_file: resolve(__dirname, "data/state/logs/review-error.log"),
      merge_logs: true,
      time: true,
      kill_timeout: 30000,
      windowsHide: true,
    },
  ],
};
