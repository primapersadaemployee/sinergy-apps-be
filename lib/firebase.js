import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.resolve(
  "__dirname",
  "../private/sinergy-apps-firebase-adminsdk-fbsvc-abc4ca1a5c.json"
);
let serviceAccount;

try {
  const serviceAccountRaw = fs.readFileSync(serviceAccountPath, "utf8");
  serviceAccount = JSON.parse(serviceAccountRaw);
  console.log("Service account loaded successfully.");
} catch (error) {
  console.error("Error reading service account file:", {
    message: error.message,
    code: error.code,
  });
  throw error;
}

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  console.log("Firebase Admin SDK initialized.");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", {
    message: error.message,
    code: error.code,
    stack: error.stack,
  });
  if (error.code === "auth/invalid-credential") {
    console.error(
      "Invalid service account credentials. Check the service account file or server time."
    );
  }
  throw error;
}

export default admin;
