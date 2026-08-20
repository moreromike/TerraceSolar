#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const secret = process.env.RUNWAYML_API_SECRET;
if (!secret) throw new Error("RUNWAYML_API_SECRET is required. Copy .env.example to your local secret manager or shell; do not commit it.");

const [sceneId] = process.argv.slice(2);
if (!sceneId) throw new Error("Usage: node tools/runway-generate.mjs <scene-id>");

const statePath = path.resolve("assets/video/generation.json");
const state = JSON.parse(await fs.readFile(statePath, "utf8"));
const scene = state.scenes.find((item) => item.id === sceneId);
if (!scene) throw new Error(`Unknown scene: ${sceneId}`);

// Complete this adapter only after checking current official Runway API docs.
// Intentionally no guessed endpoint, model name, or paid request is embedded.
const apiUrl = process.env.RUNWAY_API_URL;
const apiVersion = process.env.RUNWAY_API_VERSION;
if (!apiUrl || !apiVersion) {
  throw new Error("Set RUNWAY_API_URL and RUNWAY_API_VERSION from current official Runway documentation, then add the documented request payload below.");
}

const prompt = [
  "Premium realistic residential terrace solar film.",
  "Preserve the supplied product design: ultra-thin semi-flexible solar panel with aluminum frame; only slight realistic flex.",
  "No thick rooftop panel, warped cells, extra cables, floating hardware, text, logos, or unsafe installation.",
  `Scene: ${scene.id}. Reference: ${scene.reference}.`
].join(" ");

const requestBody = {
  // TODO: map `prompt` and the referenced image using the current documented schema.
  promptText: prompt
};

console.log(JSON.stringify({ready: false, scene: scene.id, apiUrl, apiVersion, requestBody}, null, 2));
throw new Error("Scaffold safety stop: implement and review the current documented Runway request before enabling paid generation.");

