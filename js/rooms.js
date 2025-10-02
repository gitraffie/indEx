// Rooms Module for Intern Dashboard
class RoomManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.currentPage = 1;
        this.pageSize = 5;
        this.currentSchedules = [];
        this.init();
    }

    init() {
        // Initialization if needed
    }

    async displayRoomSchedule(roomCode) {
        const container = document.getElementById("roomScheduleContainer");
        const nonSupervisorElements = document.getElementById("nonSupervisorElements");
        const tableDiv = document.getElementById("roomScheduleTable");

        container.classList.remove("hidden");

        // Get room data
        let roomName = "Room Schedule";
        let roomId = null;
        try {
            const roomSnap = await this.db.collection("rooms")
                .where("joinCode", "==", roomCode)
                .limit(1)
                .get();
            if (!roomSnap.empty) {
                const roomData = roomSnap.docs[0].data();
                roomName = roomData.name || "Unnamed Room";
                roomId = roomSnap.docs[0].id;
            }
        } catch (err) {
            console.error("Failed to fetch room name:", err);
        }
        document.getElementById("roomScheduleTitle").textContent = roomName;

        // Check if geofence exists for this room (supervisor room)
        const geoSnap = await this.db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
        if (!geoSnap.empty) {
            // This is a supervisor room - show supervisor elements with map
            nonSupervisorElements.classList.add("hidden");
            const supervisorElements = document.getElementById("supervisorElements");
            supervisorElements.classList.remove("hidden");

            // Initialize map for supervisor room with delay to ensure div is rendered
            setTimeout(() => {
                const geofenceData = geoSnap.data();
                const center = geofenceData.center;
                const radius = geofenceData.radius || 100;

                // Clear any existing map
                const mapDiv = document.getElementById("roomMap");
                mapDiv.innerHTML = "";

                // Create new Leaflet map instance
                const supervisorMap = L.map(mapDiv).setView([center.lat, center.lng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19,
                }).addTo(supervisorMap);

                // Add geofence circle
                const geofenceCircle = L.circle([center.lat, center.lng], {
                    radius: radius,
                    color: "red",
                    fillColor: "#f03",
                    fillOpacity: 0.3
                }).addTo(supervisorMap);

                // Fit map to geofence bounds
                supervisorMap.fitBounds(geofenceCircle.getBounds());

                // Invalidate size after a short delay
                setTimeout(() => {
                    supervisorMap.invalidateSize();
                }, 100);
            }, 100);

            return;
        }

        console.log("🔍 DEBUG displayRoomSchedule: No geofence found for room:", roomCode, "- showing schedule elements");
        // This is a non-supervisor room - show schedule and other elements
        nonSupervisorElements.classList.remove("hidden");

        // Load schedule as before
        tableDiv.innerHTML = "<p class='text-gray-500'>Loading schedule...</p>";
        try {
            const scheduleSnap = await this.db.collection("rooms").doc(roomId).collection("schedules").get();

            if (scheduleSnap.empty) {
                tableDiv.innerHTML = "<p class='text-gray-500'>No schedule found for this room.</p>";
                return;
            }

            const dailyTimes = scheduleSnap.docs.map(doc => doc.data());
            if (dailyTimes.length === 0) {
                tableDiv.innerHTML = "<p class='text-gray-500'>No schedule entries for this room.</p>";
                return;
            }

            this.currentSchedules = dailyTimes.sort((a, b) => {
                const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return dateB - dateA;
            });

            this.currentPage = 1;
            this.renderScheduleTable();

            // Pagination controls
            document.getElementById("prevPage").onclick = () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderScheduleTable();
                }
            };
            document.getElementById("nextPage").onclick = () => {
                if (this.currentPage < Math.ceil(this.currentSchedules.length / this.pageSize)) {
                    this.currentPage++;
                    this.renderScheduleTable();
                }
            };
        } catch (err) {
            console.error("Failed to fetch room schedule:", err);
            tableDiv.innerHTML = "<p class='text-red-500'>❌ Failed to load schedule.</p>";
        }
    }

    renderScheduleTable() {
        const tableDiv = document.getElementById("roomScheduleTable");
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.currentSchedules.slice(start, end);

        let html = `
            <table class="w-full text-sm text-left text-gray-500 shadow">
                <thead class="text-xs text-blue-700 uppercase bg-blue-100">
                    <tr>
                        <th class="px-2 py-2 md:px-4">Date</th>
                        <th class="px-2 py-2 md:px-4">Start</th>
                        <th class="px-2 py-2 md:px-4">End</th>
                        <th class="px-2 py-2 md:px-4">Day</th>
                    </tr>
                </thead>
                <tbody>
        `;
        pageData.forEach(s => {
            // Parse date and get day of the week
            let dayOfWeek = "N/A";
            if (s.date) {
                try {
                    const [year, month, day] = s.date.split('-').map(Number);
                    const dateObj = new Date(year, month - 1, day);
                    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    dayOfWeek = days[dateObj.getDay()];
                } catch (e) {
                    dayOfWeek = "Invalid date";
                }
            }

            html += `
                <tr class="border-b">
                    <td class="px-2 py-2 md:px-4 text-xs md:text-sm">${s.date || "N/A"}</td>
                    <td class="px-2 py-2 md:px-4 text-xs md:text-sm">${s.start || "-"}</td>
                    <td class="px-2 py-2 md:px-4 text-xs md:text-sm">${s.end || "-"}</td>
                    <td class="px-2 py-2 md:px-4 text-xs md:text-sm">${dayOfWeek}</td>
                </tr>
            `;
        });
        html += "</tbody></table>";
        tableDiv.innerHTML = `<div class="overflow-x-auto">${html}</div>`;

        // Update pagination info
        const pageInfo = document.getElementById("pageInfo");
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${Math.ceil(this.currentSchedules.length / this.pageSize)}`;
        }
    }

    async joinRoom() {
        const joinCode = document.getElementById("joinRoomInput").value.trim();
        const status = document.getElementById("joinRoomStatus");

        if (!joinCode) {
            status.textContent = "❌ Enter a join code.";
            return;
        }

        try {
            // Validate room
            const roomSnap = await this.db.collection("rooms")
                .where("joinCode", "==", joinCode)
                .limit(1)
                .get();

            if (roomSnap.empty) {
                status.textContent = "❌ Room not found.";
                return;
            }

            const roomDoc = roomSnap.docs[0];
            const roomId = roomDoc.id;
            const roomData = roomDoc.data();

            // Add roomId to user's joinedRooms array
            const userRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            await userRef.update({
                joinedRooms: firebase.firestore.FieldValue.arrayUnion(roomId)
            });

            // Add to rooms/{roomId}/members
            await this.db.collection("rooms").doc(roomId).collection("members").doc(this.auth.currentUser.uid).set({
                joinedAt: new Date(),
                progressHours: 0,
                status: "active"
            });

            window.uiManager.closeJoinRoomModal();
            // Reload the page after successful room join
            location.reload();
        } catch (err) {
            console.error("Failed to join room:", err);
            status.textContent = "❌ Failed to join room. " + err;
        }
    }

    async fetchJoinedRooms() {
        const internRoomsDiv = document.getElementById("internRooms");
        internRoomsDiv.innerHTML = "<p class='text-gray-500'>Loading rooms...</p>";

        try {
            const userRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            const userDoc = await userRef.get();
            if (!userDoc.exists) {
                internRoomsDiv.innerHTML = "<p class='text-gray-500'>No user record found.</p>";
                return;
            }

            const joinedRoomIds = userDoc.data().joinedRooms || [];
            if (joinedRoomIds.length === 0) {
                internRoomsDiv.innerHTML = "<p class='text-gray-500'>No rooms joined yet.</p>";
                return;
            }

            const noRoomsMessage = document.getElementById("noRoomsMessage");

            internRoomsDiv.innerHTML = "";

            for (const roomId of joinedRoomIds) {
                const roomDoc = await this.db.collection("rooms").doc(roomId).get();

                if (roomDoc.exists) {
                    const room = roomDoc.data();
                    console.log("Joined room data:", room);

                    // Only display coordinator rooms, skip supervisor rooms
                    if (room.type === "supervisor") {
                        continue;
                    }

                    const card = document.createElement("div");
                    card.className = "border rounded-lg shadow-md p-4 hover:shadow-lg transition cursor-pointer mb-3";
                    card.style.backgroundColor = "#4175b8ea";
                    card.id = `room-card-${room.joinCode}`;

                    // Handle different field name variations
                    const roomName = room.name || "Unnamed Room";
                    const roomCodeDisplay = room.joinCode;

                    // Fetch coordinator name
                    let roomDescription = "Not found";
                    if (room.createdBy) {
                        try {
                            const coordSnap = await this.db.collection("interns")
                                .where("uid", "==", room.createdBy)
                                .where("role", "==", "coordinator")
                                .limit(1)
                                .get();
                            if (!coordSnap.empty) {
                                const coordData = coordSnap.docs[0].data();
                                roomDescription = coordData.fullName || "Unnamed Coordinator";
                            }
                        } catch (err) {
                            console.error("Error fetching coordinator:", err);
                        }
                    }

                    card.innerHTML = `
                        <img src="/images/indexbg.webp" alt="Room Image" class="w-full h-30 object-fill rounded-lg mb-4 bg-blue-700">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="text-lg font-bold text-white flex-1">${roomName}</h3>
                            <div class="kebab-menu relative">
                                <button class="kebab-button" onclick="window.roomManager.toggleKebabMenu('${roomCodeDisplay}', event)">
                                <i class="fas fa-ellipsis-v" style="color: white;"></i>
                              </button>
                              <div id="popover-${roomCodeDisplay}" class="popover">
                                <button class="popover-item leave-room" onclick="window.roomManager.leaveRoom('${roomCodeDisplay}')">
                                  <i class="fas fa-sign-out-alt mr-2"></i>Leave Room
                                </button>
                              </div>
                            </div>
                        </div>
                        <p class="text-xs text-white">Code: ${roomCodeDisplay}</p>
                        <p class="text-xs text-white">${roomDescription}</p>
                    `;
                    internRoomsDiv.appendChild(card);

                    // Add click handler to show schedule
                    card.addEventListener("click", () => {
                        const container = document.getElementById("roomScheduleContainer");
                        const roomCode = room.joinCode;

                        // If same room is clicked again → hide
                        if (container.dataset.activeRoom === roomCode) {
                            container.classList.toggle("hidden");
                            // Show room selection UI when hiding schedule
                            document.getElementById("joinRoomInput").parentElement.style.display = "flex";
                            document.getElementById("joinedRoomsList").style.display = "block";
                            document.getElementById("internRooms").parentElement.style.display = "block";
                            // Toggle join room button visibility
                            window.uiManager.toggleJoinRoomButton();
                        } else {
                            container.dataset.activeRoom = roomCode;
                            container.classList.remove("hidden");

                            // Hide room selection UI when showing schedule
                            document.getElementById("joinRoomInput").parentElement.style.display = "none";
                            document.getElementById("joinedRoomsList").style.display = "none";
                            document.getElementById("internRooms").parentElement.style.display = "none";

                            this.displayRoomSchedule(roomCode);
                            // Toggle join room button visibility
                            window.uiManager.toggleJoinRoomButton();
                        }
                    });
                }
            }

            // Toggle visibility of noRoomsMessage based on whether coordinator rooms are joined
            // Filter out supervisor rooms from joinedRoomIds
            const coordinatorRooms = [];
            for (const roomId of joinedRoomIds) {
                const roomDoc = await this.db.collection("rooms").doc(roomId).get();
                if (roomDoc.exists) {
                    const room = roomDoc.data();
                    if (room.type !== "supervisor") {
                        coordinatorRooms.push(roomId);
                    }
                }
            }
            if (coordinatorRooms.length > 0) {
                noRoomsMessage.classList.add("hidden");
            } else {
                noRoomsMessage.classList.remove("hidden");
            }
        } catch (err) {
            console.error("Error loading rooms:", err);
            internRoomsDiv.innerHTML = "<p class='text-red-500'>❌ Failed to load rooms.</p>";
        }
    }

    toggleKebabMenu(roomCode, event) {
        event.stopPropagation(); // Prevent card click

        // Close all other popovers first
        const allPopovers = document.querySelectorAll('.popover');
        allPopovers.forEach(popover => {
            if (popover.id !== `popover-${roomCode}`) {
                popover.classList.remove('show');
            }
        });

        // Toggle the current popover
        const popover = document.getElementById(`popover-${roomCode}`);
        if (popover) {
            popover.classList.toggle('show');
        }
    }

    async leaveRoom(roomCode) {
        if (!confirm(`Are you sure you want to leave this room (${roomCode})?`)) {
            return;
        }

        try {
            // Get roomId from joinCode
            const roomSnap = await this.db.collection("rooms").where("joinCode", "==", roomCode).limit(1).get();
            if (roomSnap.empty) {
                alert("Room not found.");
                return;
            }
            const roomId = roomSnap.docs[0].id;

            // Remove roomId from user's joinedRooms array
            const userRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            await userRef.update({
                joinedRooms: firebase.firestore.FieldValue.arrayRemove(roomId)
            });

            // Delete from rooms/{roomId}/members
            await this.db.collection("rooms").doc(roomId).collection("members").doc(this.auth.currentUser.uid).delete();

            // Check if the room being left is a supervisor room (has geofence)
            const geoSnap = await this.db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
            const isSupervisorRoom = !geoSnap.empty;

            // Close the popover
            const popover = document.getElementById(`popover-${roomCode}`);
            if (popover) {
                popover.classList.remove('show');
            }

            // Refresh the rooms list
            this.fetchJoinedRooms();

            // If the current active room is the one being left, hide the schedule
            const container = document.getElementById("roomScheduleContainer");
            if (container.dataset.activeRoom === roomCode) {
                container.classList.add("hidden");
                container.dataset.activeRoom = "";
                document.getElementById("joinRoomInput").parentElement.style.display = "flex";
                document.getElementById("joinedRoomsList").style.display = "block";
                document.getElementById("internRooms").parentElement.style.display = "block";
                window.uiManager.toggleJoinRoomButton();
            }

            // If leaving a supervisor room, update supervisor zone status
            if (isSupervisorRoom) {
                await window.supervisorZoneManager.checkSupervisorZoneStatus();
                alert("Successfully left the supervisor room! You have been disconnected from the supervisor zone.");
            } else {
                alert("Successfully left the room!");
                window.supervisorZoneManager.disconnectSupervisorZone();
                this.fetchJoinedRooms();
            }
        } catch (err) {
            console.error("Failed to leave room:", err);
            alert("Failed to leave room. Please try again.");
        }
    }
}

// Create global room manager instance
window.roomManager = new RoomManager();

// Export for use in modules
window.RoomManager = RoomManager;
