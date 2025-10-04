// Firebase Configuration
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
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let isRegisterMode = false;
let globalType = "unified";
let selectedRoomCode = null;
let schedules = [];
let currentDailyPage = 1;
const dailyRowsPerPage = 7;
let selectedScheduleIndex = null;
let coordinatorCode = "";
let accumulatedHours = 0;
let timeEntries = [];
let editingIndex = -1;
let roomTotalHours = 0;

// Constants
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
};
const KEY_TO_JSWD = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
}; // Date.getDay()

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Prevent selecting an end date earlier than start date
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (startDateInput && endDateInput) {
        startDateInput.addEventListener("change", () => {
            endDateInput.min = startDateInput.value;
        });

        endDateInput.addEventListener("change", () => {
            if (endDateInput.value < startDateInput.value) {
                alert("⚠️ End date cannot be earlier than start date.");
                endDateInput.value = "";
            }
        });
    }

    // Toggle time mode blocks
    document.addEventListener("change", (e) => {
        if (e.target && e.target.name === "timeMode") {
            const mode = e.target.value; // 'hoursPerDay' | 'endTime'
            document
                .getElementById("hoursPerDayBlock")
                .classList.toggle("hidden", mode !== "hoursPerDay");
            document
                .getElementById("endTimeBlock")
                .classList.toggle("hidden", mode !== "endTime");
        }
    });

    // Daily times pagination buttons
    const prevDailyPageBtn = document.getElementById("prevDailyPageBtn");
    const nextDailyPageBtn = document.getElementById("nextDailyPageBtn");

    if (prevDailyPageBtn) {
        prevDailyPageBtn.addEventListener("click", prevDailyPage);
    }

    if (nextDailyPageBtn) {
        nextDailyPageBtn.addEventListener("click", nextDailyPage);
    }

    // Removed event listener for totalHoursInput to keep inputTotalHours fixed to roomTotalHours

    // Navigation event listeners
    document.getElementById('dashboard-nav').addEventListener('click', () => showSection('dashboard'));
    document.getElementById('tasks-nav').addEventListener('click', () => showSection('tasks'));
});

// Authentication State Change
window.onload = () => {
    auth.onAuthStateChanged(async (user) => {
        if (user && user.emailVerified) {
            const snapshot = await db
                .collection("coordinators")
                .where("email", "==", user.email)
                .limit(1)
                .get();
            if (snapshot.empty) {
                await auth.signOut();
                location.reload();
                return;
            }
            const data = snapshot.docs[0].data();
            coordinatorCode = data.code;
            document.getElementById("username").textContent = data.fullName || "Coordinator";
            document.getElementById("userEmail").textContent = user.email;
            document.getElementById("authModal").classList.add("hidden");
            document.getElementById("dashboard").classList.add("hidden");
            document.getElementById("loggedInEmail").textContent = user.email;

            // Show confirmation modal only if not already shown
            if (sessionStorage.getItem("justLoggedIn")) {
                document.getElementById("sidebar").classList.add("hidden");
                document.getElementById("confirmModal").style.display = "flex";
                sessionStorage.setItem("justLoggedIn", "false");
            } else {
                document.getElementById("sidebar").classList.remove("hidden");
                proceedToDashboard();
            }
        } else {
            document.getElementById("sidebar").classList.add("hidden");
            document.getElementById("authModal").classList.remove("hidden");
            document.getElementById("dashboard").classList.add("hidden");
            document.getElementById("confirmModal").style.display = "none";
        }
    });
};

// Authentication Functions
// Converted authAction to async function to allow await usage
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const fullName = document.getElementById("fullName").value;
    const organization = document.getElementById("organization").value;
    const authStatus = document.getElementById("authStatus");

    if (isRegisterMode) {
        if (!fullName || !organization) {
            authStatus.textContent = "❌ Full name and organization are required.";
            return;
        }
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            const code = generateCode();

            await db.collection("coordinators").doc(cred.user.uid).set({
                email,
                fullName,
                organization,
                code,
                createdAt: new Date()
            });

            await cred.user.sendEmailVerification();
            authStatus.textContent = `✅ Verification email sent. Please verify and then log in.`;
            await auth.signOut();
        } catch (err) {
            authStatus.textContent = "❌ " + err.message;
        }
    } else {
        try {
            const cred = await auth.signInWithEmailAndPassword(email, password);
            if (!cred.user.emailVerified) {
                authStatus.textContent = "⚠️ Please verify your email first.";
                await auth.signOut();
                return;
            }

            const rememberMe = document.getElementById("remember").checked;
            localStorage.setItem("rememberMe", rememberMe);

            sessionStorage.setItem("justLoggedIn", "true");

            const doc = await db.collection("coordinators").doc(cred.user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                coordinatorCode = data.code;
                document.getElementById("coordinatorName").textContent = data.fullName || "Coordinator";
                document.getElementById("coordinatorOrg").textContent = data.organization || "Unknown";
                document.getElementById("coordinatorCode").textContent = data.code || "N/A";
                document.getElementById("authModal").classList.add("hidden");
                document.getElementById("dashboard").classList.remove("hidden");
            } else {
                authStatus.textContent = "❌ Coordinator profile not found. Please register again.";
                await auth.signOut();
            }

        } catch (err) {
          authStatus.textContent = "❌ " + err.message;
        }
    }
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById("modalTitle").textContent = isRegisterMode
        ? "Coordinator Registration"
        : "Coordinator Login";
    document.getElementById("authButton").textContent = isRegisterMode
        ? "Register"
        : "Log In";
    document.getElementById("togglePrompt").textContent = isRegisterMode
        ? "Already have an account?"
        : "Don't have an account?";
    document.getElementById("toggleMode").textContent = isRegisterMode
        ? "Log in here"
        : "Register here";
    document
        .getElementById("extraFields")
        .classList.toggle("hidden", !isRegisterMode);
    document.getElementById("authStatus").textContent = "";
}

function generateCode() {
    const letters = Math.random().toString(36).substring(2, 6).toUpperCase();
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return letters + numbers;
}



// Intern Management Functions
async function loadInterns() {
  console.log("loadInterns called");

  const email = auth.currentUser?.email;
  const internList = document.getElementById("roomInternList");
  if (!internList) {
    console.error("Element with id 'roomInternList' not found.");
    return;
  }
  internList.innerHTML = "<p class='text-sm text-gray-500'>Loading...</p>";

  if (!email) {
    internList.innerHTML = "<p class='text-sm text-red-600'>No coordinator logged in.</p>";
    return;
  }

  try {
    if (!selectedRoomCode) {
      internList.innerHTML = "<p class='text-sm text-gray-500'>No room selected.</p>";
      return;
    }

    // Fetch room document
    const roomSnapshot = await db.collection("rooms")
      .where("joinCode", "==", selectedRoomCode)
      .limit(1)
      .get();

    if (roomSnapshot.empty) {
      internList.innerHTML = "<p class='text-sm text-red-600'>Room not found.</p>";
      return;
    }

    const roomDoc = roomSnapshot.docs[0];
    const membersSnapshot = await roomDoc.ref.collection("members").get();
    const internsEmails = membersSnapshot.docs.map(doc => doc.data().email).filter(email => email);

    internList.innerHTML = "";
    if (internsEmails.length === 0) {
      internList.innerHTML = "<p class='text-sm text-gray-500'>No interns in this room.</p>";
      return;
    }

    for (const email of internsEmails) {
      try {
        // Fetch intern details from rooms -> members subcollection
        const memberSnapshot = await roomDoc.ref.collection("members")
          .where("email", "==", email)
          .limit(1)
          .get();

        let internName = "Unnamed Intern";
        let internId = null;
        if (!memberSnapshot.empty) {
          const memberData = memberSnapshot.docs[0].data();
          internName = memberData.name || "Unnamed Intern";
          internId = memberSnapshot.docs[0].id;
        }

        let timedInStatus = "❌ Not Timed In";
        let timedInClass = "text-red-600";

        if (internId) {
          const presenceDoc = await db.collection("interns_inside").doc(internId).get();
          if (presenceDoc.exists) {
            const data = presenceDoc.data();
            if (data.status === "inside") {
              timedInStatus = "✅ Timed In";
              timedInClass = "text-green-600";
            }
          }
        }

        internList.innerHTML += `
          <li class="bg-gray-50 rounded-lg shadow p-4 flex justify-between items-center">
            <div>
              <h3 class="text-lg font-semibold">${internName}</h3>
              <p class="text-sm text-gray-500">${email}</p>
              <p class="text-sm ${timedInClass} font-medium mt-1">${timedInStatus}</p>
            </div>
            <div>
              <a href="#" onclick="openEditInternScheduleModal('${selectedRoomCode}', '${email}')" class="text-blue-600 hover:underline">Edit Schedule</a>
            </div>
          </li>
        `;

      } catch (presenceErr) {
        console.error("Error loading intern presence:", presenceErr);
        internList.innerHTML += `
          <li class="text-red-600">❌ Error loading presence for ${email}</li>`;
      }
    }

  } catch (err) {
    console.error("Error loading interns:", err);
    internList.innerHTML =
      "<p class='text-sm text-red-600'>❌ Error loading interns.</p>";
  }
}

function enableScheduleEdit() {
    document.getElementById("scheduleFormFields").style.display = "";
    document.getElementById("saveScheduleBtn").style.display = "";
    document.getElementById("editScheduleBtn").style.display = "none";
}

function toggleScheduleType(type) {
    globalType = type;
    document
        .getElementById("unifiedTimeFields")
        .classList.toggle("hidden", type !== "unified");
    document
        .getElementById("customScheduleFields")
        .classList.toggle("hidden", type !== "custom");
    if (type === "custom") toggleCustomDays();
}

function toggleCustomDays() {
    if (globalType === "custom") {
        const checked = new Set(
            Array.from(document.querySelectorAll(".dayCheckbox:checked")).map(
                (cb) => cb.value
            )
        );
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((label) => {
            const el = document.getElementById(label);
            if (el)
                el.classList.toggle("hidden", !checked.has(label.toLowerCase()));
        });
    }
}

async function saveSchedule() {
    try {
        const totalHours = parseFloat(document.getElementById("totalHoursInput").value);
        const coordinatorEmail = auth.currentUser?.email;
        const coordinatorUid = auth.currentUser?.uid;
        if (!coordinatorEmail || !coordinatorUid) throw new Error("User not authenticated.");
        if (!selectedRoomCode) throw new Error("No room selected.");

        const roomSnap = await db.collection("rooms").where("joinCode", "==", selectedRoomCode).limit(1).get();
        if (roomSnap.empty) throw new Error("Room not found.");
        const roomDoc = roomSnap.docs[0];
        const roomData = roomDoc.data();

        let daySchedules = [];

        // Build daySchedules
        if (timeEntries.length > 0) {
            // Manual time entry method
            timeEntries.forEach(entry => {
                daySchedules.push({
                    date: entry.date,
                    morningIn: entry.morning ? entry.morning.in : null,
                    morningOut: entry.morning ? entry.morning.out : null,
                    afternoonIn: entry.afternoon ? entry.afternoon.in : null,
                    afternoonOut: entry.afternoon ? entry.afternoon.out : null,
                    eveningIn: entry.evening ? entry.evening.in : null,
                    eveningOut: entry.evening ? entry.evening.out : null,
                    dayTotalHours: entry.dayHours,
                    totalHours: totalHours,
                    deductedFrom: `rooms/${selectedRoomCode}.remainingHours`,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: coordinatorUid
                });
            });
                } else {
                    // Automatic schedule method
                    const startDate = document.getElementById("startDateInput").value;
                    const timeMode = document.querySelector('input[name="timeMode"]:checked')?.value;
                    const hoursPerDay = parseFloat(document.getElementById("hoursPerDay").value);

                    const allowedDays = Array.from(document.querySelectorAll(".allowedDay:checked")).map(d => d.value);
                    if (allowedDays.length === 0) throw new Error("Select at least one allowed day.");

                    let timeMap = {};

                    // Determine start/end times per day
                    if (timeMode === "hoursPerDay") {
                        const startTime = document.getElementById("startTimeHPD").value;
                        if (!startTime || isNaN(hoursPerDay)) throw new Error("Start time and hours per day are required.");

                        allowedDays.forEach(day => {
                            let [sh, sm] = startTime.split(":").map(Number);
                            let startMinutes = sh * 60 + sm;
                            let endMinutes = startMinutes + hoursPerDay * 60;
                            endMinutes %= 1440;

                            let endHour = Math.floor(endMinutes / 60);
                            let endMin = endMinutes % 60;
                            let endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

                            timeMap[day] = { start: startTime, end: endTime };
                        });
                    } else {
                        const startTime = document.getElementById("startTimeET").value;
                        const endTime = document.getElementById("endTimeET").value;
                        if (!startTime || !endTime) throw new Error("Start and end times are required.");

                        allowedDays.forEach(day => {
                            timeMap[day] = { start: startTime, end: endTime };
                        });
                    }

                    // Compute daily hours
                    const firstDay = allowedDays[0];
                    const [sh, sm] = timeMap[firstDay].start.split(":").map(Number);
                    const [eh, em] = timeMap[firstDay].end.split(":").map(Number);
                    let startTotal = sh * 60 + sm;
                    let endTotal = eh * 60 + em;
                    let diffMinutes = endTotal - startTotal;
                    if (diffMinutes <= 0) diffMinutes += 1440;
                    const hoursPerDayValue = diffMinutes / 60;
                    if (hoursPerDayValue <= 0) throw new Error("Daily hours must be greater than zero.");

                    // Build dailyTimes array
                    const daysNeeded = Math.ceil(totalHours / hoursPerDayValue);
                    let currentDate = new Date(startDate);
                    let counted = 0;
                    let remaining = totalHours;

                    while (counted < daysNeeded) {
                        const dayName = currentDate.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
                        if (allowedDays.includes(dayName)) {
                            const todaysHours = Math.min(hoursPerDayValue, remaining);
                            remaining -= todaysHours;
                            const end = TimeUtils.addHoursToTime(timeMap[dayName].start, todaysHours);
                            let dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
                            daySchedules.push({
                                date: dateStr,
                                morningIn: timeMap[dayName].start,
                                morningOut: end,
                                afternoonIn: null,
                                afternoonOut: null,
                                eveningIn: null,
                                eveningOut: null,
                                dayTotalHours: todaysHours,
                                totalHours: totalHours,
                                deductedFrom: `rooms/${selectedRoomCode}.remainingHours`,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                createdBy: coordinatorUid
                            });
                            counted++;
                        }
                        if (counted < daysNeeded) currentDate.setDate(currentDate.getDate() + 1);
                    }
        }

        // Calculate total to deduct
        const totalToDeduct = daySchedules.reduce((sum, d) => sum + d.dayTotalHours, 0);

        // Save each day schedule in batch
        const batch = db.batch();
        daySchedules.forEach(dayData => {
            const ref = roomDoc.ref.collection("schedules").doc();
            batch.set(ref, dayData);
        });
        await batch.commit();

        // Deduct from remaining hours
        await roomDoc.ref.update({ remainingHours: (roomData.remainingHours || 0) - totalToDeduct });

        alert("Schedule saved successfully!");
        // Reset manual entries after save
        accumulatedHours = 0;
        timeEntries = [];
        updateProgressBar(0, totalHours);
        updateTimeEntryHistory();
        closeScheduleReviewModal();
        refreshScheduleDetails(); // Update UI to reflect new schedule
    } catch (err) {
        alert("Error: " + err.message);
    }
}

function coordinatorLogout() {
    auth
        .signOut()
        .then(() => {
            location.reload();
        })
        .catch((err) => {
            console.error("Error during coordinator logout:", err);
            alert("❌ Error logging out. Please try again.");
        });
}

function proceedToDashboard() {
    document.getElementById("sidebar").classList.remove("hidden");
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("confirmModal").style.display = "none";
    showSection('dashboard');
    loadInterns();
    fetchRooms();
}

function logoutAndReset() {
    auth
        .signOut()
        .then(() => {
            sessionStorage.removeItem("justLoggedIn");
            document.getElementById("email").value = "";
            document.getElementById("password").value = "";
            location.reload();
        })
        .catch((err) => {
            console.error("Error during logout:", err);
            alert("❌ Error logging out. Please try again.");
        });
}

// ======= Modal open/close =======
async function openEditScheduleModal(date) {
    // Find the schedule for the given date
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) {
        alert("Schedule not found.");
        return;
    }

    // Populate the modal with schedule data
    document.getElementById("editScheduleDate").value = date;
    document.getElementById("editMorningIn").value = schedule.morningIn || "";
    document.getElementById("editMorningOut").value = schedule.morningOut || "";
    document.getElementById("editAfternoonIn").value = schedule.afternoonIn || "";
    document.getElementById("editAfternoonOut").value = schedule.afternoonOut || "";
    document.getElementById("editEveningIn").value = schedule.eveningIn || "";
    document.getElementById("editEveningOut").value = schedule.eveningOut || "";

    // Store the date for saving
    window.editingScheduleDate = date;

    // Show the modal
    const modal = document.getElementById("editScheduleModal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeScheduleInputModal() {
    document.getElementById("scheduleInputModal").classList.add("hidden");
    document.getElementById("scheduleInputModal").classList.remove("flex");
    clearInputErrors();
}

function closeEditScheduleModal() {
    const modal = document.getElementById("editScheduleModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function saveEditedSchedule() {
    const date = window.editingScheduleDate;
    if (!date) {
        alert("No schedule selected for editing.");
        return;
    }

    const morningIn = document.getElementById("editMorningIn").value;
    const morningOut = document.getElementById("editMorningOut").value;
    const afternoonIn = document.getElementById("editAfternoonIn").value;
    const afternoonOut = document.getElementById("editAfternoonOut").value;
    const eveningIn = document.getElementById("editEveningIn").value;
    const eveningOut = document.getElementById("editEveningOut").value;

    // Validate times
    if ((morningIn && !morningOut) || (!morningIn && morningOut)) {
        alert("Morning times must be both filled or both empty.");
        return;
    }
    if ((afternoonIn && !afternoonOut) || (!afternoonIn && afternoonOut)) {
        alert("Afternoon times must be both filled or both empty.");
        return;
    }
    if ((eveningIn && !eveningOut) || (!eveningIn && eveningOut)) {
        alert("Evening times must be both filled or both empty.");
        return;
    }

    // Calculate new total hours
    let newTotalHours = 0;
    if (morningIn && morningOut) {
        const morningHours = TimeUtils.hoursBetween(morningIn, morningOut);
        if (morningHours !== null) newTotalHours += morningHours;
    }
    if (afternoonIn && afternoonOut) {
        const afternoonHours = TimeUtils.hoursBetween(afternoonIn, afternoonOut);
        if (afternoonHours !== null) newTotalHours += afternoonHours;
    }
    if (eveningIn && eveningOut) {
        const eveningHours = TimeUtils.hoursBetween(eveningIn, eveningOut);
        if (eveningHours !== null) newTotalHours += eveningHours;
    }

    try {
        // Find the schedule document
        const roomSnap = await db.collection("rooms").where("joinCode", "==", selectedRoomCode).limit(1).get();
        if (roomSnap.empty) throw new Error("Room not found.");
        const roomDoc = roomSnap.docs[0];
        const schedulesSnap = await roomDoc.ref.collection("schedules").where("date", "==", date).limit(1).get();
        if (schedulesSnap.empty) throw new Error("Schedule not found.");

        const scheduleDoc = schedulesSnap.docs[0];
        const scheduleData = schedulesSnap.docs[0].data();

        // Enforce dayTotalHours limit: newTotalHours must not exceed original dayTotalHours
        const originalDayTotalHours = scheduleData.dayTotalHours || 0;
        if (newTotalHours > originalDayTotalHours) {
            alert(`Total hours for the day cannot exceed the original value of ${originalDayTotalHours} hours.`);
            return;
        }
        if (newTotalHours < originalDayTotalHours) {
            alert(`Total hours for the day cannot be less than the original value of ${originalDayTotalHours} hours.`);
            return;
        }

        await scheduleDoc.ref.update({
            morningIn: morningIn || null,
            morningOut: morningOut || null,
            afternoonIn: afternoonIn || null,
            afternoonOut: afternoonOut || null,
            eveningIn: eveningIn || null,
            eveningOut: eveningOut || null,
            dayTotalHours: newTotalHours
        });

        alert("Schedule updated successfully!");
        closeEditScheduleModal();
        refreshScheduleDetails(); // Refresh the UI
    } catch (error) {
        console.error("Error updating schedule:", error);
        alert("Failed to update schedule.");
    }
}

async function deleteSchedule(date) {
    if (!confirm(`Are you sure you want to delete the schedule for ${date}?`)) {
        return;
    }

    try {
        // Find the room document
        const roomSnap = await db.collection("rooms").where("joinCode", "==", selectedRoomCode).limit(1).get();
        if (roomSnap.empty) throw new Error("Room not found.");
        const roomDoc = roomSnap.docs[0];
        const roomData = roomDoc.data();

        // Find the schedule document
        const schedulesSnap = await roomDoc.ref.collection("schedules").where("date", "==", date).limit(1).get();
        if (schedulesSnap.empty) throw new Error("Schedule not found.");
        const scheduleDoc = schedulesSnap.docs[0];
        const scheduleData = scheduleDoc.data();

        const dayTotalHours = scheduleData.dayTotalHours || 0;

        // Delete the schedule document
        await scheduleDoc.ref.delete();

        // Add back the hours to remainingHours
        const newRemainingHours = (roomData.remainingHours || 0) + dayTotalHours;
        await roomDoc.ref.update({ remainingHours: newRemainingHours });

        alert("Schedule deleted successfully!");
        refreshScheduleDetails(); // Refresh the UI
    } catch (error) {
        console.error("Error deleting schedule:", error);
        alert("Failed to delete schedule.");
    }
}

// ======= Modal 3: Edit Intern Schedule open/close =======
async function openEditInternScheduleModal(roomCode, internEmail) {
    console.log(`Debug: roomCode: ${roomCode}, internEmail: ${internEmail}`);
    if (!roomCode || !internEmail) {
        alert("Room code and intern email are required.");
        return;
    }
    // Store current intern info for update
    window.currentEditIntern = { roomCode, internEmail };

    // Clear previous errors and inputs
    clearEditInternInputErrors();
    clearEditInternInputs();

    // Fetch intern_data document for this intern in this room
    try {
        console.log(`Querying intern_data with room_code: ${roomCode}, intern_email: ${internEmail}`);
        const querySnapshot = await db.collection("intern_data")
            .where("room_code", "==", roomCode)
            .where("intern_email", "==", internEmail)
            .limit(1)
            .get();

        console.log(`Query result empty: ${querySnapshot.empty}`);
        if (querySnapshot.empty) {
            alert("No schedule data found for this intern.");
            return;
        }

        const doc = querySnapshot.docs[0];
        window.currentEditInternDocId = doc.id;
        const data = doc.data();
        console.log(`Fetched data:`, data);

        // Populate inputs with fetched data
        document.getElementById("editTotalHoursInput").value = data.totalHours || "";
        if (data.schedule) {
            document.getElementById("editStartDateInput").value = data.schedule.startDate || "";
            // Set time mode radios and inputs
            if (data.schedule.timeMode === "endTime") {
                document.querySelector('input[name="editTimeMode"][value="endTime"]').checked = true;
                document.getElementById("editHoursPerDayBlock").classList.add("hidden");
                document.getElementById("editEndTimeBlock").classList.remove("hidden");
                document.getElementById("editStartTimeET").value = data.schedule.startTime || "";
                document.getElementById("editEndTimeET").value = data.schedule.endTime || "";
            } else {
                document.querySelector('input[name="editTimeMode"][value="hoursPerDay"]').checked = true;
                document.getElementById("editHoursPerDayBlock").classList.remove("hidden");
                document.getElementById("editEndTimeBlock").classList.add("hidden");
                document.getElementById("editStartTimeHPD").value = data.schedule.startTime || "";
                document.getElementById("editHoursPerDay").value = data.schedule.hpd || "";
            }
            // Set allowed days checkboxes
            const allowedDays = data.schedule.allowedDays || [];
            document.querySelectorAll(".editAllowedDay").forEach(cb => {
                cb.checked = allowedDays.includes(cb.value);
            });
        }

        // Show modal
        const modal = document.getElementById("editInternScheduleModal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    } catch (error) {
        console.error("Error fetching intern schedule data:", error);
        alert("Failed to load intern schedule data.");
    }
}

function closeEditInternScheduleModal() {
    const modal = document.getElementById("editInternScheduleModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    clearEditInternInputErrors();
    clearEditInternInputs();
}

function clearEditInternInputErrors() {
    [
        "editTotalHoursError",
        "editStartDateError",
        "editHpdError",
        "editEtError",
        "editDaysError",
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = "";
            el.classList.add("hidden");
        }
    });
}

function clearEditInternInputs() {
    document.getElementById("editTotalHoursInput").value = "";
    document.getElementById("editStartDateInput").value = "";
    document.getElementById("editStartTimeHPD").value = "";
    document.getElementById("editHoursPerDay").value = "";
    document.getElementById("editStartTimeET").value = "";
    document.getElementById("editEndTimeET").value = "";
    document.querySelector('input[name="editTimeMode"][value="hoursPerDay"]').checked = true;
    document.getElementById("editHoursPerDayBlock").classList.remove("hidden");
    document.getElementById("editEndTimeBlock").classList.add("hidden");
    document.querySelectorAll(".editAllowedDay").forEach(cb => cb.checked = false);
}

// ======= Update intern schedule =======
async function updateInternSchedule() {
    clearEditInternInputErrors();

    const totalHours = Number(document.getElementById("editTotalHoursInput").value);
    const startDateStr = document.getElementById("editStartDateInput").value;
    const timeMode = document.querySelector('input[name="editTimeMode"]:checked')?.value || "hoursPerDay";

    const allowedDays = Array.from(document.querySelectorAll(".editAllowedDay:checked")).map(cb => cb.value);

    let hasError = false;
    if (!(totalHours > 0)) {
        showEditErr("editTotalHoursError", "Enter a valid total hours (> 0).");
        hasError = true;
    }
    if (!startDateStr) {
        showEditErr("editStartDateError", "Select a start date.");
        hasError = true;
    }
    if (allowedDays.length === 0) {
        showEditErr("editDaysError", "Select at least one allowed day.");
        hasError = true;
    }

    let dailyStart = null, dailyHours = null, dailyEnd = null;

    if (timeMode === "hoursPerDay") {
        dailyStart = document.getElementById("editStartTimeHPD").value;
        dailyHours = Number(document.getElementById("editHoursPerDay").value);
        if (!dailyStart || !(dailyHours > 0)) {
            showEditErr("editHpdError", "Provide Start Time and positive Hours per Day.");
            hasError = true;
        } else {
            dailyEnd = TimeUtils.addHoursToTime(dailyStart, dailyHours);
        }
    } else {
        const st = document.getElementById("editStartTimeET").value;
        const et = document.getElementById("editEndTimeET").value;
        const diff = TimeUtils.hoursBetween(st, et);
        if (!st || !et || diff === null || !(diff > 0)) {
            showEditErr("editEtError", "Provide valid Start and End times (End must be after Start; overnight allowed).");
            hasError = true;
        } else {
            dailyStart = st;
            dailyHours = diff;
            dailyEnd = et;
        }
    }

    if (hasError) return;

    // Compute end date by distributing totalHours across allowed weekdays
    const startDate = new Date(`${startDateStr}T00:00:00`);
    if (isNaN(startDate)) {
        showEditErr("editStartDateError", "Invalid date.");
        return;
    }

    let remaining = totalHours;
    let cursor = new Date(startDate);

    // Precompute allowed JS weekday indices
    const allowedWD = new Set(allowedDays.map(k => KEY_TO_JSWD[k]));

    // Loop with guard to avoid infinite loop
    const GUARD_DAYS = 366 * 5;
    let steps = 0;

    while (remaining > 0 && steps < GUARD_DAYS) {
        const wd = cursor.getDay();
        if (allowedWD.has(wd)) {
            const todaysHours = Math.min(dailyHours, remaining);
            remaining -= todaysHours;
        }
        cursor.setDate(cursor.getDate() + 1);
        steps++;
    }

    const endDateStr = cursor.toISOString().slice(0, 10);

    // Compute dailyTimes array
    const daysNeeded = Math.ceil(totalHours / dailyHours);
    let currentDate = new Date(startDateStr);
    let counted = 0;
    let dailyTimes = [];

    while (counted < daysNeeded) {
        const dayName = currentDate.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
        if (allowedDays.includes(dayName)) {
            let dateStr = `${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}`;
            dailyTimes.push({
                date: dateStr,
                day: dayName,
                start: dailyStart,
                end: dailyEnd
            });
            counted++;
        }
        if (counted < daysNeeded) currentDate.setDate(currentDate.getDate() + 1);
    }

    if (!window.currentEditIntern || !window.currentEditInternDocId) {
        alert("No intern selected for update.");
        return;
    }

    try {
        await db.collection("intern_data").doc(window.currentEditInternDocId).update({
            totalHours,
            schedule: {
                startDate: startDateStr,
                endDate: endDateStr,
                timeMode,
                startTime: dailyStart,
                endTime: dailyEnd,
                hpd: timeMode === "hoursPerDay" ? dailyHours : null,
                allowedDays,
                dailyTimes
            }
        });
        alert("Intern schedule updated successfully.");
        closeEditInternScheduleModal();
        // Optionally refresh UI or data here
    } catch (error) {
        console.error("Error updating intern schedule:", error);
        alert("Failed to update intern schedule.");
    }
}

function showEditErr(id, message) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = message;
        el.classList.remove("hidden");
    }
}

function backToInput() {
    closeScheduleReviewModal();
    openEditScheduleModal();
}

function closeScheduleReviewModal() {
    document.getElementById("scheduleReviewModal").classList.add("hidden");
    document.getElementById("scheduleReviewModal").classList.remove("flex");
}

// ======= Helpers =======
function clearInputErrors() {
    [
        "totalHoursError",
        "startDateError",
        "hpdError",
        "etError",
        "daysError",
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = "";
            el.classList.add("hidden");
        }
    });
}

// Manual entry functions
function addTimeEntry() {
    const totalHours = parseFloat(document.getElementById("totalHoursInput").value);
    const date = document.getElementById("startDateInput").value;
    const morningIn = document.getElementById("morningTimeIn").value;
    const morningOut = document.getElementById("morningTimeOut").value;
    const afternoonIn = document.getElementById("afternoonTimeIn").value;
    const afternoonOut = document.getElementById("afternoonTimeOut").value;
    const eveningIn = document.getElementById("eveningTimeIn").value;
    const eveningOut = document.getElementById("eveningTimeOut").value;

    // Validate date
    if (!date) {
        showErr("startDateError", "Select a date.");
        return;
    }

    // Check if date already exists (only if not editing)
    if (editingIndex === -1 && timeEntries.some(e => e.date === date)) {
        showErr("startDateError", "Date already added.");
        return;
    }

    // Calculate hours
    let dayHours = 0;
    let morningHours = 0, afternoonHours = 0, eveningHours = 0;
    if (morningIn && morningOut) {
        morningHours = TimeUtils.hoursBetween(morningIn, morningOut);
        if (morningHours === null || morningHours <= 0) {
            showErr("morningError", "Invalid morning times.");
            return;
        }
        dayHours += morningHours;
    }
    if (afternoonIn && afternoonOut) {
        afternoonHours = TimeUtils.hoursBetween(afternoonIn, afternoonOut);
        if (afternoonHours === null || afternoonHours <= 0) {
            showErr("afternoonError", "Invalid afternoon times.");
            return;
        }
        dayHours += afternoonHours;
    }
    if (eveningIn && eveningOut) {
        eveningHours = TimeUtils.hoursBetween(eveningIn, eveningOut);
        if (eveningHours === null || eveningHours <= 0) {
            showErr("eveningError", "Invalid evening times.");
            return;
        }
        dayHours += eveningHours;
    }
    if (dayHours === 0) {
        showErr("morningError", "At least one shift must be filled.");
        return;
    }

    const newEntry = {
        date,
        morning: morningIn && morningOut ? {in: morningIn, out: morningOut} : null,
        afternoon: afternoonIn && afternoonOut ? {in: afternoonIn, out: afternoonOut} : null,
        evening: eveningIn && eveningOut ? {in: eveningIn, out: eveningOut} : null,
        dayHours
    };

    if (editingIndex >= 0) {
        // Update existing entry
        timeEntries[editingIndex] = newEntry;
        editingIndex = -1;
    } else {
        // Add new entry
        timeEntries.push(newEntry);

        // Set date to next day
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        document.getElementById("startDateInput").value = nextDayStr;
    }

    // Recalculate accumulated hours
    accumulatedHours = timeEntries.reduce((sum, e) => sum + e.dayHours, 0);

    // Update progress bar
    updateProgressBar(accumulatedHours, totalHours);

    // Update history
    updateTimeEntryHistory();

    // Clear errors
    clearInputErrors();
}

function updateProgressBar(current, total) {
    const percentage = Math.min((current / total) * 100, 100);
    const progressEl = document.getElementById("inputTotalHours");
    progressEl.textContent = (total - current).toFixed(1);
    // Update clip-path
    const circleEl = document.querySelector('.relative .absolute.rounded-full.bg-blue-600');
    if (circleEl) {
        circleEl.style.clipPath = `circle(${percentage}% at 50% 50%)`;
    }
}

function updateTimeEntryHistory() {
    const historyEl = document.getElementById("timeEntryHistory");
    let html = "";
    timeEntries.forEach((entry, index) => {
        html += `<div class="mb-2 p-2 bg-white rounded border relative">
            <strong>${entry.date}</strong>: ${entry.dayHours.toFixed(1)} hours
            ${entry.morning ? `<br>Morning: ${formatTimeToAMPM(entry.morning.in)} - ${formatTimeToAMPM(entry.morning.out)}` : ''}
            ${entry.afternoon ? `<br>Afternoon: ${formatTimeToAMPM(entry.afternoon.in)} - ${formatTimeToAMPM(entry.afternoon.out)}` : ''}
            ${entry.evening ? `<br>Evening: ${formatTimeToAMPM(entry.evening.in)} - ${formatTimeToAMPM(entry.evening.out)}` : ''}
            <div class="absolute top-2 right-2 flex space-x-2">
                <button onclick="editTimeEntry(${index})" class="text-blue-600 hover:underline text-sm">Edit</button>
                <button onclick="deleteTimeEntry(${index})" class="text-red-600 hover:underline text-sm">Delete</button>
            </div>
        </div>`;
    });
    if (!html) html = "<p class='text-gray-500'>No time entries yet.</p>";
    historyEl.innerHTML = html;
}

// Edit time entry function
function editTimeEntry(index) {
    if (index < 0 || index >= timeEntries.length) {
        alert("Invalid time entry selected.");
        return;
    }
    const entry = timeEntries[index];

    // Set editing index
    editingIndex = index;

    // Populate inputs with selected entry data
    document.getElementById("startDateInput").value = entry.date || "";
    document.getElementById("morningTimeIn").value = entry.morning ? entry.morning.in : "";
    document.getElementById("morningTimeOut").value = entry.morning ? entry.morning.out : "";
    document.getElementById("afternoonTimeIn").value = entry.afternoon ? entry.afternoon.in : "";
    document.getElementById("afternoonTimeOut").value = entry.afternoon ? entry.afternoon.out : "";
    document.getElementById("eveningTimeIn").value = entry.evening ? entry.evening.in : "";
    document.getElementById("eveningTimeOut").value = entry.evening ? entry.evening.out : "";

    // Clear errors
    clearInputErrors();
}

// Delete time entry function
function deleteTimeEntry(index) {
    if (index < 0 || index >= timeEntries.length) {
        alert("Invalid time entry selected.");
        return;
    }
    if (!confirm("Are you sure you want to delete this time entry?")) {
        return;
    }
    // Remove the entry
    timeEntries.splice(index, 1);

    // Recalculate accumulated hours
    accumulatedHours = timeEntries.reduce((sum, e) => sum + e.dayHours, 0);
    updateProgressBar(accumulatedHours, parseFloat(document.getElementById("totalHoursInput").value) || 0);

    // Update history display
    updateTimeEntryHistory();
}

function reviewSchedule() {
    if (timeEntries.length > 0) {
        reviewManualSchedule();
    } else {
        computeAndReviewSchedule();
    }
}

function reviewManualSchedule() {
    const totalHours = parseFloat(document.getElementById("totalHoursInput").value);
    if (accumulatedHours < totalHours) {
        alert("Total hours not reached yet.");
        return;
    }

    // Populate review modal with manual entries
    const startDate = timeEntries.length > 0 ? timeEntries[0].date : "";
    const endDate = timeEntries.length > 0 ? timeEntries[timeEntries.length - 1].date : "";
    document.getElementById("revStartDate").textContent = startDate;
    document.getElementById("revEndDate").textContent = endDate;
    document.getElementById("revDays").textContent = "Manual";
    document.getElementById("revDailyTime").textContent = "Varies";
    document.getElementById("revTotalHours").textContent = accumulatedHours.toFixed(1);
    document.getElementById("revLastDayNote").textContent = "";

    // Populate time entries list
    const timeEntriesList = document.getElementById("revTimeEntriesList");
    let html = "";
    timeEntries.forEach(entry => {
        html += `<div class="mb-2 p-2 bg-white rounded border">
            <strong>${entry.date}</strong>: ${entry.dayHours.toFixed(1)} hours
            ${entry.morning ? `<br>Morning: ${formatTimeToAMPM(entry.morning.in)} - ${formatTimeToAMPM(entry.morning.out)}` : ''}
            ${entry.afternoon ? `<br>Afternoon: ${formatTimeToAMPM(entry.afternoon.in)} - ${formatTimeToAMPM(entry.afternoon.out)}` : ''}
            ${entry.evening ? `<br>Evening: ${formatTimeToAMPM(entry.evening.in)} - ${formatTimeToAMPM(entry.evening.out)}` : ''}
        </div>`;
    });
    if (!html) html = "<p class='text-gray-500'>No time entries.</p>";
    timeEntriesList.innerHTML = html;

    // Show the time entries section
    document.getElementById("revTimeEntriesSection").classList.remove("hidden");

    // Show Review modal
    closeScheduleInputModal();
    const rev = document.getElementById("scheduleReviewModal");
    rev.classList.remove("hidden");
    rev.classList.add("flex");
}

// ======= Core compute flow =======
function computeAndReviewSchedule() {
    clearInputErrors();

    // Collect inputs
    const totalHours = Number(
        document.getElementById("totalHoursInput").value
    );
    const startDateStr = document.getElementById("startDateInput").value;
    const mode =
        document.querySelector('input[name="timeMode"]:checked')?.value ||
        "hoursPerDay";

    const allowed = Array.from(
        document.querySelectorAll("#scheduleInputModal .allowedDay:checked")
    ).map((cb) => cb.value);

    // Validate base fields
    let hasErr = false;
    if (!(totalHours > 0)) {
        showErr("totalHoursError", "Enter a valid total hours (> 0).");
        hasErr = true;
    }
    if (!startDateStr) {
        showErr("startDateError", "Select a start date.");
        hasErr = true;
    }
    if (!allowed.length) {
        showErr("daysError", "Select at least one allowed day.");
        hasErr = true;
    }

    let dailyStart = null,
        dailyHours = null,
        dailyEnd = null;

    if (mode === "hoursPerDay") {
        dailyStart = document.getElementById("startTimeHPD").value;
        dailyHours = Number(document.getElementById("hoursPerDay").value);
        if (!dailyStart || !(dailyHours > 0)) {
            showErr(
                "hpdError",
                "Provide Start Time and positive Hours per Day."
            );
            hasErr = true;
        } else {
            dailyEnd = TimeUtils.addHoursToTime(dailyStart, dailyHours);
        }
    } else {
        const st = document.getElementById("startTimeET").value;
        const et = document.getElementById("endTimeET").value;
        const diff = TimeUtils.hoursBetween(st, et);
        if (!st || !et || diff === null || !(diff > 0)) {
            showErr(
                "etError",
                "Provide valid Start and End times (End must be after Start; overnight allowed)."
            );
            hasErr = true;
        } else {
            dailyStart = st;
            dailyHours = diff;
            dailyEnd = et;
        }
    }

    if (hasErr) return;

    // Compute end date by distributing totalHours across allowed weekdays
    const startDate = new Date(`${startDateStr}T00:00:00`);
    if (isNaN(startDate)) {
        showErr("startDateError", "Invalid date.");
        return;
    }

    let remaining = totalHours;
    let cursor = new Date(startDate);
    let lastDayEndTime = dailyEnd;

    // Precompute allowed JS weekday indices
    const allowedWD = new Set(allowed.map((k) => KEY_TO_JSWD[k]));

    // If the start day is allowed, we count that day first
    // Loop with sane guard (e.g., 5 years) to avoid infinite loop on pathological inputs
    const GUARD_DAYS = 366 * 5;
    let steps = 0;

    while (remaining > 0 && steps < GUARD_DAYS) {
        const wd = cursor.getDay(); // 0..6
        if (allowedWD.has(wd)) {
            const todaysHours = Math.min(dailyHours, remaining);
            remaining -= todaysHours;

            // If this is the final (possibly partial) day, adjust lastDayEndTime
            if (remaining <= 0) {
                lastDayEndTime = TimeUtils.addHoursToTime(dailyStart, todaysHours);
                break;
            }
        }
        // move to next day 00:00
        cursor.setDate(cursor.getDate() + 1);
        steps++;
    }

    const lastDayTimeFormatted = `${formatTimeToAMPM(dailyStart)} - ${formatTimeToAMPM(lastDayEndTime)}`;
    document.getElementById("revLastDayTime").textContent = lastDayTimeFormatted;

    const endDate = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate()
    ); // normalize
    const endDateStr = endDate.toISOString().slice(0, 10);

    // Populate Review modal
    document.getElementById("revStartDate").textContent = startDateStr;
    document.getElementById("revEndDate").textContent = endDateStr;
    document.getElementById("revDays").textContent = allowed
        .map((k) => DAY_LABELS[k])
        .join(", ");
    document.getElementById(
        "revDailyTime"
    ).textContent = `${formatTimeToAMPM(dailyStart)} - ${formatTimeToAMPM(lastDayEndTime)}`;
    document.getElementById("revTotalHours").textContent =
        String(totalHours);

    // Note if final day ends earlier than base dailyEnd (partial day)
    const partialNote =
        (mode === "hoursPerDay" &&
            lastDayEndTime !== TimeUtils.addHoursToTime(dailyStart, dailyHours)) ||
        (mode === "endTime" &&
            TimeUtils.hoursBetween(dailyStart, lastDayEndTime) !== dailyHours);
    const noteEl = document.getElementById("revLastDayNote");
    if (partialNote) {
        noteEl.textContent = `Note: Final day ends earlier to exactly meet ${totalHours} hours.`;
    } else {
        noteEl.textContent = "";
    }

    // Show Review modal
    closeScheduleInputModal();
    const rev = document.getElementById("scheduleReviewModal");
    rev.classList.remove("hidden");
    rev.classList.add("flex");
}

function showErr(id, message) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = message;
        el.classList.remove("hidden");
    }
}

// ======= Missing Functions =======
function formatTimeToAMPM(timeStr) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

async function refreshScheduleDetails() {
    try {
        if (!selectedRoomCode) {
            console.warn("No room selected. Cannot load schedules.");
            const container = document.getElementById("scheduleCardsContainer");
            if (container) {
                container.innerHTML = `<p class="text-center text-gray-500 col-span-full">Select a room to view schedules.</p>`;
            }
            return;
        }

        const container = document.getElementById("scheduleCardsContainer");
        if (container) {
            container.innerHTML = `<p class="text-center text-gray-500 col-span-full">Loading schedules...</p>`;
        }

        const snapshot = await db.collection("rooms").where("joinCode", "==", selectedRoomCode).limit(1).get();
        if (snapshot.empty) {
            if (container) {
                container.innerHTML = `<p class="text-center text-red-500 col-span-full">Room not found.</p>`;
            }
            schedules = [];
            return;
        }
        const roomDoc = snapshot.docs[0];

        // Fetch intern UIDs from members subcollection
        const membersSnap = await roomDoc.ref.collection("members").get();
        const internUids = membersSnap.docs.map(doc => doc.id);

        // Fetch schedules
        const schedulesSnap = await roomDoc.ref.collection("schedules").orderBy("createdAt", "desc").get();

        if (schedulesSnap.empty) {
            if (container) {
                container.innerHTML = `<p class="text-center text-gray-500 col-span-full">No schedules found for this room.</p>`;
            }
            schedules = [];
            return;
        }

        // Filter schedules to exclude those where uid matches any intern UID or totalHours is 0 or undefined
        const allSchedules = schedulesSnap.docs.map(doc => doc.data());
        schedules = allSchedules.filter(schedule => !internUids.includes(schedule.uid) && schedule.dayTotalHours !== 0 && schedule.dayTotalHours !== undefined);

        renderSchedulePage();
    } catch (error) {
        console.error("Error loading schedules:", error);
        const container = document.getElementById("scheduleCardsContainer");
        if (container) {
            container.innerHTML = `<p class="text-center text-red-500 col-span-full">Failed to load schedules: ${error.message}</p>`;
        }
    }
}


// Generate a unique 8-character join code
function generateJoinCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  for (let i = 0; i < 4; i++) code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  return code;
}

// Create Room Function
async function createRoom() {
  const roomName = document.getElementById("roomName").value.trim();
  const requiredHours = parseFloat(document.getElementById("requiredHours").value);
  const statusEl = document.getElementById("roomStatus");

  if (!roomName) {
    statusEl.textContent = "❌ Room name is required.";
    statusEl.classList.remove("text-green-600");
    statusEl.classList.add("text-red-600");
    return;
  }

  if (!requiredHours || requiredHours <= 0) {
    statusEl.textContent = "❌ Required hours must be a positive number.";
    statusEl.classList.remove("text-green-600");
    statusEl.classList.add("text-red-600");
    return;
  }

  const coordinatorEmail = auth.currentUser?.email;
  if (!coordinatorEmail) {
    statusEl.textContent = "❌ User not authenticated.";
    statusEl.classList.remove("text-green-600");
    statusEl.classList.add("text-red-600");
    return;
  }

  try {
    // Generate unique join code
    const joinCode = generateJoinCode();

    // Save room details in Firestore
    const roomRef = db.collection("rooms").doc();
    await roomRef.set({
      roomName,
      joinCode,
      coordinatorEmail,
      interns: [],
      totalHours: requiredHours,
      createdAt: new Date(),
    });

    statusEl.textContent = `✅ Room created! Join Code: ${joinCode}`;
    statusEl.classList.remove("text-red-600");
    statusEl.classList.add("text-green-600");

    selectedRoomCode = joinCode;
    openScheduleModal();
    fetchRooms();

    // Clear input
    document.getElementById("roomName").value = "";
    document.getElementById("requiredHours").value = "";
  } catch (err) {
    console.error("Error creating room:", err);
    statusEl.textContent = "❌ Failed to create room. Try again. " + err;
    statusEl.classList.remove("text-green-600");
    statusEl.classList.add("text-red-600");
  }
}


async function fetchRooms() {
  const roomList = document.getElementById("roomList");
  roomList.innerHTML = "<p class='text-sm text-gray-500'>Loading rooms...</p>";

  const coordinatorEmail = auth.currentUser?.email;
  if (!coordinatorEmail) {
    roomList.innerHTML = "<p class='text-sm text-red-600'>Not logged in.</p>";
    return;
  }

  try {
    const snapshot = await db.collection("rooms")
    .where("coordinatorEmail", "==", coordinatorEmail)
    .get();

    let html = "";
    snapshot.forEach(doc => {
      const { roomName, joinCode, createdAt } = doc.data();
      const date = createdAt?.toDate().toLocaleString() || "Unknown";
        html += `
        <li class="border rounded p-3 bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-100"
            onclick='showRoomDetails(${JSON.stringify(doc.data()).replace(/'/g, "\\'")})'>
            <div>
            <h3 class="text-lg font-semibold">${roomName}</h3>
            <p class="text-sm text-gray-500">Join Code: <strong>${joinCode}</strong></p>
            <p class="text-xs text-gray-400">Created: ${date}</p>
            </div>
            <div class="flex flex-col space-y-1">
                <button onclick="event.stopPropagation(); copyJoinCode('${joinCode}')" 
                class="text-blue-600 text-sm hover:underline">Copy Code</button>
                <button onclick="event.stopPropagation(); deleteRoom('${joinCode}')" 
                class="text-red-600 text-sm hover:underline">Delete Room</button>
            </div>
        </li>
        `;
    });
    roomList.innerHTML = html;
  } catch (err) {
    alert("Error fetching rooms: " + err);
    roomList.innerHTML = "<p class='text-sm text-red-600'>Failed to load rooms.</p>";
  }
}

function copyJoinCode(code) {
  navigator.clipboard.writeText(code)
    .then(() => alert(`Join code ${code} copied to clipboard!`))
    .catch(() => alert("Failed to copy code."));
}

async function deleteRoom(joinCode) {
    if (!confirm(`Are you sure you want to delete the room with code ${joinCode}? This action cannot be undone and will remove all associated schedules and tasks.`)) {
        return;
    }

    try {
        const snapshot = await db.collection("rooms").where("joinCode", "==", joinCode).limit(1).get();
        if (snapshot.empty) {
            alert("Room not found.");
            return;
        }

        const roomDoc = snapshot.docs[0];
        const batch = db.batch();

        // Delete all schedules in the room
        const schedulesSnap = await roomDoc.ref.collection("schedules").get();
        schedulesSnap.forEach(doc => batch.delete(doc.ref));

        // Delete all tasks in the room
        const tasksSnap = await roomDoc.ref.collection("tasks").get();
        tasksSnap.forEach(doc => batch.delete(doc.ref));

        // Delete the room document
        batch.delete(roomDoc.ref);

        await batch.commit();

        alert("Room deleted successfully.");
        fetchRooms();

        // If the deleted room was currently selected, go back to room list
        if (selectedRoomCode === joinCode) {
            backToRooms();
        }
    } catch (error) {
        console.error("Error deleting room:", error);
        alert("Failed to delete room. Please try again.");
    }
}


function showRoomDetails(room) {
  document.getElementById("roomDetailsTitle").textContent = room.roomName;
  document.getElementById("roomJoinCode").textContent = `Join Code: ${room.joinCode}`;

  selectedRoomCode = room.joinCode;

  // Reset schedule selection and hide daily times section
  selectedScheduleIndex = null;
  currentDailyPage = 1;
  document.getElementById("dailyTimesSection").classList.add("hidden");

  // Fetch and render interns dynamically
  fetchRoomInterns(selectedRoomCode);

  // Fetch and display schedules for this room
  refreshScheduleDetails();
  loadInterns();

  // Hide room list and show details
  document.getElementById("roomList").style.display = "none";
  document.getElementById("roomDetailsContainer").classList.remove("hidden");
}

function backToRooms() {
  // Hide details and show room list
  document.getElementById("roomDetailsContainer").classList.add("hidden");
  document.getElementById("roomList").style.display = "block";
}

async function fetchRoomInterns(roomCode) {
    const internList = document.getElementById("roomInternList");
    internList.innerHTML = "<li class='text-gray-500'>Loading interns...</li>";

    try {
        const roomDoc = await db.collection("rooms")
            .where("joinCode", "==", roomCode)
            .limit(1)
            .get();

        if (roomDoc.empty) {
            internList.innerHTML = "<li>No room data found.</li>";
            return;
        }

        const interns = roomDoc.docs[0].data().interns || [];
        if (interns.length === 0) {
            internList.innerHTML = "<li>No interns joined yet.</li>";
            return;
        }

        internList.innerHTML = interns.map(email => `<li>${email} <a href="#" onclick="openEditInternScheduleModal('${roomCode}', '${email}')" class="text-blue-600 hover:underline">Edit Schedule</a></li>`).join("");
    } catch (err) {
        internList.innerHTML = `<li class='text-red-500'>Error: ${err.message}</li>`;
    }
}

async function openScheduleModal() {
  if (!selectedRoomCode) {
    alert("No room selected.");
    return;
  }

  try {
    // Fetch room data to get totalHours
    const roomSnap = await db.collection("rooms").where("joinCode", "==", selectedRoomCode).limit(1).get();
    if (roomSnap.empty) {
      alert("Room not found.");
      return;
    }
    const roomDoc = roomSnap.docs[0];
    const roomData = roomDoc.data();
    const roomId = roomDoc.id;
    const totalHours = roomData.totalHours || 0;

    // Set roomTotalHours to totalHours, and inputTotalHours to totalHours
    roomTotalHours = totalHours;
    document.getElementById("totalHoursInput").value = totalHours;
    document.getElementById("inputTotalHours").textContent = totalHours;

    // Reset manual entry variables
    accumulatedHours = 0;
    timeEntries = [];
    updateProgressBar(0, totalHours);
    updateTimeEntryHistory();

    // Next button removed, modal only for input

    // Open existing schedule creation modal
    document.getElementById("scheduleInputModal").classList.remove("hidden");

    // Optionally update modal title to reflect room name
    document.getElementById("scheduleModalTitle").textContent =
        `Create Schedule for Room: ${selectedRoomCode}`;
  } catch (error) {
    console.error("Error opening schedule modal:", error);
    alert("Failed to load room data for schedule.");
  }
}

function closeRoomModal() {
    document.getElementById("roomModal").classList.add("hidden");
}

// ======= Modal 4: Create Room open/close =======
function openCreateRoomModal() {
    document.getElementById("createRoomModal").classList.remove("hidden");
    document.getElementById("createRoomModal").classList.add("flex");
}

function closeCreateRoomModal() {
    document.getElementById("createRoomModal").classList.add("hidden");
    document.getElementById("createRoomModal").classList.remove("flex");
    // Clear input and status
    document.getElementById("roomName").value = "";
    document.getElementById("roomStatus").textContent = "";
}

function renderSchedulePage() {
    const container = document.getElementById("scheduleCardsContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!schedules || schedules.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 col-span-full">No schedules found for this room.</p>`;
        return;
    }

    schedules.forEach((schedule, index) => {
        const date = schedule.date;
        const dayTotalHours = schedule.dayTotalHours;
        const morning = schedule.morningIn && schedule.morningOut ? `${formatTimeToAMPM(schedule.morningIn)} - ${formatTimeToAMPM(schedule.morningOut)}` : '';
        const afternoon = schedule.afternoonIn && schedule.afternoonOut ? `${formatTimeToAMPM(schedule.afternoonIn)} - ${formatTimeToAMPM(schedule.afternoonOut)}` : '';
        const evening = schedule.eveningIn && schedule.eveningOut ? `${formatTimeToAMPM(schedule.eveningIn)} - ${formatTimeToAMPM(schedule.eveningOut)}` : '';

        // Create card
        const card = document.createElement("div");
        card.className = "bg-white p-4 rounded shadow mb-4 hover:bg-gray-50";
        card.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <h3 class="text-lg font-bold">Schedule for ${date}</h3>
                <div class="flex space-x-2">
                    <button onclick="openEditScheduleModal('${date}')" class="text-blue-600 hover:text-blue-800 p-1" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteSchedule('${date}')" class="text-red-600 hover:text-red-800 p-1" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <p><strong>Total Hours:</strong> ${dayTotalHours}</p>
            ${morning ? `<p><strong>Morning:</strong> ${morning}</p>` : ''}
            ${afternoon ? `<p><strong>Afternoon:</strong> ${afternoon}</p>` : ''}
            ${evening ? `<p><strong>Evening:</strong> ${evening}</p>` : ''}
        `;

        container.appendChild(card);
    });
}



function selectSchedule(index) {
    selectedScheduleIndex = index;
    currentDailyPage = 1;
    renderDailyTimesPage();
    // Show the daily times table section
    document.getElementById("dailyTimesSection").classList.remove("hidden");
}

function toggleDailyTimes(index) {
    const section = document.getElementById("dailyTimesSection");
    if (section && !section.classList.contains("hidden") && selectedScheduleIndex === index) {
        section.classList.add("hidden");
        selectedScheduleIndex = null;
    } else {
        selectSchedule(index);
    }
}

function renderDailyTimesPage() {
    if (selectedScheduleIndex === null || !schedules[selectedScheduleIndex]) {
        document.getElementById("dailyTimesTableBody").innerHTML = `<tr><td colspan="4" class='text-center text-gray-500'>No schedule selected.</td></tr>`;
        document.getElementById("prevDailyPageBtn").disabled = true;
        document.getElementById("nextDailyPageBtn").disabled = true;
        document.getElementById("dailyPageInfo").textContent = "Page 0 of 0";
        return;
    }

    const schedule = schedules[selectedScheduleIndex];
    const dailyTimes = schedule.dailyTimes || [];
    const startIndex = (currentDailyPage - 1) * dailyRowsPerPage;
    const endIndex = startIndex + dailyRowsPerPage;
    const pageDailyTimes = dailyTimes.slice(startIndex, endIndex);

    const dailyTimesTableBody = document.getElementById("dailyTimesTableBody");
    let html = "";

    pageDailyTimes.forEach(daily => {
        html += `
            <tr class="border-b hover:bg-gray-50">
                <td class="text-center p-3">${daily.date}</td>
                <td class="text-center p-3">${DAY_LABELS[daily.day] || daily.day}</td>
                <td class="text-center p-3">${formatTimeToAMPM(daily.start)}</td>
                <td class="text-center p-3">${formatTimeToAMPM(daily.end)}</td>
            </tr>
        `;
    });

    dailyTimesTableBody.innerHTML = html;

    // Update pagination controls for daily times
    const totalPages = Math.ceil(dailyTimes.length / dailyRowsPerPage);
    document.getElementById("prevDailyPageBtn").disabled = currentDailyPage === 1;
    document.getElementById("nextDailyPageBtn").disabled = currentDailyPage === totalPages;
    document.getElementById("dailyPageInfo").textContent = `Page ${currentDailyPage} of ${totalPages}`;
}

function prevDailyPage() {
    if (currentDailyPage > 1) {
        currentDailyPage--;
        renderDailyTimesPage();
    }
}

function nextDailyPage() {
    const schedule = schedules[selectedScheduleIndex];
    const dailyTimes = schedule.dailyTimes || [];
    const totalPages = Math.ceil(dailyTimes.length / dailyRowsPerPage);
    if (currentDailyPage < totalPages) {
        currentDailyPage++;
        renderDailyTimesPage();
    }
}

// Navigation Functions
function showSection(sectionId) {
    // Hide all sections
    ['dashboard', 'tasks'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    // Show the selected section
    document.getElementById(sectionId).classList.remove('hidden');
    // Update nav active class
    ['dashboard-nav', 'time-nav', 'tasks-nav', 'reports-nav', 'settings-nav'].forEach(nav => {
        document.getElementById(nav).classList.remove('active');
    });
    document.getElementById(sectionId + '-nav').classList.add('active');
    // Load data if needed
    if (sectionId === 'tasks') {
        loadTasks();
    }
}

// Tasks Functions
async function openCreateTaskModal() {
    // Populate rooms
    const select = document.getElementById('taskRoom');
    select.innerHTML = '<option value="">Select a room</option>';
    const coordinatorEmail = auth.currentUser?.email;
    try {
        const snapshot = await db.collection('rooms').where('coordinatorEmail', '==', coordinatorEmail).get();
        snapshot.forEach(doc => {
            const data = doc.data();
            select.innerHTML += `<option value="${data.joinCode}">${data.roomName}</option>`;
        });
    } catch (err) {
        console.error('Error loading rooms:', err);
    }
    document.getElementById('createTaskModal').classList.remove('hidden');
    document.getElementById('createTaskModal').classList.add('flex');
}

function toggleDueDate() {
    const checkbox = document.getElementById('noDueDate');
    const dateInput = document.getElementById('taskDueDate');
    dateInput.disabled = checkbox.checked;
    if (checkbox.checked) {
        dateInput.value = '';
    }
}

function closeCreateTaskModal() {
    document.getElementById('createTaskModal').classList.add('hidden');
    document.getElementById('createTaskModal').classList.remove('flex');
    // Clear fields
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskDueDate').value = '';
    document.getElementById('noDueDate').checked = false;
    document.getElementById('taskDueDate').disabled = false;
    document.getElementById('taskRoom').value = '';
    document.getElementById('taskFile').value = '';
    document.getElementById('taskStatus').textContent = '';
    document.getElementById('taskStatus').classList.add('hidden');
}

async function createTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const dueDate = document.getElementById('taskDueDate').value;
    const noDueDate = document.getElementById('noDueDate').checked;
    const room = document.getElementById('taskRoom').value;
    const file = document.getElementById('taskFile').files[0];
    const statusEl = document.getElementById('taskStatus');
    statusEl.classList.add('hidden');
    if (!title || !description || (!dueDate && !noDueDate) || !room) {
        statusEl.textContent = '❌ All fields are required.';
        statusEl.classList.remove('hidden');
        return;
    }
    try {
        // Get roomId from joinCode
        const roomSnap = await db.collection('rooms').where('joinCode', '==', room).limit(1).get();
        if (roomSnap.empty) {
            statusEl.textContent = '❌ Room not found.';
            statusEl.classList.remove('hidden');
            return;
        }
        const roomId = roomSnap.docs[0].id;

        let fileUrl = null;
        if (file) {
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`tasks/${Date.now()}_${file.name}`);
            await fileRef.put(file);
            fileUrl = await fileRef.getDownloadURL();
        }
        await db.collection('rooms').doc(roomId).collection('tasks').add({
            title,
            description,
            dueDate: noDueDate ? null : dueDate,
            coordinatorId: auth.currentUser.uid,
            coordinatorEmail: auth.currentUser.email,
            fileUrl,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        statusEl.textContent = '✅ Task created successfully!';
        statusEl.classList.remove('hidden');
        closeCreateTaskModal();
        loadTasks();
    } catch (err) {
        statusEl.textContent = '❌ Error creating task: ' + err.message;
        statusEl.classList.remove('hidden');
    }
}

async function loadTasks() {
    const list = document.getElementById('tasksList');
    list.innerHTML = '<p class="text-gray-500">Loading tasks...</p>';
    const coordinatorEmail = auth.currentUser?.email;
    try {
        // Get rooms
        const roomsSnapshot = await db.collection('rooms').where('coordinatorEmail', '==', coordinatorEmail).get();
        if (roomsSnapshot.empty) {
            list.innerHTML = '<p class="text-gray-500">No rooms found.</p>';
            return;
        }
        // Get tasks for each room
        let allTasks = [];
        for (const roomDoc of roomsSnapshot.docs) {
            const tasksSnap = await roomDoc.ref.collection('tasks').orderBy('createdAt', 'desc').get();
            tasksSnap.forEach(doc => {
                allTasks.push({ id: doc.id, ...doc.data(), roomCode: roomDoc.data().joinCode });
            });
        }
        if (allTasks.length === 0) {
            list.innerHTML = '<p class="text-gray-500">No tasks found.</p>';
            return;
        }
        // Sort all tasks by createdAt desc
        allTasks.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
        let html = '';
        allTasks.forEach(task => {
            const fileLink = task.fileUrl ? `<a href="${task.fileUrl}" target="_blank" class="text-blue-600 hover:underline">Download File</a>` : 'No file';
            const dueDateText = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
            html += `
                <div class="bg-white p-4 rounded-lg shadow border">
                    <h3 class="text-lg font-semibold">${task.title}</h3>
                    <p class="text-gray-600 mt-2">${task.description}</p>
                    <p class="text-sm text-gray-500 mt-2">Due: ${dueDateText}</p>
                    <p class="text-sm text-gray-500">Room: ${task.roomCode}</p>
                    <p class="text-sm mt-2">${fileLink}</p>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = '<p class="text-red-600">Error loading tasks: ' + err.message + '</p>';
    }
}
