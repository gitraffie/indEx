// Supervisor Zone Module for Intern Dashboard
class SupervisorZoneManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.geofenceCenter = null;
        this.geofenceRadius = 100;
        this.init();
    }

    init() {
        // Initialization if needed
    }

    async checkSupervisorZoneStatus() {
        try {
            const internRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            const internDoc = await internRef.get();
            if (!internDoc.exists) return;
            const internData = internDoc.data();
            const joinedCodes = internData.rooms || [];
            // Find supervisor rooms by checking "rooms" collection and if current user is in "interns" field
            let supervisorRoomCode = null;
            for (const roomCode of joinedCodes) {
                const roomSnap = await this.db.collection("rooms").where("joinCode", "==", roomCode).limit(1).get();
                if (!roomSnap.empty) {
                    const roomData = roomSnap.docs[0].data();
                    // Check if the room has a supervisorEmail field (indicating it's a supervisor room)
                    if (!roomData.supervisorEmail) {
                        continue; // Skip to the next room if no supervisorEmail
                    }
                    const interns = roomData.interns || [];
                    if (interns.includes(this.auth.currentUser.email)) {
                        supervisorRoomCode = roomCode;
                        break;
                    }
                }
            }
            const inputDiv = document.getElementById('supervisorZoneInput');
            const connectedMsg = document.getElementById('supervisorZoneConnected');
            const input = document.getElementById('supervisorRoomCodeInput');
            const button = document.querySelector('#supervisorZoneInput button');
            if (supervisorRoomCode) {
                // Fetch geofence data and set global variables
                const geoSnap = await this.db.collection("geofences").doc(supervisorRoomCode).get();
                if (geoSnap.exists) {
                    const geofenceData = geoSnap.data();
                    this.geofenceCenter = [geofenceData.center.lat, geofenceData.center.lng];
                    this.geofenceRadius = geofenceData.radius || 100;
                }

                // Hide input and button, show connected message with disconnect button
                inputDiv.style.display = 'none';
                connectedMsg.classList.remove('hidden');
                connectedMsg.innerHTML = `
                    <p>Connected to supervisor zone: <strong>${supervisorRoomCode}</strong></p>
                    <div class="flex gap-2 mt-2">
                        <a href="#" onclick="window.uiManager.toggleMapModal()" class="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition flex items-center gap-1">
                            <i class="fas fa-map"></i>
                            View Map
                        </a>
                        <button onclick="window.supervisorZoneManager.disconnectSupervisorZone()" class="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition flex items-center gap-1">
                            <i class="fas fa-unlink"></i>
                            Disconnect
                        </button>
                    </div>
                `;
            } else {
                // Show input and button, hide connected message
                inputDiv.style.display = 'flex';
                connectedMsg.classList.add('hidden');
                input.value = '';
            }
        } catch (error) {
            console.error('Error checking supervisor zone status:', error);
        }
    }

    async setSupervisorZone() {
        const roomCode = document.getElementById('supervisorRoomCodeInput').value.trim();
        const setZoneStatus = document.getElementById('setZoneStatus');
        setZoneStatus.textContent = '';

        // Show spinner and disable button
        const button = document.getElementById('setZoneButton');
        const spinner = document.getElementById('setZoneSpinner');
        const text = document.getElementById('setZoneText');
        button.disabled = true;
        spinner.classList.remove('hidden');
        text.textContent = 'Connecting...';

        if (!roomCode) {
            setZoneStatus.textContent = 'Please enter a supervisor room code.';
            setZoneStatus.style.color = 'red';
            // Hide spinner and enable button
            button.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Set Zone';
            return;
        }

        try {
            // Check if the room exists in "rooms" collection
            const roomSnap = await this.db.collection("rooms")
                .where("joinCode", "==", roomCode)
                .limit(1)
                .get();

            if (roomSnap.empty) {
                setZoneStatus.textContent = 'Room not found with the given code.';
                setZoneStatus.style.color = 'red';
                // Hide spinner and enable button
                button.disabled = false;
                spinner.classList.add('hidden');
                text.textContent = 'Set Zone';
                return;
            }

            const roomData = roomSnap.docs[0].data();
            const roomRef = roomSnap.docs[0].ref;
            const internEmail = this.auth.currentUser.email;

            // Check if intern's email exists in the room's interns field
            if (!roomData.interns || !roomData.interns.includes(internEmail)) {
                // Save intern's email to the room's interns field
                await roomRef.update({
                    interns: firebase.firestore.FieldValue.arrayUnion(internEmail)
                });
            }

            // Add roomCode to intern's rooms array
            const internRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            await internRef.update({
                rooms: firebase.firestore.FieldValue.arrayUnion(roomCode)
            });

            // Check if geofence exists for this room
            const geofenceSnap = await this.db.collection("geofences").doc(roomCode).get();
            if (!geofenceSnap.exists) {
                setZoneStatus.textContent = 'No geofence found for this supervisor room.';
                setZoneStatus.style.color = 'red';
                // Hide spinner and enable button
                button.disabled = false;
                spinner.classList.add('hidden');
                text.textContent = 'Set Zone';
                return;
            }

            const geofenceData = geofenceSnap.data();

            // Check if intern_data document already exists for this intern and room
            const existingInternDataSnap = await this.db.collection("intern_data")
                .where("intern_email", "==", internEmail)
                .where("room_code", "==", roomCode)
                .limit(1)
                .get();

            const internDataPayload = {
                intern_email: internEmail,
                room_code: roomCode,
                type: "supervisor",
                geofence: geofenceData
            };

            if (!existingInternDataSnap.empty) {
                // Update existing document
                const existingDocRef = existingInternDataSnap.docs[0].ref;
                await existingDocRef.update(internDataPayload);
                console.log("🔍 DEBUG setSupervisorZone: Updated existing intern_data");
            } else {
                // Create new document
                await this.db.collection("intern_data").add(internDataPayload);
                console.log("🔍 DEBUG setSupervisorZone: Created new intern_data");
            }

            // Update global geofence variables for immediate use
            this.geofenceCenter = [geofenceData.center.lat, geofenceData.center.lng];
            this.geofenceRadius = geofenceData.radius || 100;

            // Update geofence manager
            window.geofenceManager.geofenceCenter = this.geofenceCenter;
            window.geofenceManager.geofenceRadius = this.geofenceRadius;

            // Refresh the map if it exists
            if (window.geofenceManager.map) {
                if (window.geofenceManager.geofenceCircle) window.geofenceManager.map.removeLayer(window.geofenceManager.geofenceCircle);
                window.geofenceManager.geofenceCircle = L.circle(this.geofenceCenter, {
                    radius: this.geofenceRadius,
                    color: "red",
                    fillColor: "#f03",
                    fillOpacity: 0.3,
                }).addTo(window.geofenceManager.map);
                window.geofenceManager.map.setView(this.geofenceCenter, 17);
                window.geofenceManager.map.invalidateSize();
            }

            // Refresh rooms list to show the newly joined room
            await window.roomManager.fetchJoinedRooms();

            // Update the UI to show connected status
            await this.checkSupervisorZoneStatus();

            setZoneStatus.style.color = 'green';
            setZoneStatus.textContent = 'Successfully joined supervisor room and set geofence zone.';

            // Hide spinner and enable button immediately after success
            button.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Set Zone';

            // Clear the success message after 2 seconds
            setTimeout(() => {
                setZoneStatus.textContent = '';
            }, 2000);

        } catch (error) {
            console.error('Error setting supervisor zone:', error);
            setZoneStatus.style.color = 'red';
            setZoneStatus.textContent = 'Error setting supervisor zone: ' + error.message;
            // Hide spinner and enable button
            button.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Set Zone';
        }
    }

    async disconnectSupervisorZone() {
        if (!confirm('Are you sure you want to disconnect from the supervisor zone?')) {
            return;
        }

        try {
            const internRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            const internDoc = await internRef.get();
            if (!internDoc.exists) {
                alert('Intern record not found.');
                return;
            }

            const internData = internDoc.data();
            const joinedCodes = internData.rooms || [];

            // Find supervisor room code
            let supervisorRoomCode = null;
            for (const roomCode of joinedCodes) {
                const roomSnap = await this.db.collection("rooms").where("joinCode", "==", roomCode).limit(1).get();
                if (!roomSnap.empty) {
                    const roomData = roomSnap.docs[0].data();
                    if (roomData.supervisorEmail && roomData.interns && roomData.interns.includes(this.auth.currentUser.email)) {
                        supervisorRoomCode = roomCode;
                        break;
                    }
                }
            }

            if (!supervisorRoomCode) {
                alert('No supervisor zone found to disconnect from.');
                return;
            }

            // Remove roomCode from intern's rooms array
            await internRef.update({
                rooms: firebase.firestore.FieldValue.arrayRemove(supervisorRoomCode)
            });

            // Remove intern's email from room's interns array
            const roomSnap = await this.db.collection("rooms").where("joinCode", "==", supervisorRoomCode).limit(1).get();
            if (!roomSnap.empty) {
                const roomDoc = roomSnap.docs[0];
                const roomRef = roomDoc.ref;
                await roomRef.update({
                    interns: firebase.firestore.FieldValue.arrayRemove(this.auth.currentUser.email)
                });
            }

            // Reset geofence
            this.geofenceCenter = null;
            this.geofenceRadius = 100;
            window.geofenceManager.geofenceCenter = null;
            window.geofenceManager.geofenceRadius = 100;

            // Update UI to show disconnected status
            await this.checkSupervisorZoneStatus();

            alert('Successfully disconnected from the supervisor zone.');
        } catch (err) {
            console.error('Failed to disconnect from supervisor zone:', err);
            alert('Failed to disconnect from supervisor zone. Please try again.');
        }
    }
}

// Create global supervisor zone manager instance
window.supervisorZoneManager = new SupervisorZoneManager();

// Export for use in modules
window.SupervisorZoneManager = SupervisorZoneManager;
