// Geofence Module for Intern Dashboard
class GeofenceManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.geofenceCenter = null;
        this.geofenceRadius = 100;
        this.map = null;
        this.internMarker = null;
        this.geofenceCircle = null;
        this.mapInitialized = false;
        this.infoWindow = null;
        this.init();
    }

    init() {
        // Initialization if needed
    }

    async checkGeofence(roomCode = null) {
        if (!this.geofenceCenter || !this.geofenceRadius) {
            window.uiManager.showResultMessage("Geofence not set.", "error");
            return;
        }

        if (!navigator.geolocation) {
            window.uiManager.showResultMessage("Geolocation not supported.", "error");
            return;
        }

        // Check if a room is selected
        const container = document.getElementById("roomScheduleContainer");
        const activeRoom = container.dataset.activeRoom;

        if (!activeRoom && !roomCode) {
            window.uiManager.showResultMessage("Please select a room first.", "error");
            return;
        }

        const targetRoomCode = roomCode || activeRoom;
        window.uiManager.showResultMessage("Checking location", "info");

        // 1. Fetch the schedule for the selected room
        let scheduleDoc;
        try {
            const scheduleSnap = await this.db.collection("schedules")
                .where("roomCode", "==", targetRoomCode)
                .limit(1)
                .get();

            if (scheduleSnap.empty) {
                window.uiManager.showResultMessage("No schedule found for the selected room.", "error");
                return;
            }

            scheduleDoc = scheduleSnap.docs[0];
        } catch (err) {
            window.uiManager.showResultMessage("Failed to load schedule.", "error");
            return;
        }

        const schedule = scheduleDoc.data();
        const allowedDays = Array.isArray(schedule.allowedDays) ? schedule.allowedDays : [];

        // 2. Determine today's day key
        const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const todayKey = dayKeys[new Date().getDay()];

        if (!allowedDays.includes(todayKey)) {
            window.uiManager.showResultMessage(`You are not allowed to time in today (${todayKey.toUpperCase()}).`, "error");
            return;
        }

        // 3. Get today's start and end time from dailyTimes map
        const today = new Date();
        const todayDateStr = `${today.getMonth() + 1}-${today.getDate()}-${today.getFullYear()}`;
        console.log("Looking for schedule date:", todayDateStr);
        console.log("Available schedule dates:", schedule.dailyTimes?.map(t => t.date));

        const todayTimes = schedule.dailyTimes?.find(
            t => t.date === todayDateStr
        );

        if (!todayTimes) {
            window.uiManager.showResultMessage(`No schedule defined for today (${todayKey.toUpperCase()}).`, "error");
            return;
        }

        const startTime = todayTimes.start;
        const endTime = todayTimes.end;

        // 4. Validate current time with restriction: allow time in only 2 hours early before startTime
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Calculate earliest allowed time to time in (2 hours before startTime)
        const earliestAllowedMinutes = startMinutes - 120; // 2 hours = 120 minutes

        if (nowMinutes < earliestAllowedMinutes) {
            window.uiManager.showResultMessage(`You are too early to time in. Allowed starting from ${Math.floor(earliestAllowedMinutes / 60)}:${(earliestAllowedMinutes % 60).toString().padStart(2, '0')}`, "error");
            return;
        }

        // 5. Geolocation check
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                this.showCurrentLocationOnMap(lat, lng);

                const distance = this.getDistance(lat, lng, this.geofenceCenter[0], this.geofenceCenter[1]);

                if (distance <= this.geofenceRadius) {
                    // Determine mark: "Late" if time in after startTime, else "Present"
                    const mark = nowMinutes > startMinutes ? "Late" : "Present";

                    window.uiManager.showResultMessage(`Time-in recorded!`, "success");

                    const internRef = this.db.collection("interns_inside").doc(this.auth.currentUser.uid);

                    try {
                        const doc = await internRef.get();
                        if (doc.exists) {
                            // Document exists, update it
                            await internRef.update({
                                timeLogs: firebase.firestore.FieldValue.arrayUnion({
                                    timeIn: new Date(),
                                    location: { lat, lng },
                                    mark: mark
                                }),
                                internEmail: this.auth.currentUser.email,
                                supervisorEmail: window.authManager.currentIntern.supervisorEmail,
                                status: "inside",
                                recentTimeIn: new Date(),
                                roomCode: targetRoomCode,
                            });
                        } else {
                            // Document does not exist, create new one
                            // Fetch total hours from the schedule document for the selected room
                            const scheduleSnap = await this.db.collection("schedules")
                                .where("roomCode", "==", targetRoomCode)
                                .limit(1)
                                .get();

                            if (scheduleSnap.empty) {
                                window.uiManager.showResultMessage("Failed to fetch schedule", "error");
                                return;
                            }

                            const scheduleData = scheduleSnap.docs[0].data();
                            const totalHours = scheduleData.totalHours || 0;

                            await internRef.set({
                                timeLogs: [
                                    {
                                        timeIn: new Date(),
                                        location: { lat, lng },
                                        mark: mark
                                    },
                                ],
                                internEmail: this.auth.currentUser.email,
                                supervisorEmail: window.authManager.currentIntern.supervisorEmail,
                                status: "inside",
                                hoursLeft: totalHours,
                                recentTimeIn: new Date(),
                                createdAt: new Date(),
                                roomCode: targetRoomCode,
                            });
                        }

                        // Record intern report for time in
                        console.log("DEBUG: Auth state:", this.auth.currentUser);
                        console.log("DEBUG: Auth token:", this.auth.currentUser ? this.auth.currentUser.getIdToken() : "No token");

                        try {
                            // Always create new report document (consistent with time-out)
                            const internReportsRef = this.db.collection("intern_reports").doc();
                            await internReportsRef.set({
                                internEmail: this.auth.currentUser.email.toLowerCase(),
                                timeIn: new Date(),
                                mark: mark,
                                roomCode: targetRoomCode,
                                createdAt: new Date()
                            });
                        } catch (err) {
                            console.error("Failed to record intern report time in:", err);
                        }

                        // Update UI after successful operations
                        window.progressManager.loadTotalHours();
                        window.progressManager.loadHoursLeft();
                        window.progressManager.refreshBtn();

                        if (this.map) {
                            if (this.internMarker) this.map.removeLayer(this.internMarker);
                            this.internMarker = L.marker([lat, lng]).addTo(this.map)
                                .bindPopup("Your Location")
                                .openPopup();
                        }
                    } catch (err) {
                        console.error("Failed to record time-in:", err);
                        window.uiManager.showResultMessage("Failed to record time-in", "error");
                    }
                } else {
                    window.uiManager.showResultMessage("You are outside the geofence.", "error");
                }
            },
            () => {
                window.uiManager.showResultMessage("Unable to get location.", "error");
            }
        );
    }

    async timeOut() {
        if (!this.geofenceCenter || !this.geofenceRadius) {
            window.uiManager.showResultMessage("Geofence not set.", "error");
            return;
        }

        if (!navigator.geolocation) {
            window.uiManager.showResultMessage("Geolocation not supported.", "error");
            return;
        }

        window.uiManager.showResultMessage("Checking location", "info");

        // Check if a room is selected
        const container = document.getElementById("roomScheduleContainer");
        const activeRoom = container.dataset.activeRoom;

        if (!activeRoom) {
            window.uiManager.showResultMessage("Please select a room first.", "error");
            return;
        }

        let scheduleDoc;
        try {
            const scheduleSnap = await this.db.collection("schedules")
                .where("roomCode", "==", activeRoom)
                .limit(1)
                .get();

            if (scheduleSnap.empty) {
                window.uiManager.showResultMessage("No schedule found for the selected room.", "error");
                return;
            }

            scheduleDoc = scheduleSnap.docs[0];
        } catch (err) {
            window.uiManager.showResultMessage("Failed to load schedule.", "error");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                this.showCurrentLocationOnMap(lat, lng);

                const distance = this.getDistance(
                    lat,
                    lng,
                    this.geofenceCenter[0],
                    this.geofenceCenter[1]
                );

                if (distance <= this.geofenceRadius) {
                    // 1. Get today's schedule again for validation
                    const schedule = scheduleDoc.data();
                    const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
                    const todayKey = dayKeys[new Date().getDay()];
                    const todayDateStr = `${new Date().getMonth() + 1}-${new Date().getDate()}-${new Date().getFullYear()}`;
                    const todayTimes = schedule.dailyTimes?.find(
                        t => t.date === todayDateStr
                    );

                    if (!todayTimes) {
                        window.uiManager.showResultMessage(`No schedule defined for today (${todayKey.toUpperCase()}).`, "error");
                        return;
                    }


                    try {
                        const internRef = this.db.collection("interns_inside").doc(this.auth.currentUser.uid);

                        // 1. First get the current document to capture recentTimeIn
                        const internDoc = await internRef.get();
                        if (!internDoc.exists) throw new Error("Intern record not found.");

                        const data = internDoc.data();
                        const recentTimeIn = data.recentTimeIn ? data.recentTimeIn.toDate() : null;

                        // Fetch total hours from the schedule document for the selected room
                        const scheduleSnap = await this.db.collection("schedules")
                            .where("roomCode", "==", activeRoom)
                            .limit(1)
                            .get();

                        if (scheduleSnap.empty) throw new Error("Schedule not found for the selected room.");

                        const scheduleData = scheduleSnap.docs[0].data();
                        const totalHours = scheduleData.totalHours || 0;

                        const currentHoursLeft = Number(data.hoursLeft) || totalHours || 0;
                        const totalHoursRem = Number(data.totalHoursSpent) || 0;

                        // 2. Set timeOut, status, and determine labor_except
                        const timeOut = new Date();
                        const now = new Date();
                        const [endHour, endMin] = todayTimes.end.split(":").map(Number);
                        const endDateTime = new Date();
                        endDateTime.setHours(endHour, endMin, 0, 0);

                        let laborExcept = "normal";
                        if (now > endDateTime) {
                            laborExcept = "overtime";
                        } else if (now < endDateTime) {
                            laborExcept = "undertime";
                        }

                        // 3. Calculate hours spent if we have recentTimeIn
                        let hoursSpent = 0;
                        let hoursLeft = currentHoursLeft;
                        let newTotalHoursSpent = totalHoursRem;

                        if (recentTimeIn) {
                            const diffMs = timeOut - recentTimeIn; // in ms
                            hoursSpent = diffMs / (1000 * 60 * 60); // convert to hours

                            // 4. Deduct from current hours left
                            hoursLeft = Math.max(currentHoursLeft - hoursSpent, 0);

                            // Append to totalHoursSpent
                            newTotalHoursSpent = totalHoursRem + hoursSpent;
                        }

                        // Combine all updates into a single operation
                        const updateData = {
                            timeOut: timeOut,
                            location: { lat, lng },
                            status: "outside",
                            labor_except: laborExcept,
                            updatedAt: new Date(),
                            hoursLeft: hoursLeft,
                            totalHoursSpent: newTotalHoursSpent
                        };

                        if (recentTimeIn) {
                            updateData.hoursSpent = firebase.firestore.FieldValue.increment(hoursSpent);
                        }

                        await internRef.update(updateData);

                        // Record intern report for time out
                        const internReportsRef = this.db.collection("intern_reports").doc();
                        internReportsRef.set({
                            internEmail: this.auth.currentUser.email.toLowerCase(),
                            timeOut: new Date(),
                            labor_except: laborExcept,
                            roomCode: activeRoom,
                            createdAt: new Date()
                        }).catch((err) => {
                            console.error("Failed to record intern report time out:", err);
                        });

                        if (hoursLeft > 0 && hoursLeft !== currentHoursLeft && recentTimeIn) {
                            const { startDate, dailyTimes, hpd } = schedule; // hpd = hours per day

                            if (startDate && dailyTimes && hpd) {
                                let adjustedSchedule = [];
                                let remainingHours = hoursLeft;
                                let currentDate = new Date(startDate);

                                while (remainingHours > 0) {
                                    const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][currentDate.getDay()];
                                    const todaySchedule = dailyTimes.find(dt => dt.day === dayKey);

                                    if (todaySchedule) {
                                        const workHours = Math.min(hpd, remainingHours);
                                        adjustedSchedule.push({
                                            date: `${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}`,
                                            day: dayKey,
                                            start: todaySchedule.start,
                                            end: todaySchedule.end,
                                            hours: workHours
                                        });
                                        remainingHours -= workHours;
                                    }
                                    currentDate.setDate(currentDate.getDate() + 1);
                                }

                                try {
                                    await this.db.collection("interns_schedules")
                                    .doc(this.auth.currentUser.uid)
                                    .set({
                                        internEmail: this.auth.currentUser.email,
                                        adjusted_sched: adjustedSchedule,
                                        updatedAt: new Date()
                                    }, { merge: true });
                                } catch (scheduleErr) {
                                    console.warn("Failed to update intern schedule:", scheduleErr);
                                    // Don't fail the entire timeout operation if schedule update fails
                                }
                            }
                        }

                        window.uiManager.showResultMessage("Time-out recorded!", "success");
                        // Wait a moment for Firestore to propagate changes before refreshing UI
                        setTimeout(() => {
                            window.progressManager.loadTotalHours();
                            window.progressManager.loadHoursLeft();
                            window.progressManager.refreshBtn();
                        }, 500);
                    } catch (err) {
                        console.error("Failed to record time out:", err);
                        window.uiManager.showResultMessage("Failed to record time out: " + err.message, "error");
                    }

                    if (this.map) {
                        if (this.internMarker) this.map.removeLayer(this.internMarker);
                        this.internMarker = L.marker([lat, lng])
                            .addTo(this.map)
                            .bindPopup("Your Location (Timed Out)")
                            .openPopup();
                    }
                } else {
                    window.uiManager.showResultMessage("You are outside the geofence. Cannot time out.", "error");
                }
            },
            (err) => {
                window.uiManager.showResultMessage("Unable to get location.", "error");
            }
        );
    }

    getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    showCurrentLocationOnMap(lat, lng) {
        if (this.map) {
            if (this.internMarker) this.map.removeLayer(this.internMarker);
            this.internMarker = L.marker([lat, lng])
                .addTo(this.map)
                .bindPopup("You are here")
                .openPopup();
            this.map.setView([lat, lng], 17);
        }
    }
}

// Create global geofence manager instance
window.geofenceManager = new GeofenceManager();

// Export for use in modules
window.GeofenceManager = GeofenceManager;
