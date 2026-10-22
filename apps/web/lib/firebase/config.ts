// Public Firebase web configs (not secrets).
//
// `production` is the original web app (also in functions/static/). Its API
// key is restricted to FCM and to nackswinget.se, so it only serves the push
// widget, which must match the service worker's config.
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

const emulator = { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-nsw", appId: "demo-app" };

/** Push widget (FCM), see `production` above. */
export const firebaseConfig = USE_EMULATORS ? emulator : production;

/**
 * Admin sign-in: the App Hosting web app "nsw-web". Its key allows Identity
 * Toolkit and is referrer-restricted to the preview host, nackswinget.se,
 * www.nackswinget.se, ny.nackswinget.se, localhost:3100 and the firebaseapp.com auth domain.
 */
export const authConfig = USE_EMULATORS
  ? emulator
  : { ...production, apiKey: "AIzaSyB__kbJPyE4DOY1RjWnCsOMRhTqZjoimdc", appId: "1:560237127162:web:a558eb1c4517ea74997043" };

export const VAPID_KEY = "BMTIrHUbvBXlQpWWeIDc2IMD_CPye0EW-XmOqzAtBvMkKy8bsRfx5YEfvQQ4Gp98XV2XAOcaz6o-x2bisVBNWXM";
export const NOTIFICATIONS_API = "https://europe-north1-nackswinget-af7ef.cloudfunctions.net/notifications-api";
