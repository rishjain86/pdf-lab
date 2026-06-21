const admin = require('firebase-admin');

const latestVersion = parseFloat(process.env.NEW_VERSION);
console.log(`🚀 New version detected from Action: ${latestVersion}`);

if (!latestVersion) {
    console.error("❌ Error: Version input missing!");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

db.collection('amazingpdf_settings').doc('app_config').set({
    latest_version: latestVersion
}, { merge: true })
.then(() => {
    console.log(`✅ Firebase successfully updated to version ${latestVersion}!`);
    process.exit(0);
})
.catch((error) => {
    console.error("❌ Firebase update failed:", error);
    process.exit(1);
});
