import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "node:fs";

const watch = process.argv.includes("--watch");

const commonOpts = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
};

const buildTargets = [
  {
    entryPoints: ["src/main/index.ts"],
    outfile: "dist/main/index.js",
  },
  {
    entryPoints: ["src/preload/settings.ts"],
    outfile: "dist/preload/settings.js",
  },
];

async function buildRenderer() {
  await esbuild.build({
    entryPoints: ["src/renderer/settings/settings.ts"],
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "iife",
    sourcemap: true,
    outfile: "dist/renderer/settings/settings.js",
    logLevel: "info",
  });
}

function copyStaticAssets() {
  mkdirSync("dist/renderer/settings", { recursive: true });
  cpSync("src/renderer/settings/index.html", "dist/renderer/settings/index.html");
  cpSync("src/renderer/settings/style.css", "dist/renderer/settings/style.css");
  if (existsSync("assets")) {
    cpSync("assets", "dist/assets", { recursive: true });
  }
}

async function run() {
  copyStaticAssets();

  if (watch) {
    const contexts = await Promise.all(
      buildTargets.map((t) => esbuild.context({ ...commonOpts, ...t }))
    );
    const rendererCtx = await esbuild.context({
      entryPoints: ["src/renderer/settings/settings.ts"],
      bundle: true,
      platform: "browser",
      target: "es2022",
      format: "iife",
      sourcemap: true,
      outfile: "dist/renderer/settings/settings.js",
    });
    await Promise.all([...contexts.map((c) => c.watch()), rendererCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    for (const target of buildTargets) {
      await esbuild.build({ ...commonOpts, ...target });
    }
    await buildRenderer();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
