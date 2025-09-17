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
let confirmationShown = false;
let globalType = "unified";
let selectedRoomCode = null;
let schedules = [];
let currentDailyPage = 1;
const dailyRowsPerPage = 7;
let selectedScheduleIndex = null;
let coordinatorCode = "";

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
            document.getElementById("authModal").classList.add("hidden");
            document.getElementById("dashboard").classList.add("hidden");
            document.getElementById("loggedInEmail").textContent = user.email;

            // Show confirmation modal only if not already shown
            if (!confirmationShown) {
                document.getElementById("confirmModal").style.display = "flex";
                confirmationShown = true;
            } else {
                proceedToDashboard();
            }
        } else {
            document.getElementById("authModal").classList.remove("hidden");
            document.getElementById("dashboard").classList.add("hidden");
            document.getElementById("confirmModal").style.display = "none";
        }
    });
};

// Authentication Functions
// Converted authAction to async function to allow await usage
async function authAction() {
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
        ? "📝 Register"
        : "🔐 Log In";
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

    const roomData = roomSnapshot.docs[0].data();
    const internsEmails = roomData.interns || [];

    internList.innerHTML = "";
    if (internsEmails.length === 0) {
      internList.innerHTML = "<p class='text-sm text-gray-500'>No interns in this room.</p>";
      return;
    }

    for (const email of internsEmails) {
      try {
        // Fetch intern details from interns collection
        const internSnapshot = await db.collection("interns")
          .where("email", "==", email)
          .limit(1)
          .get();

        let internName = "Unnamed Intern";
        let internId = null;
        if (!internSnapshot.empty) {
          const internData = internSnapshot.docs[0].data();
          internName = internData.name || "Unnamed Intern";
          internId = internSnapshot.docs[0].id;
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
        const startDate = document.getElementById("startDateInput").value;
        const totalHours = parseFloat(document.getElementById("totalHoursInput").value);
        const timeMode = document.querySelector('input[name="timeMode"]:checked')?.value;
        const hoursPerDay = parseFloat(document.getElementById("hoursPerDay").value);

        const allowedDays = Array.from(document.querySelectorAll(".allowedDay:checked")).map(d => d.value);
        if (allowedDays.length === 0) throw new Error("Select at least one allowed day.");

        let dailyTimes = [];
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

        if (!selectedRoomCode) {
            alert("No room selected.");
            return;
        }

        // Compute end date & build dailyTimes array
        const daysNeeded = Math.ceil(totalHours / hoursPerDayValue);
        let currentDate = new Date(startDate);
        let counted = 0;

        while (counted < daysNeeded) {
            const dayName = currentDate.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
            if (allowedDays.includes(dayName)) {
                let dateStr = `${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}`;
                dailyTimes.push({
                    date: dateStr,
                    day: dayName,
                    start: timeMap[dayName].start,
                    end: timeMap[dayName].end
                });
                counted++;
            }
            if (counted < daysNeeded) currentDate.setDate(currentDate.getDate() + 1);
        }

        const endDate = currentDate.toISOString().split("T")[0];
        const coordinatorEmail = auth.currentUser?.email;
        if (!coordinatorEmail) throw new Error("User not authenticated.");

        // Save as new document (auto-generated ID)
        await db.collection("schedules").add({
            startDate,
            endDate,
            hpd: timeMode === "hoursPerDay" ? hoursPerDay : null,
            allowedDays,
            dailyTimes,
            totalHours,
            roomCode: selectedRoomCode,
            coordinatorEmail,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("Schedule saved successfully!");
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
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("confirmModal").style.display = "none";
    loadInterns();
    fetchRooms();
}

function logoutAndReset() {
    auth
        .signOut()
        .then(() => {
            confirmationShown = false; // Reset the flag
            document.getElementById("email").value = "";
            document.getElementById("password").value = "";
            document.getElementById("fullName").value = "";
            document.getElementById("organization").value = "";
            document.getElementById("authStatus").textContent = "";
            document.getElementById("authModal").classList.remove("hidden");
            document.getElementById("dashboard").classList.add("hidden");
            document.getElementById("confirmModal").style.display = "none";
        })
        .catch((err) => {
            console.error("Error during logout and reset:", err);
            alert("❌ Error processing request. Please try again.");
        });
}

// ======= Modal open/close =======
async function openEditScheduleModal() {
    // Pre-select Mon–Fri by default for sanity
    document
        .getElementById("scheduleInputModal")
        .classList.remove("hidden");
    document.getElementById("scheduleInputModal").classList.add("flex");
}

function closeScheduleInputModal() {
    document.getElementById("scheduleInputModal").classList.add("hidden");
    document.getElementById("scheduleInputModal").classList.remove("flex");
    clearInputErrors();
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
            dailyEnd = addHoursToTime(dailyStart, dailyHours);
        }
    } else {
        const st = document.getElementById("editStartTimeET").value;
        const et = document.getElementById("editEndTimeET").value;
        const diff = hoursBetween(st, et);
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

function parseHHMM(str) {
    if (!str || !/^\d{2}:\d{2}$/.test(str)) return null;
    const [h, m] = str.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return { h, m };
}

function hoursBetween(startStr, endStr) {
    const s = parseHHMM(startStr),
        e = parseHHMM(endStr);
    if (!s || !e) return null;
    let diff = e.h + e.m / 60 - (s.h + s.m / 60);
    if (diff < 0) diff += 24; // naive overnight support
    return diff;
}

function addHoursToTime(startStr, hours) {
    const s = parseHHMM(startStr);
    if (!s) return null;
    const total = s.h + s.m / 60 + hours;
    const wrapped = ((total % 24) + 24) % 24;
    const hh = Math.floor(wrapped);
    const mm = Math.round((wrapped - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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
            dailyEnd = addHoursToTime(dailyStart, dailyHours);
        }
    } else {
        const st = document.getElementById("startTimeET").value;
        const et = document.getElementById("endTimeET").value;
        const diff = hoursBetween(st, et);
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
                lastDayEndTime = addHoursToTime(dailyStart, todaysHours);
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
    ).textContent = `${dailyStart} - ${lastDayEndTime}`;
    document.getElementById("revTotalHours").textContent =
        String(totalHours);

    // Note if final day ends earlier than base dailyEnd (partial day)
    const partialNote =
        (mode === "hoursPerDay" &&
            lastDayEndTime !== addHoursToTime(dailyStart, dailyHours)) ||
        (mode === "endTime" &&
            hoursBetween(dailyStart, lastDayEndTime) !== dailyHours);
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
function logoutAllInterns() {
    if (!auth.currentUser) {
        alert("Please log in first.");
        return;
    }

    if (!confirm("Are you sure you want to log out all interns? This will sign out all interns from their accounts.")) {
        return;
    }

    const coordinatorEmail = auth.currentUser.email;
    
    // Show loading overlay
    document.getElementById("loadingOverlay").classList.remove("hidden");

    // Get all interns for this coordinator
    db.collection("interns")
        .where("coordinatorCode", "==", coordinatorCode)
        .get()
        .then((snapshot) => {
            if (snapshot.empty) {
                document.getElementById("loadingOverlay").classList.add("hidden");
                alert("No interns found to log out.");
                return;
            }

            const logoutPromises = [];
            
            snapshot.forEach((doc) => {
                const intern = doc.data();
                // Sign out the intern by clearing their auth state
                logoutPromises.push(
                    auth.signOut().catch(error => {
                        console.error(`Error signing out intern ${intern.email}:`, error);
                    })
                );
                
                // Clear intern's presence data
                logoutPromises.push(
                    db.collection("interns_inside").doc(doc.id).delete()
                        .catch(error => {
                            console.error(`Error clearing presence for ${intern.email}:`, error);
                        })
                );
            });

            return Promise.all(logoutPromises);
        })
        .then(() => {
            document.getElementById("loadingOverlay").classList.add("hidden");
            alert("All interns have been logged out successfully.");
            loadInterns(); // Refresh the intern list
        })
        .catch((error) => {
            document.getElementById("loadingOverlay").classList.add("hidden");
            console.error("Error logging out interns:", error);
            alert("Error logging out interns. Please try again.");
        });
}

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

        const snapshot = await db.collection("schedules")
            .where("roomCode", "==", selectedRoomCode)
            .orderBy("createdAt", "desc")
            .get();

        if (snapshot.empty) {
            if (container) {
                container.innerHTML = `<p class="text-center text-gray-500 col-span-full">No schedules found for this room.</p>`;
            }
            schedules = [];
            return;
        }

        schedules = snapshot.docs.map(doc => doc.data());
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
  const statusEl = document.getElementById("roomStatus");

  if (!roomName) {
    statusEl.textContent = "❌ Room name is required.";
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
      coordinatorCode,
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
            <button onclick="event.stopPropagation(); copyJoinCode('${joinCode}')" 
            class="text-blue-600 text-sm hover:underline">Copy Code</button>
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

function openScheduleModal() {
  if (!selectedRoomCode) {
    alert("No room selected.");
    return;
  }

  // Open existing schedule creation modal
  document.getElementById("scheduleInputModal").classList.remove("hidden");

  // Optionally update modal title to reflect room name
  document.getElementById("scheduleModalTitle").textContent = 
      `Create Schedule for Room: ${selectedRoomCode}`;
}

function closeRoomModal() {
    document.getElementById("roomModal").classList.add("hidden");
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
        // Create a container for this schedule's cards
        const scheduleContainer = document.createElement("div");
        scheduleContainer.className = "mb-6 p-4 border rounded-lg bg-gray-50";

        // Row for Start Date and End Date
        const dateRow = document.createElement("div");
        dateRow.className = "flex gap-2 mb-2";

        const startCard = document.createElement("div");
        startCard.className = "bg-white rounded-lg shadow p-4 flex-1";
        startCard.innerHTML = `<span class="font-semibold">Start Date:</span> ${schedule.startDate}`;

        const endCard = document.createElement("div");
        endCard.className = "bg-white rounded-lg shadow p-4 flex-1";
        endCard.innerHTML = `<span class="font-semibold">End Date:</span> ${schedule.endDate}`;

        dateRow.appendChild(startCard);
        dateRow.appendChild(endCard);

        // Row for Total Hours and Allowed Days
        const infoRow = document.createElement("div");
        infoRow.className = "flex gap-2 mb-2";

        const hoursCard = document.createElement("div");
        hoursCard.className = "bg-white rounded-lg shadow p-4 flex-1";
        hoursCard.innerHTML = `<span class="font-semibold">Total Hours:</span> ${schedule.totalHours}`;

        const daysCard = document.createElement("div");
        daysCard.className = "bg-white rounded-lg shadow p-4 flex-1";
        daysCard.innerHTML = `<span class="font-semibold">Allowed Days:</span> ${schedule.allowedDays.join(", ")}`;

        infoRow.appendChild(hoursCard);
        infoRow.appendChild(daysCard);

        // View button card
        const buttonCard = document.createElement("div");
        buttonCard.className = "rounded-lg text-center mt-3";
        const viewButton = document.createElement("button");
        viewButton.className = "bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600";
        viewButton.textContent = "View Daily Times";
        viewButton.onclick = () => toggleDailyTimes(index);
        buttonCard.appendChild(viewButton);

        // Append rows to container
        scheduleContainer.appendChild(dateRow);
        scheduleContainer.appendChild(infoRow);
        scheduleContainer.appendChild(buttonCard);

        container.appendChild(scheduleContainer);
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
                <td class="text-center p-3">${daily.start}</td>
                <td class="text-center p-3">${daily.end}</td>
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
