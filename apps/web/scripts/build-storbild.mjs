// Bundles the TV player (lib/bigscreen/tv.ts) to public/storbild/player.js:
// plain JS, no React, so a Pi Zero 2 W runs one small script instead of a
// Next.js app. Runs before `next build` and `next dev`; --watch rebuilds on change.
import * as esbuild from "esbuild";

const options = {
  entryPoints: ["lib/bigscreen/tv.ts"],
  outfile: "public/storbild/player.js",
  bundle: true,
  minify: true,
  format: "iife",
  // piSignage's Chromium on the Pi.
  target: "chrome87",
  legalComments: "none",
  logLevel: "info",
};

if (process.argv.includes("--watch")) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
