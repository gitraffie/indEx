// Migration script to move geofence data from top-level collection to subcollection under rooms
// Run this once after deploying the updated code

const firebaseConfig = {
    apiKey: "AIzaSyDaCCFqs7cwKMiicnlP2Ig3s-WHw8gyZts",
    authDomain: "index-database-d00f9.firebaseapp.com",
    projectId: "index-database-d00f9",
    storageBucket: "index-database-d00f9.firebasestorage.app",
    messagingSenderId: "310780304431",
    appId: "1:310780304431:web:18c2fdd5ab6405e80dfada",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function migrateGeofences() {
    console.log("Starting geofence migration...");

    try {
        // Get all geofences from the old collection
        const geofencesSnap = await db.collection("geofences").get();

        if (geofencesSnap.empty) {
            console.log("No geofences to migrate.");
            return;
        }

        console.log(`Found ${geofencesSnap.size} geofences to migrate.`);

        for (const geoDoc of geofencesSnap.docs) {
            const joinCode = geoDoc.id;
            const geofenceData = geoDoc.data();

            console.log(`Migrating geofence for joinCode: ${joinCode}`);

            // Find the corresponding room
            const roomSnap = await db.collection("rooms")
                .where("joinCode", "==", joinCode)
                .limit(1)
                .get();

            if (roomSnap.empty) {
                console.warn(`No room found for joinCode ${joinCode}, skipping...`);
                continue;
            }

            const roomId = roomSnap.docs[0].id;
            const roomData = roomSnap.docs[0].data();

            // Prepare new geofence data
            const newGeofenceData = {
                center: geofenceData.center,
                radius: geofenceData.radius || 100,
                joinCode: joinCode,
                supervisorEmail: roomData.supervisorEmail,
                updatedAt: geofenceData.updatedAt || new Date(),
            };

            // Add to new subcollection
            await db.collection("rooms").doc(roomId).collection("geofences").add(newGeofenceData);

            console.log(`Migrated geofence for room ${roomData.roomName} (${joinCode})`);

            // Optional: Delete old geofence document after successful migration
            // Uncomment the line below after verifying migration is successful
            // await db.collection("geofences").doc(joinCode).delete();
        }

        console.log("Geofence migration completed successfully!");

    } catch (error) {
        console.error("Error during migration:", error);
    }
}

// Run the migration
migrateGeofences();
