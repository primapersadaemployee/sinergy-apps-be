import admin from "firebase-admin";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(
  __dirname,
  "..",
  "private",
  "sinergy-apps.json"
);

try {
  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  console.log("Firebase Admin SDK initialized.");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
}

export default admin;
