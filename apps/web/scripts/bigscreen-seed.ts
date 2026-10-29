// Seeds a Storbild screen and the "Vanliga" playlist (docs/bigscreen-plan.md,
// phase 1) until the admin editor exists. The clips are the phase 0 spike
// files in web/spike/storbild/, registered as ready media documents.
//
//   pnpm emulators                                      # in another terminal
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_PROJECT_ID=demo-nsw pnpm bigscreen:seed
//   pnpm bigscreen:seed --prod                          # nackswinget-af7ef, needs ADC
//
// Re-running keeps the screen's key and replaces the playlist.

import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const prod = process.argv.includes("--prod");
if (!prod && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Set FIRESTORE_EMULATOR_HOST (local emulator) or pass --prod.");
  process.exit(1);
}
const projectId = prod ? "nackswinget-af7ef" : (process.env.FIREBASE_PROJECT_ID ?? "demo-nsw");
const db = getFirestore(initializeApp({ projectId }));

const SPIKE = "web/spike/storbild";
const now = new Date().toISOString();
const by = "bigscreen-seed";

const video = (id: string, name: string, file: string) => ({
  id,
  kind: "video",
  name,
  path: `${SPIKE}/${file}-src.mp4`,
  contentType: "video/mp4",
  size: 0,
  alt: "",
  variants: [],
  status: "ready",
  silent: true,
  renditions: { src720: `${SPIKE}/${file}-720.mp4`, src1080: `${SPIKE}/${file}-1080.mp4` },
  createdAt: now,
  createdBy: by,
});

const media = [
  video("storbild-spike-a", "NSW Banner v3.mp4", "a"),
  video("storbild-spike-b", "NSW Banner.mp4", "b"),
  { id: "storbild-spike-still", kind: "image", name: "still.jpg", path: `${SPIKE}/still.jpg`, contentType: "image/jpeg", size: 0, alt: "", width: 1920, height: 1080, variants: [], status: "ready", createdAt: now, createdBy: by },
];

const playlist = {
  id: "vanliga",
  name: "Vanliga",
  version: 1,
  updatedAt: now,
  updatedBy: by,
  blocks: [
    { id: "b1", type: "video", mediaId: "storbild-spike-a" },
    { id: "b2", type: "image", mediaId: "storbild-spike-still", fit: "cover", durationSec: 5, caption: "Välkommen till Nackswinget!" },
    { id: "b3", type: "video", mediaId: "storbild-spike-b" },
    { id: "b4", type: "calendar", view: "week", feeds: [], durationSec: 10 },
  ],
};

async function main() {
  const batch = db.batch();
  for (const m of media) batch.set(db.collection("media").doc(m.id), m);
  batch.set(db.collection("bigscreenPlaylists").doc(playlist.id), playlist);

  const screenRef = db.collection("bigscreens").doc("klubbrummet");
  const existing = await screenRef.get();
  const key = (existing.get("key") as string | undefined) ?? randomBytes(24).toString("base64url");
  batch.set(screenRef, { name: "Klubbrummet", key, playlistId: playlist.id, quality: "720", light: true }, { merge: true });
  await batch.commit();

  console.log(`Seeded ${projectId}: ${media.length} media, playlist "${playlist.name}" (${playlist.blocks.length} blocks), screen "Klubbrummet".`);
  console.log(`Player: /storbild/${key}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
