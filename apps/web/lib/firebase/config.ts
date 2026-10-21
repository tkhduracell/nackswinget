// Public Firebase web config (not a secret; also in functions/static/).
const production = {
  apiKey: "AIzaSyBJ_cRfI7tvVZ_xlIk9QqF6eN29YD6xOAk",
  authDomain: "nackswinget-af7ef.firebaseapp.com",
  projectId: "nackswinget-af7ef",
  storageBucket: "nackswinget-af7ef.appspot.com",
  messagingSenderId: "560237127162",
  appId: "1:560237127162:web:2e12c34e9e8fa521997043",
};

/** NEXT_PUBLIC_EMULATORS=1 (pnpm dev:emulators): local Auth emulator, demo project, no real accounts. */
export const USE_EMULATORS = process.env.NEXT_PUBLIC_EMULATORS === "1";

export const firebaseConfig = USE_EMULATORS ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-nsw", appId: "demo-app" } : production;

export const VAPID_KEY = "BMTIrHUbvBXlQpWWeIDc2IMD_CPye0EW-XmOqzAtBvMkKy8bsRfx5YEfvQQ4Gp98XV2XAOcaz6o-x2bisVBNWXM";
export const NOTIFICATIONS_API = "https://europe-north1-nackswinget-af7ef.cloudfunctions.net/notifications-api";
