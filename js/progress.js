// Progress Module for Intern Dashboard
class ProgressManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.globalTotalHours = 0;
        this.init();
    }

    init() {
        // Initialization if needed
    }

    async loadTotalHours() {
        try {
            // Check if a room is selected
            const container = document.getElementById("roomScheduleContainer");
            const activeRoom = container.dataset.activeRoom;

            if (!activeRoom) {
                console.warn("No room selected for loading total hours");
                return;
            }

            const scheduleSnap = await this.db.collection("schedules")
                .where("roomCode", "==", activeRoom)
                .limit(1)
                .get();

            if (scheduleSnap.empty) {
                console.warn("No schedule found for the selected room");
                return;
            }

            const scheduleData = scheduleSnap.docs[0].data();
            const totalHours = scheduleData.totalHours || 0;
            this.globalTotalHours = totalHours;
        } catch (err) {
            console.error("Error loading total hours:", err);
        }
    }

    async loadHoursLeft() {
        if (!this.auth.currentUser) return;

        const totalHours = this.globalTotalHours;

        try {
            const internRef = this.db.collection("interns_inside").doc(this.auth.currentUser.uid);
            const internDoc = await internRef.get();

            let hoursLeft = totalHours; // Default to total hours if no record exists

            if (internDoc.exists) {
                const data = internDoc.data();
                hoursLeft = Math.round(Number(data.hoursLeft) || totalHours); // Round to whole number
            }

            const hoursValue = document.getElementById("hoursValue");
            const hoursProgress = document.getElementById("hoursProgress");

            // Only update if elements exist (to prevent errors)
            if (hoursValue && hoursProgress) {
                // Display hoursLeft on the circle
                hoursValue.textContent = `${hoursLeft} hrs`;

                // Progress is how much of totalHours is still left
                const progressPercent = totalHours > 0 ? (hoursLeft / totalHours) * 100 : 0;
                const degrees = (progressPercent / 100) * 360;

                // Update CSS variable to fill the circle
                hoursProgress.style.setProperty("--progress", `${degrees}deg`);
            }
        } catch (err) {
            console.error("Failed to load hours left:", err);
        }
    }

    async loadRoomProgress() {
        if (!this.auth.currentUser) return;

        try {
            const internRef = this.db.collection("interns").doc(this.auth.currentUser.uid);
            const internDoc = await internRef.get();

            if (!internDoc.exists) {
                console.error("Intern record not found.");
                return;
            }

            const internData = internDoc.data();
            const joinedCodes = internData.rooms || [];

            if (joinedCodes.length === 0) {
                document.getElementById("roomProgressContainer").innerHTML =
                    "<div class='text-center text-gray-500'>No rooms joined yet.</div>";
                return;
            }

            let progressHTML = "";

            for (const roomCode of joinedCodes) {
                try {
                    // Get room information
                    const roomSnap = await this.db.collection("rooms")
                        .where("joinCode", "==", roomCode)
                        .limit(1)
                        .get();

                    if (roomSnap.empty) continue;

                    const roomData = roomSnap.docs[0].data();
                    const roomName = roomData.roomName || "Unnamed Room";

                    // Only display rooms that are coordinator's rooms (not supervisor rooms)
                    // Check if this room is a coordinator room by checking if it has a coordinatorEmail field
                    if (!roomData.coordinatorEmail) {
                        // Skip this room if it is not a coordinator room
                        continue;
                    }

                    // Get schedule information for total hours
                    const scheduleSnap = await this.db.collection("schedules")
                        .where("roomCode", "==", roomCode)
                        .limit(1)
                        .get();

                    let totalHours = 0;
                    let hoursCompleted = 0;
                    let progressPercent = 0;

                    if (!scheduleSnap.empty) {
                        const scheduleData = scheduleSnap.docs[0].data();
                        totalHours = scheduleData.totalHours || 0;
                    }

                    // Get intern's progress for this room
                    const internProgressRef = this.db.collection("interns_inside").doc(this.auth.currentUser.uid);
                    const internProgressDoc = await internProgressRef.get();

                    if (internProgressDoc.exists) {
                        const progressData = internProgressDoc.data();
                        // Check if roomCode matches the current roomCode
                        if (progressData.roomCode === roomCode) {
                            // Calculate hours completed based on hours left
                            const hoursLeftValue = (progressData.hoursLeft === undefined || progressData.hoursLeft === null) ? totalHours : progressData.hoursLeft;
                            hoursCompleted = totalHours - hoursLeftValue;
                            progressPercent = totalHours > 0 ? (hoursCompleted / totalHours) * 100 : 0;
                        } else {
                            // If no matching roomCode, set progress to 0
                            hoursCompleted = 0;
                            progressPercent = 0;
                        }
                    }

                    progressHTML += `
                        <div class="bg-gray-50 p-4 rounded-lg shadow-sm border">
                            <h3 class="text-lg font-semibold text-blue-700 mb-3 text-center">${roomName}</h3>
                            <div class="progress-container">
                                <div class="circular-progress" style="--progress: ${progressPercent * 3.6}deg;">
                                    <span class="progress-value">${Math.round(progressPercent)}%</span>
                                </div>
                            </div>
                            <div class="progress-label text-center mt-2">
                                <div class="text-sm text-gray-600">
                                    ${hoursCompleted.toFixed(1)} / ${totalHours} hours
                                </div>
                                <div class="text-xs text-gray-400 mt-1">
                                    Room Code: ${roomCode}
                                </div>
                            </div>
                        </div>
                    `;
                } catch (err) {
                    console.error(`Error loading progress for room ${roomCode}:`, err);
                    progressHTML += `
                        <div class="bg-gray-50 p-4 rounded-lg shadow-sm border">
                            <h3 class="text-lg font-semibold text-red-600 mb-3 text-center">Error Loading Room</h3>
                            <div class="text-center text-gray-500">
                                Failed to load progress data
                            </div>
                        </div>
                    `;
                }
            }

            document.getElementById("roomProgressContainer").innerHTML = progressHTML;

        } catch (err) {
            console.error("Failed to load room progress:", err);
            document.getElementById("roomProgressContainer").innerHTML =
                "<div class='text-center text-red-500'>❌ Failed to load room progress</div>";
        }
    }

    async refreshBtn() {
        try {
            const internRef = this.db.collection("interns_inside").doc(this.auth.currentUser.uid);
            const internDoc = await internRef.get();

            const timeInBtn = document.getElementById("timeInButton");
            const timeOutBtn = document.getElementById("timeOutButton");

            if (internDoc.exists) {
                const data = internDoc.data();
                const status = data.status;

                if (status === "inside") {
                    timeInBtn.disabled = true;
                    timeOutBtn.disabled = false;
                    timeInBtn.style.opacity = 0.5;
                    timeOutBtn.style.opacity = 1;
                } else {
                    timeInBtn.disabled = false;
                    timeOutBtn.disabled = true;
                    timeInBtn.style.opacity = 1;
                    timeOutBtn.style.opacity = 0.5;
                }
            } else {
                // No record exists, so intern hasn't timed in yet
                timeInBtn.disabled = false;
                timeOutBtn.disabled = true;
                timeInBtn.style.opacity = 1;
                timeOutBtn.style.opacity = 0.5;
            }
        } catch (error) {
            alert("Error fetching status:" + error);
        }
    }

    async updateRoomProgress(roomCode) {
        try {
            // Get schedule information for total hours
            const scheduleSnap = await this.db.collection("schedules")
                .where("roomCode", "==", roomCode)
                .limit(1)
                .get();

            if (scheduleSnap.empty) return;

            const scheduleData = scheduleSnap.docs[0].data();
            const totalHours = scheduleData.totalHours || 0;

            // Get intern's progress for this room
            const internProgressRef = this.db.collection("interns_inside").doc(this.auth.currentUser.uid);
            const internProgressDoc = await internProgressRef.get();

            let hoursLeft = totalHours;
            let progressPercent = 0;

            if (internProgressDoc.exists) {
                const progressData = internProgressDoc.data();
                // Check if roomCode matches the current roomCode
                if (progressData.roomCode === roomCode) {
                    hoursLeft = progressData.hoursLeft || totalHours;
                    // Calculate progress percentage based on hours completed
                    const hoursCompleted = totalHours - hoursLeft;
                    progressPercent = totalHours > 0 ? (hoursCompleted / totalHours) * 100 : 0;
                }
            }

            // Find and update the specific room progress element
            const roomProgressElements = document.querySelectorAll('#roomProgressContainer > div');
            for (const element of roomProgressElements) {
                const codeElement = element.querySelector('.text-xs.text-gray-400');
                if (codeElement && codeElement.textContent.includes(roomCode)) {
                    const progressElement = element.querySelector('.circular-progress');
                    const valueElement = element.querySelector('.progress-value');
                    const hoursElement = element.querySelector('.text-sm.text-gray-600');

                    if (progressElement && valueElement && hoursElement) {
                        // Set the progress based on hours completed (totalHours - hoursLeft)
                        const hoursCompleted = totalHours - hoursLeft;
                        progressElement.style.setProperty('--progress', `${progressPercent * 3.6}deg`);
                        valueElement.textContent = `${Math.round(progressPercent)}%`;
                        hoursElement.textContent = `${hoursCompleted.toFixed(1)} / ${totalHours} hours`;
                    }
                    break;
                }
            }

        } catch (err) {
            console.error(`Error updating progress for room ${roomCode}:`, err);
        }
    }
}

// Create global progress manager instance
window.progressManager = new ProgressManager();

// Export for use in modules
window.ProgressManager = ProgressManager;
