//import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
//import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
//import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
let map, marker, circle;
let confirmationShown = false;
let globalType = "unified";

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
});

// Authentication State Change
window.onload = () => {
    auth.onAuthStateChanged(async (user) => {
        if (user && user.emailVerified) {
            const snapshot = await db
                .collection("supervisors")
                .where("email", "==", user.email)
                .limit(1)
                .get();
            if (snapshot.empty) {
                alert(
                    "⚠️ This email is not registered as a supervisor. Logging out."
                );
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
function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const fullName = document.getElementById("fullName").value;
    const company = document.getElementById("company").value;
    const authStatus = document.getElementById("authStatus");

    if (isRegisterMode) {
        auth
            .createUserWithEmailAndPassword(email, password)
            .then((cred) => {
                return cred.user.sendEmailVerification().then(() => {
                    return db.collection("supervisors").add({
                        email,
                        fullName,
                        company,
                        createdAt: new Date(),
                    });
                });
            })
            .then(() => {
                authStatus.textContent =
                    "✅ Verification email sent. Please verify before logging in.";
            })
            .catch((err) => {
                authStatus.textContent = "❌ " + err.message;
            });
    } else {
        auth
            .signInWithEmailAndPassword(email, password)
            .then(async (cred) => {
                if (!cred.user.emailVerified) {
                    authStatus.textContent =
                        "⚠️ Please verify your email before logging in.";
                    auth.signOut();
                    return;
                }
                const snapshot = await db
                    .collection("supervisors")
                    .where("email", "==", email)
                    .limit(1)
                    .get();
                if (snapshot.empty) {
                    authStatus.textContent =
                        "❌ This email is not registered as a supervisor.";
                    auth.signOut();
                    return;
                }
            })
            .catch((err) => {
                authStatus.textContent = "❌ " + err.message;
            });
    }
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById("modalTitle").textContent = isRegisterMode
        ? "Supervisor Registration"
        : "Supervisor Login";
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

// Geofence Functions
function shortToKey(shortName) {
    // "Mon" -> "mon"
    return shortName.toLowerCase().slice(0, 3);
}

function onMapClick(e) {
    const radius = parseInt(document.getElementById("radiusInput").value);
    if (marker) map.removeLayer(marker);
    if (circle) map.removeLayer(circle);

    marker = L.marker(e.latlng).addTo(map);
    circle = L.circle(e.latlng, { radius: radius }).addTo(map);
}

function initMap() {
    map = L.map("map").setView([10.7502, 121.9324], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "Map data © OpenStreetMap contributors",
    }).addTo(map);

    disableGeofenceEdit(); // Disable editing by default
}

function loadGeofence() {
    const email = auth.currentUser.email;
    db.collection("geofences")
        .doc(email)
        .get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                const latlng = [data.center.lat, data.center.lng];
                const radius = data.radius || 100;
                document.getElementById("radiusInput").value = radius;

                if (marker) map.removeLayer(marker);
                if (circle) map.removeLayer(circle);

                marker = L.marker(latlng).addTo(map);
                circle = L.circle(latlng, { radius: radius }).addTo(map);
                map.setView(latlng, 16);
            }
        });
}

function enableGeofenceEdit() {
    document.getElementById("radiusInput").disabled = false;
    document.getElementById("saveGeofenceBtn").disabled = false;
    // Enable map click for editing geofence
    if (map) map.dragging.enable();
    if (map) map.on("click", onMapClick);
}

function disableGeofenceEdit() {
    document.getElementById("radiusInput").disabled = true;
    document.getElementById("saveGeofenceBtn").disabled = true;
    // Disable map click for editing geofence
    if (map) map.dragging.disable();
    if (map) map.off("click", onMapClick);
}

function saveGeofence() {
    const radius = parseInt(document.getElementById("radiusInput").value);
    if (!marker || !auth.currentUser) {
        document.getElementById("status").textContent =
            "⚠️ Select a location on the map first.";
        console.warn("saveGeofence: No marker or user.", {
            marker,
            user: auth.currentUser,
        });
        return;
    }
    const { lat, lng } = marker.getLatLng();
    const email = auth.currentUser.email;

    console.log("saveGeofence: Attempting to save geofence with values:", {
        lat,
        lng,
        radius,
        email,
    });

    db.collection("geofences")
        .doc(email)
        .set({
            center: { lat, lng },
            radius: radius,
            supervisorEmail: email,
            updatedAt: new Date(),
        })
        .then(() => {
            document.getElementById(
                "status"
            ).textContent = `✅ Geofence saved at (${lat.toFixed(
                4
            )}, ${lng.toFixed(4)}) with radius ${radius}m.`;
            console.log("saveGeofence: Geofence saved successfully.");
            disableGeofenceEdit(); // Disable editing after saving
        })
        .catch((error) => {
            document.getElementById("status").textContent =
                "❌ Failed to save geofence.";
            console.error("saveGeofence: Error saving geofence:", error);
            document.getElementById("status").textContent += ` (${
                error.code || error.message
            })`;
        });
}

// Intern Management Functions
function loadInterns() {
    console.log("loadInterns called");
    const email = auth.currentUser.email;
    const internList = document.getElementById("internList");
    internList.innerHTML =
        "<p class='text-sm text-gray-500'>Loading...</p>";

    // Fetch and display current schedule
    db.collection("schedules")
        .doc("mainSchedule")
        .get()
        .then((docSnap) => {
            const scheduleDetails = document.getElementById("scheduleDetails");
            if (docSnap.exists) {
                const schedule = docSnap.data();
                const {
                    startDate,
                    endDate,
                    allowedDays = [],
                    dailyTimes = {},
                    totalHours = 0,
                } = schedule;

                let dayLines = [];
                if (Object.keys(dailyTimes).length) {
                    DAY_KEYS.forEach((k) => {
                        if (allowedDays.includes(k) && dailyTimes[k]) {
                            const { start, end } = dailyTimes[k];
                            dayLines.push(`${DAY_LABELS[k]}: ${start} - ${end}`);
                        }
                    });
                } else {
                    allowedDays.forEach((k) =>
                        dayLines.push(`${DAY_LABELS[k]}: N/A`)
                    );
                }

                scheduleDetails.innerHTML = `
                    <div>
                    <strong>Date Range:</strong> ${startDate || "N/A"} - ${endDate || "N/A"}<br>
                    <strong>Days & Times:</strong><br>
                    <div class="mt-1 text-sm">${dayLines.length ? dayLines.join("<br>") : "N/A"}</div>
                    <br><strong>Total Hours:</strong> ${Number(totalHours).toFixed(2)} hrs
                    </div>
                `;
            } else {
                scheduleDetails.innerHTML =
                    "<span class='text-red-600'>No schedule set.</span>";
            }
        });


    // Load interns and compute presence status against the correct day's times
    db.collection("interns")
        .where("supervisorEmail", "==", email)
        .get()
        .then((snapshot) => {
            console.log("Intern query result size:", snapshot.size);
            internList.innerHTML = "";
            if (snapshot.empty) {
                internList.innerHTML =
                    "<p class='text-sm text-gray-500'>No interns assigned.</p>";
                return;
            }

            snapshot.forEach((docSnap) => {
                const intern = docSnap.data();
                const internId = docSnap.id;

                db.collection("interns_inside")
                    .doc(internId)
                    .get()
                    .then((presenceDoc) => {
                        let statusText = "";
                        let statusClass = "text-red-600";
                        let extraInfo = "";

                        if (presenceDoc.exists) {
                            const data = presenceDoc.data();
                            const timeIn = data.timeIn ? data.timeIn.toDate() : null;
                            const timeOut = data.timeOut ? data.timeOut.toDate() : null;
                            const timedIn = data.timedIn || false;

                            db.collection("schedules")
                                .doc(email)
                                .get()
                                .then((mainSchedule) => {
                                    if (mainSchedule.exists && timeIn && timeOut) {
                                        const s = mainSchedule.data();
                                        const allowed = s.allowedDays || [];
                                        const dt = s.dayTimes || {};
                                        const wdShort = timeIn.toLocaleDateString("en-US", {
                                            weekday: "short",
                                        }); // "Mon"
                                        const key = shortToKey(wdShort); // "mon"

                                        // Decide which times apply
                                        let st = dt[key]?.start || s.startTime;
                                        let et = dt[key]?.end || s.endTime;

                                        if (allowed.length && !allowed.includes(key)) {
                                            // Not a scheduled day → treat as outside schedule
                                            st = null;
                                            et = null;
                                        }

                                        if (st && et) {
                                            const [sh, sm] = st.split(":").map(Number);
                                            const [eh, em] = et.split(":").map(Number);

                                            const schedStart = new Date(timeIn);
                                            schedStart.setHours(sh || 0, sm || 0, 0, 0);

                                            const schedEnd = new Date(timeIn);
                                            schedEnd.setHours(eh || 0, em || 0, 0, 0);
                                            if (schedEnd < schedStart)
                                                schedEnd.setDate(schedEnd.getDate() + 1); // overnight safeguard

                                            if (timeOut < schedEnd) {
                                                const diffMin = Math.round(
                                                    (schedEnd - timeOut) / 60000
                                                );
                                                statusText = `⏰ Undertime (${diffMin} min left)`;
                                                statusClass = "text-yellow-600";
                                                extraInfo = `<br><span class='text-xs text-gray-500'>Time Out: ${timeOut.toLocaleTimeString()}</span>`;
                                            } else if (timeOut > schedEnd) {
                                                const diffMin = Math.round(
                                                    (timeOut - schedEnd) / 60000
                                                );
                                                statusText = `⏱️ Overtime (${diffMin} min extra)`;
                                                statusClass = "text-green-600";
                                                extraInfo = `<br><span class='text-xs text-gray-500'>Time Out: ${timeOut.toLocaleTimeString()}</span>`;
                                            } else {
                                                statusText = `✔️ On time`;
                                                statusClass = "text-green-600";
                                            }
                                        } else {
                                            statusText = `ℹ️ No schedule for ${DAY_LABELS[key]}`;
                                            statusClass = "text-gray-600";
                                        }
                                    }

                                    const timedInStatus = timedIn
                                        ? "✅ Timed In"
                                        : "❌ Not Timed In";
                                    const timedInClass = timedIn
                                        ? "text-green-600"
                                        : "text-red-600";

                                    internList.innerHTML += `
                  <li class="bg-gray-50 rounded-lg shadow p-4 flex justify-between items-center">
                    <div>
                      <h3 class="text-lg font-semibold">${
                                        intern.name || "Unnamed Intern"
                                    }</h3>
                      <p class="text-sm text-gray-500">${
                                        intern.email || ""
                                    }</p>
                      <p class="text-sm ${statusClass} font-medium mt-1">${statusText}</p>
                      <p class="text-sm ${timedInClass} font-medium mt-1">${timedInStatus}</p>
                      ${extraInfo}
                    </div>
                  </li>
                `;
                                })
                                .catch((err) => {
                                    console.error("Error loading schedule:", err);
                                    internList.innerHTML += `<li class="text-red-600">❌ Error loading schedule</li>`;
                                });
                        } else {
                            internList.innerHTML += `
                <li class="bg-gray-50 rounded-lg shadow p-4 flex justify-between items-center">
                  <div>
                    <h3 class="text-lg font-semibold">${
                                        intern.name || "Unnamed Intern"
                                    }</h3>
                    <p class="text-sm text-gray-500">${intern.email || ""}</p>
                    <p class="text-sm text-red-600 font-medium mt-1">❌ Not Timed In</p>
                  </div>
                </li>
              `;
                        }
                    })
                    .catch((err) => {
                        console.error("Error loading intern presence:", err);
                        internList.innerHTML += `<li class="text-red-600">❌ Error loading intern presence</li>`;
                    });
            });
        })
        .catch((err) => {
            console.error("Error loading interns:", err);
            internList.innerHTML =
                "<p class='text-sm text-red-600'>❌ Error loading interns.</p>";
        });
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

        const allowedDays = Array.from(document.querySelectorAll(".allowedDay:checked")).map(d => d.value);
        if (allowedDays.length === 0) throw new Error("Select at least one allowed day.");

        let dailyTimes = {};

        if (timeMode === "hoursPerDay") {
            const startTime = document.getElementById("startTimeHPD").value;
            const hoursPerDay = parseFloat(document.getElementById("hoursPerDay").value);
            if (!startTime || isNaN(hoursPerDay)) throw new Error("Start time and hours per day are required.");

            allowedDays.forEach(day => {
                // Convert start time to total minutes since midnight
                let [sh, sm] = startTime.split(":").map(Number);
                let startMinutes = sh * 60 + sm;

                // Add hoursPerDay converted to minutes
                let endMinutes = startMinutes + hoursPerDay * 60;
                endMinutes %= 1440; // wrap around 24 hours

                // Convert back to HH:MM
                let endHour = Math.floor(endMinutes / 60);
                let endMin = endMinutes % 60;

                let endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
                dailyTimes[day] = { start: startTime, end: endTime };
            });

        } else {
            const startTime = document.getElementById("startTimeET").value;
            const endTime = document.getElementById("endTimeET").value;
            if (!startTime || !endTime) throw new Error("Start and end times are required.");

            allowedDays.forEach(day => {
                dailyTimes[day] = { start: startTime, end: endTime };
            });
        }

        // Hours per day (first day as reference)
        const firstDay = allowedDays[0];
        const [sh, sm] = dailyTimes[firstDay].start.split(":").map(Number);
        const [eh, em] = dailyTimes[firstDay].end.split(":").map(Number);
        let startTotal = sh * 60 + sm;
        let endTotal = eh * 60 + em;
        let diffMinutes = endTotal - startTotal;
        if (diffMinutes <= 0) diffMinutes += 1440; // handle wrap around
        const hoursPerDayValue = diffMinutes / 60;

        if (hoursPerDayValue <= 0) throw new Error("Daily hours must be greater than zero.");

        // Compute end date
        const daysNeeded = Math.ceil(totalHours / hoursPerDayValue);
        let currentDate = new Date(startDate);
        let counted = 0;

        while (counted < daysNeeded) {
            const day = currentDate.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
            if (allowedDays.includes(day)) counted++;
            if (counted < daysNeeded) currentDate.setDate(currentDate.getDate() + 1);
        }

        const endDate = currentDate.toISOString().split("T")[0];

        // Get supervisor's email
        const supervisorEmail = auth.currentUser?.email;
        if (!supervisorEmail) throw new Error("User not authenticated.");

        await db.collection("schedules").doc("mainSchedule").set({
            startDate,
            endDate,
            allowedDays,
            dailyTimes,
            totalHours,
            supervisorEmail,
            updatedAt: new Date()
        });

        alert("Schedule saved successfully!");
        refreshScheduleDetails();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

function supervisorLogout() {
    auth
        .signOut()
        .then(() => {
            location.reload();
        })
        .catch((err) => {
            console.error("Error during supervisor logout:", err);
            alert("❌ Error logging out. Please try again.");
        });
}

function proceedToDashboard() {
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("confirmModal").style.display = "none";
    initMap(); // <-- Add this line
    loadGeofence();
    loadInterns();
}

function logoutAndReset() {
    auth
        .signOut()
        .then(() => {
            confirmationShown = false; // Reset the flag
            document.getElementById("email").value = "";
            document.getElementById("password").value = "";
            document.getElementById("fullName").value = "";
            document.getElementById("company").value = "";
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

    const supervisorEmail = auth.currentUser.email;
    
    // Show loading overlay
    document.getElementById("loadingOverlay").classList.remove("hidden");

    // Get all interns for this supervisor
    db.collection("interns")
        .where("supervisorEmail", "==", supervisorEmail)
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

function refreshScheduleDetails() {
    const scheduleDetails = document.getElementById("scheduleDetails");
    scheduleDetails.innerHTML = "<p class='text-sm text-gray-500'>Loading...</p>";

    db.collection("schedules")
        .doc("mainSchedule")
        .get()
        .then((doc) => {
            if (doc.exists) {
                const schedule = doc.data();
                const { startDate, endDate, allowedDays = [], dailyTimes = {}, totalHours = 0 } = schedule;

                let dayLines = [];
                if (Object.keys(dailyTimes).length) {
                    DAY_KEYS.forEach((k) => {
                        if (allowedDays.includes(k) && dailyTimes[k]) {
                            const { start, end } = dailyTimes[k];
                            dayLines.push(`${DAY_LABELS[k]}: ${start} - ${end}`);
                        }
                    });
                } else {
                    allowedDays.forEach((k) => dayLines.push(`${DAY_LABELS[k]}: N/A`));
                }

                scheduleDetails.innerHTML = `
                    <div>
                        <strong>Date Range:</strong> ${startDate || "N/A"} To ${endDate || "N/A"}<br>
                        <strong>Days & Times:</strong><br>
                        <div class="mt-1 text-sm">${dayLines.length ? dayLines.join("<br>") : "N/A"}</div>
                        <br><strong>Total Hours:</strong> ${Number(totalHours).toFixed(2)} hrs
                    </div>
                `;
            } else {
                scheduleDetails.innerHTML = "<span class='text-red-600'>No schedule set.</span>";
            }
        })
        .catch((err) => {
            console.error("Error refreshing schedule details:", err);
            scheduleDetails.innerHTML = "<p class='text-sm text-red-600'>Error loading schedule details.</p>";
        });
}


