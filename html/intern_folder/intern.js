const firebaseConfig = {
    apiKey: "AIzaSyDaCCFqs7cwKMiicnlP2Ig3s-WHw8gyZts",
    authDomain: "index-database-d00f9.firebaseapp.com",
    projectId: "index-database-d00f9",
    storageBucket: "index-database-d00f9.firebasestorage.app",
    messagingSenderId: "310780304431",
    appId: "1:310780304431:web:18c2fdd5ab6405e80dfada",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let isRegisterMode = false;
let currentIntern = null;
let geofenceCenter = null;
let geofenceRadius = 100;
let justLoggedIn = false;
let timerInterval = null;
let map = null;
let internMarker = null;
let geofenceCircle = null;
let mapInitialized = false;
let infoWindow = null;

// Function to check and update supervisor zone UI
async function checkSupervisorZoneStatus() {
  try {
    const internRef = db.collection("interns").doc(auth.currentUser.uid);
    const internDoc = await internRef.get();
    if (!internDoc.exists) return;
    const internData = internDoc.data();
    const joinedCodes = internData.rooms || [];
    // Find supervisor rooms by checking "rooms" collection and if current user is in "interns" field
    let supervisorRoomCode = null;
    for (const roomCode of joinedCodes) {
      const roomSnap = await db.collection("rooms").where("joinCode", "==", roomCode).limit(1).get();
      if (!roomSnap.empty) {
        const roomData = roomSnap.docs[0].data();
        // Check if the room has a supervisorEmail field (indicating it's a supervisor room)
        if (!roomData.supervisorEmail) {
          continue; // Skip to the next room if no supervisorEmail
        }
        const interns = roomData.interns || [];
        if (interns.includes(auth.currentUser.email)) {
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
      // Hide input and button, show connected message with disconnect button
      inputDiv.style.display = 'none';
      connectedMsg.classList.remove('hidden');
      connectedMsg.innerHTML = `
        <p>Connected to supervisor zone: <strong>${supervisorRoomCode}</strong></p>
        <div class="flex gap-2 mt-2">
          <a href="#" onclick="toggleMapModal()" class="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition flex items-center gap-1">
            <i class="fas fa-map"></i>
            View Map
          </a>
          <button onclick="disconnectSupervisorZone()" class="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition flex items-center gap-1">
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

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById("modalTitle").textContent = isRegisterMode
        ? "INTERN REGISTRATION"
        : "INTERN LOGIN";
    document.getElementById("authButton").textContent = isRegisterMode
        ? "Register"
        : "Log In";
    document.getElementById("togglePrompt").textContent = isRegisterMode
        ? "Already have an account?"
        : "Don't have an account?";
    document.getElementById("extraFields")
        .classList.toggle("hidden", !isRegisterMode);
    document
        .getElementById("checkbox")
        .classList.toggle("hidden", isRegisterMode);
    document.getElementById("authStatus").textContent = "";

    // Update toggleMode button text
    const toggleModeBtn = document.getElementById("toggleMode");
    if (isRegisterMode) {
        toggleModeBtn.textContent = "Log in here";
    } else {
        toggleModeBtn.textContent = "Register here";
    }
}

async function authAction() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const fullName = document.getElementById("fullName").value;
    const school = document.getElementById("school").value;
    const supervisorEmail =
    document.getElementById("supervisorEmail").value;
    const code = document.getElementById("coordinatorCodeInput").value;
    const rememberMe = document.getElementById("remember").checked;
    const status = document.getElementById("authStatus");

    // Store remember me preference
    localStorage.setItem("rememberMe", rememberMe);

    if (isRegisterMode) {
        try {
            const snapshot = await db
                .collection("supervisors")
                .where("email", "==", supervisorEmail)
                .get();
            if (snapshot.empty) throw new Error("Supervisor not found");

            const query = await db
                .collection("coordinators")
                .where("code", "==", code)
                .get();
            if (query.empty) throw new Error("Invalid coordinator code.");

            const cred = await auth.createUserWithEmailAndPassword(
                email,
                password
            );
            await cred.user.sendEmailVerification();

            await db.collection("interns").doc(cred.user.uid).set({
                email,
                name: fullName,
                school,
                supervisorEmail,
                coordinatorCode: code,
                createdAt: new Date(),
            });
            status.textContent =
                "✅ Verification email sent. Please verify before logging in.";
        } catch (err) {
            status.textContent = "❌ " + err.message;
        }
    } else {
        const supervisorSnapshot = await db
            .collection("supervisors")
            .where("email", "==", email)
            .get();
        if (!supervisorSnapshot.empty) {
            status.textContent =
                "⚠️ This account is a supervisor. Please use the supervisor login.";
            return;
        }

        auth
            .signInWithEmailAndPassword(email, password)
            .then((cred) => {
                justLoggedIn = true;
                if (!cred.user.emailVerified) {
                    status.textContent = "⚠️ Please verify your email first.";
                    auth.signOut();
                    return;
                }
            })
            .catch((err) => {
                status.textContent = "❌ " + err.message;
            })
        ;
    }
}

auth.onAuthStateChanged(async (user) => {
    const modal = document.getElementById("authModal");
    const content = document.getElementById("mainContent");
    const sidebar = document.getElementById("sidebar");

    if (!user || !user.emailVerified) {
        modal.style.display = "flex";
        content.style.display = "none";
        return;
    }

    const internDoc = await db.collection("interns").doc(user.uid).get();
    if (!internDoc.exists) {
        await auth.signOut();
        modal.style.display = "flex";
        content.style.display = "none";
        return;
    }

    document.getElementById("authModal").style.display = "none";
    if (justLoggedIn) {
        proceedToDashboard();
        document.getElementById("sidebar").style.display = "block";
        document.getElementById("email").value = "";
        document.getElementById("password").value = "";
        document.getElementById("mainContent").style.display = "block";
        document.getElementById("heading").style.display = "block";
    } else {
        // Check if user has already seen the confirm modal in this session
        const hasSeenConfirmModal = sessionStorage.getItem('hasSeenConfirmModal');
        
        if (!hasSeenConfirmModal) {
            document.getElementById("confirmModal").style.display = "flex";
            document.getElementById("mainContent").style.display = "none";
            
            // Only hide mobile menu button on small screens (respect CSS breakpoints)
            if (window.innerWidth < 1024) {
                document.getElementById("mobile-menu-button").style.display = "none";
            }
            
            document.getElementById("heading").style.display = "none";
            document.getElementById("sidebar").style.display = "none";
            // Set flag in sessionStorage to remember user has seen the modal
            sessionStorage.setItem('hasSeenConfirmModal', 'true');
        } else {
            // User has already seen the modal, proceed directly to dashboard
            proceedToDashboard();
            document.getElementById("sidebar").style.display = "block";
            document.getElementById("mainContent").style.display = "block";
            document.getElementById("heading").style.display = "block";
        }
    }

    document.getElementById("loggedInEmail").textContent = user.email;

    currentIntern = internDoc.data();

    // Update user profile in sidebar
    document.getElementById("username").textContent =
        currentIntern.name || "Intern Name";
    document.getElementById("userEmail").textContent = user.email;

    // Update profile picture - try multiple sources
    const userPic = document.getElementById("userPic");
    let profilePic = "/images/default.webp";

    // Try different possible profile picture sources
    if (currentIntern.profilePicture) {
        profilePic = currentIntern.profilePicture;
    } else if (currentIntern.photoURL) {
        profilePic = currentIntern.photoURL;
    } else if (user.photoURL) {
        profilePic = user.photoURL;
    }

    userPic.src = profilePic;
    userPic.onerror = function () {
        this.src = "/images/default.webp";
    };

    loadInternData(currentIntern);

    // Initialize supervisor zone status on page load
    checkSupervisorZoneStatus();

    async function loadInternData(currentIntern) {
        let supervisorData = null;
        try {
            const snapshot = await db
            .collection("supervisors")
            .where("email", "==", currentIntern.supervisorEmail)
            .get();

            if (snapshot.empty) {
                document.getElementById("supervisorName").textContent = "Not found";
                document.getElementById("supervisorCompany").textContent =
                    "Not found";
                document.getElementById("geofenceCoords").textContent = "No data";
            } else {
                supervisorData = snapshot.docs[0].data();
                document.getElementById("supervisorName").textContent =
                    supervisorData.fullName || "Unnamed";
                document.getElementById("supervisorCompany").textContent =
                    supervisorData.company || "Unknown";
            }

            const geoSnap = await db
                .collection("geofences")
                .where("supervisorEmail", "==", currentIntern.supervisorEmail)
                .limit(1)
                .get();
            if (!geoSnap.empty) {
                const geo = geoSnap.docs[0].data();
                if (geo.center) {
                    geofenceCenter = [geo.center.lat, geo.center.lng];
                    geofenceRadius = geo.radius || 100;
                    document.getElementById(
                        "geofenceCoords"
                    ).textContent = `${geofenceCenter[0]}, ${geofenceCenter[1]}`;

                    // Initialize the map only once
                    setTimeout(() => {
                        console.log("🔍 DEBUG loadInternData: Initializing map for supervisor info");
                        const mapContainer = document.getElementById("map");
                        console.log("🔍 DEBUG loadInternData: Map container:", mapContainer);
                        if (!mapContainer) {
                            console.log("🔍 DEBUG loadInternData: Map container not found, skipping map initialization");
                            return;
                        }
                        console.log("🔍 DEBUG loadInternData: Map container dimensions:", mapContainer.offsetWidth, "x", mapContainer.offsetHeight);
                        console.log("🔍 DEBUG loadInternData: Map container visibility:", window.getComputedStyle(mapContainer).display, window.getComputedStyle(mapContainer).visibility);

                        if (!mapInitialized) {
                            console.log("🔍 DEBUG loadInternData: Creating new map instance");
                            map = L.map('map').setView([10.7502, 121.9324], 15);
                            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                                maxZoom: 19,
                            }).addTo(map);
                            mapInitialized = true;
                            console.log("🔍 DEBUG loadInternData: Map initialized successfully");
                        } else {
                            console.log("🔍 DEBUG loadInternData: Map already exists, setting view to geofence center");
                            if (map) {
                                map.setView([geofenceCenter[0], geofenceCenter[1]], 17);
                            }
                        }

                        // Remove previous geofence circle if exists
                        if (geofenceCircle) {
                            console.log("🔍 DEBUG loadInternData: Removing existing geofence circle");
                            map.removeLayer(geofenceCircle);
                        }

                        console.log("🔍 DEBUG loadInternData: Adding geofence circle at", geofenceCenter, "with radius", geofenceRadius);
                        geofenceCircle = L.circle(geofenceCenter, {
                            radius: geofenceRadius,
                            color: "red",
                            fillColor: "#f03",
                            fillOpacity: 0.3
                        }).addTo(map);

                        // Fit the map to the geofence bounds to showcase the whole circle
                        map.fitBounds(geofenceCircle.getBounds());
                    }, 300);
                }
            } else {
                document.getElementById("geofenceCoords").textContent =
                    "No geofence set";
            }

            // Load tasks for this intern's coordinator
            try {
                const tasksSnap = await db
                    .collection("tasks")
                    .where("coordinatorCode", "==", currentIntern.coordinatorCode)
                    .orderBy("createdAt", "desc")
                    .get();

                const taskList = document.getElementById("taskList");
                taskList.innerHTML = ""; // Clear loading message

                if (tasksSnap.empty) {
                    taskList.innerHTML =
                        "<li class='text-gray-500'>No tasks posted yet.</li>";
                } else {
                    tasksSnap.forEach((doc) => {
                        const task = doc.data();
                        const li = document.createElement("li");
                        li.className = "border border-gray-300 rounded p-4";
                        li.innerHTML = `
                            <h3 class="text-lg font-semibold text-blue-700 mb-1">${
                                task.title
                            }</h3>
                            <p class="text-gray-700 mb-1">${task.description}</p>
                            <p class="text-sm text-gray-500">Posted on: ${
                                task.createdAt?.toDate().toLocaleString() || "Unknown date"
                            }</p>
                        `;
                        taskList.appendChild(li);
                    });
                }
            } catch (err) {
                console.error("Error loading tasks:", err);
                document.getElementById("taskList").innerHTML =
                    "<li class='text-red-600'>❌ Failed to load tasks.</li>";
            }

        // Load supervisor's schedule for this intern

        // Load total hours for progress bar (only if a room is selected)
        const container = document.getElementById("roomScheduleContainer");
        const activeRoom = container.dataset.activeRoom;
        if (activeRoom) {
            loadTotalHours();
        }
        loadHoursLeft();
        refreshBtn();

        modal.style.display = "none";

        // ✅ At the very end of onAuthStateChanged
        setTimeout(() => {
            const loading = document.getElementById("loadingScreen");
            loading.classList.add("opacity-0");
            setTimeout(() => (loading.style.display = "none"), 300);
        }, 100);

        window.onload = () => {
            // ✅ Fix: define loading before using it
            const loading = document.getElementById("loadingScreen");
            setTimeout(() => {
                loading.classList.add("opacity-0");
                setTimeout(() => (loading.style.display = "none"), 500);
            }, 300);
        };
        } catch (err) {
            console.error("Failed to load intern data:", err);
        }


        // Load joined rooms - this will be handled by fetchJoinedRooms() function
        fetchJoinedRooms();
    }

});

let currentPage = 1;
const pageSize = 5;
let currentSchedules = [];

// Function to display result messages
function showResultMessage(message, type) {
  const resultDiv = document.getElementById('result');
  if (resultDiv) {
    resultDiv.textContent = message;
    resultDiv.className = `text-center text-lg font-semibold pb-5 pt-5 ${
      type === 'error' ? 'text-red-600' :
      type === 'success' ? 'text-green-600' :
      'text-blue-600'
    }`;
  }
}

async function displayRoomSchedule(roomCode) {
    const container = document.getElementById("roomScheduleContainer");
    const nonSupervisorElements = document.getElementById("nonSupervisorElements");
    const tableDiv = document.getElementById("roomScheduleTable");

    container.classList.remove("hidden");

    // Get room name
    let roomName = "Room Schedule";
    try {
        const roomSnap = await db.collection("rooms")
            .where("joinCode", "==", roomCode)
            .limit(1)
            .get();
        if (!roomSnap.empty) {
            roomName = roomSnap.docs[0].data().roomName || "Unnamed Room";
        }
    } catch (err) {
        console.error("Failed to fetch room name:", err);
    }
    document.getElementById("roomScheduleTitle").textContent = roomName;

    // Check if geofence exists for this room (supervisor room)
    const geoSnap = await db.collection("geofences").doc(roomCode).get();
    if (geoSnap.exists) {
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
        const scheduleSnap = await db.collection("schedules")
            .where("roomCode", "==", roomCode)
            .limit(1)
            .get();

        if (scheduleSnap.empty) {
            tableDiv.innerHTML = "<p class='text-gray-500'>No schedule found for this room.</p>";
            return;
        }

        const dailyTimes = scheduleSnap.docs[0].data().dailyTimes || [];
        if (dailyTimes.length === 0) {
            tableDiv.innerHTML = "<p class='text-gray-500'>No schedule entries for this room.</p>";
            return;
        }

        currentSchedules = dailyTimes.sort((a, b) => {
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dateB - dateA;
        });

        currentPage = 1;
        renderScheduleTable();

        // Pagination controls
        document.getElementById("prevPage").onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderScheduleTable();
            }
        };
        document.getElementById("nextPage").onclick = () => {
            if (currentPage < Math.ceil(currentSchedules.length / pageSize)) {
                currentPage++;
                renderScheduleTable();
            }
        };
    } catch (err) {
        console.error("Failed to fetch room schedule:", err);
        tableDiv.innerHTML = "<p class='text-red-500'>❌ Failed to load schedule.</p>";
    }
}


function renderScheduleTable() {
    const tableDiv = document.getElementById("roomScheduleTable");
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = currentSchedules.slice(start, end);

    let html = `
        <table class="min-w-full text-sm text-left text-gray-500 shadow">
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
                const [month, day, year] = s.date.split('-').map(Number);
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
        pageInfo.textContent = `Page ${currentPage} of ${Math.ceil(currentSchedules.length / pageSize)}`;
    }
}

function proceedToDashboard() {
    document.getElementById("confirmModal").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
    document.getElementById("sidebar").style.display = "block";
    document.getElementById("heading").style.display = "block";
    
    // Only show mobile menu button on small screens (respect CSS breakpoints)
    if (window.innerWidth < 1024) {
        document.getElementById("mobile-menu-button").style.display = "block";
    }
    
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
}

function logoutAndReset() {
    if (confirm("Are you sure you want to logout?")) {
        firebase
            .auth()
            .signOut()
            .then(() => {
                document.getElementById("confirmModal").style.display = "none";
                document.getElementById("authModal").style.display = "flex";
                document.getElementById("mainContent").style.display = "none";
                document.getElementById("sidebar").style.display = "none";

                // Only hide mobile menu button on small screens (respect CSS breakpoints)
                if (window.innerWidth < 1024) {
                    document.getElementById("mobile-menu-button").style.display = "none";
                }

                document.getElementById("heading").style.display = "none";

                // Redirect to index.html after logout
                //window.location.href = "index.html";
            })
        ;
    }
}

async function checkGeofence(roomCode = null) {
    if (!geofenceCenter || !geofenceRadius) {
        showResultMessage("Geofence not set.", "error");
        return;
    }

    if (!navigator.geolocation) {
        showResultMessage("Geolocation not supported.", "error");
        return;
    }

    // Check if a room is selected
    const container = document.getElementById("roomScheduleContainer");
    const activeRoom = container.dataset.activeRoom;

    if (!activeRoom && !roomCode) {
        showResultMessage("Please select a room first.", "error");
        return;
    }

    const targetRoomCode = roomCode || activeRoom;
    showResultMessage("Checking location", "info");

    // 1. Fetch the schedule for the selected room
    let scheduleDoc;
    try {
        const scheduleSnap = await db.collection("schedules")
            .where("roomCode", "==", targetRoomCode)
            .limit(1)
            .get();
            
        if (scheduleSnap.empty) {
            showResultMessage("No schedule found for the selected room.", "error");
            return;
        }

        scheduleDoc = scheduleSnap.docs[0];
    } catch (err) {
        showResultMessage("Failed to load schedule.", "error");
        return;
    }

    const schedule = scheduleDoc.data();
    const allowedDays = Array.isArray(schedule.allowedDays) ? schedule.allowedDays : [];

    // 2. Determine today's day key
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = dayKeys[new Date().getDay()];

    if (!allowedDays.includes(todayKey)) {
        showResultMessage(`You are not allowed to time in today (${todayKey.toUpperCase()}).`, "error");
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
        showResultMessage(`No schedule defined for today (${todayKey.toUpperCase()}).`, "error");
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
        showResultMessage(`You are too early to time in. Allowed starting from ${Math.floor(earliestAllowedMinutes / 60)}:${(earliestAllowedMinutes % 60).toString().padStart(2, '0')}`, "error");
        return;
    }

    // 5. Geolocation check
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            showCurrentLocationOnMap(lat, lng);

            const distance = getDistance(lat, lng, geofenceCenter[0], geofenceCenter[1]);

            if (distance <= geofenceRadius) {
                // Determine mark: "Late" if time in after startTime, else "Present"
                const mark = nowMinutes > startMinutes ? "Late" : "Present";

                showResultMessage(`Time-in recorded!`, "success");

                const internRef = db.collection("interns_inside").doc(auth.currentUser.uid);

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
                            internEmail: auth.currentUser.email,
                            supervisorEmail: currentIntern.supervisorEmail,
                            status: "inside",
                            recentTimeIn: new Date(),
                            roomCode: targetRoomCode,
                        });
                    } else {
                        // Document does not exist, create new one
                        // Fetch total hours from the schedule document for the selected room
                        const scheduleSnap = await db.collection("schedules")
                            .where("roomCode", "==", targetRoomCode)
                            .limit(1)
                            .get();

                        if (scheduleSnap.empty) {
                            showResultMessage("Failed to fetch schedule", "error");
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
                            internEmail: auth.currentUser.email,
                            supervisorEmail: currentIntern.supervisorEmail,
                            status: "inside",
                            hoursLeft: totalHours,
                            recentTimeIn: new Date(),
                            createdAt: new Date(),
                            roomCode: targetRoomCode,
                        });
                    }

                    // Record intern report for time in
                    console.log("DEBUG: Auth state:", auth.currentUser);
                    console.log("DEBUG: Auth token:", auth.currentUser ? auth.currentUser.getIdToken() : "No token");

                    try {
                        // Always create new report document (consistent with time-out)
                        const internReportsRef = db.collection("intern_reports").doc();
                        await internReportsRef.set({
                            internEmail: auth.currentUser.email.toLowerCase(),
                            timeIn: new Date(),
                            mark: mark,
                            roomCode: targetRoomCode,
                            createdAt: new Date()
                        });
                    } catch (err) {
                        console.error("Failed to record intern report time in:", err);
                    }

                    // Update UI after successful operations
                    loadTotalHours();
                    loadHoursLeft();
                    refreshBtn();

                    if (map) {
                        if (internMarker) map.removeLayer(internMarker);
                        internMarker = L.marker([lat, lng]).addTo(map)
                            .bindPopup("Your Location")
                            .openPopup();
                    }
                } catch (err) {
                    console.error("Failed to record time-in:", err);
                    showResultMessage("Failed to record time-in", "error");
                }
            } else {
                showResultMessage("You are outside the geofence.", "error");
            }
        },
        () => {
            showResultMessage("Unable to get location.", "error");
        }
    );
}

function getDistance(lat1, lng1, lat2, lng2) {
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



function to12Hour(timeStr) {
    if (!timeStr) return "N/A";
    const [hour, minute] = timeStr.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

function showCurrentLocationOnMap(lat, lng) {
    if (map) {
        if (internMarker) map.removeLayer(internMarker);
        internMarker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup("You are here")
            .openPopup();
        map.setView([lat, lng], 17);
    }
}

async function timeOut() {
    if (!geofenceCenter || !geofenceRadius) {
        showResultMessage("Geofence not set.", "error");
        return;
    }

    if (!navigator.geolocation) {
        showResultMessage("Geolocation not supported.", "error");
        return;
    }

    showResultMessage("Checking location", "info");

    // Check if a room is selected
    const container = document.getElementById("roomScheduleContainer");
    const activeRoom = container.dataset.activeRoom;

    if (!activeRoom) {
        showResultMessage("Please select a room first.", "error");
        return;
    }

    let scheduleDoc;
    try {
        const scheduleSnap = await db.collection("schedules")
            .where("roomCode", "==", activeRoom)
            .limit(1)
            .get();

        if (scheduleSnap.empty) {
            showResultMessage("No schedule found for the selected room.", "error");
            return;
        }

        scheduleDoc = scheduleSnap.docs[0];
    } catch (err) {
        showResultMessage("Failed to load schedule.", "error");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            showCurrentLocationOnMap(lat, lng);

            const distance = getDistance(
                lat,
                lng,
                geofenceCenter[0],
                geofenceCenter[1]
            );

            if (distance <= geofenceRadius) {
                // 1. Get today's schedule again for validation
                const schedule = scheduleDoc.data();
                const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
                const todayKey = dayKeys[new Date().getDay()];
                const todayDateStr = `${new Date().getMonth() + 1}-${new Date().getDate()}-${new Date().getFullYear()}`;
                const todayTimes = schedule.dailyTimes?.find(
                    t => t.date === todayDateStr
                );

                if (!todayTimes) {
                    showResultMessage(`No schedule defined for today (${todayKey.toUpperCase()}).`, "error");
                    return;
                }

                
                try {
                    const internRef = db.collection("interns_inside").doc(auth.currentUser.uid);

                    // 1. First get the current document to capture recentTimeIn
                    const internDoc = await internRef.get();
                    if (!internDoc.exists) throw new Error("Intern record not found.");

                    const data = internDoc.data();
                    const recentTimeIn = data.recentTimeIn ? data.recentTimeIn.toDate() : null;
                    
                    // Fetch total hours from the schedule document for the selected room
                    const scheduleSnap = await db.collection("schedules")
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
                    const internReportsRef = db.collection("intern_reports").doc();
                    internReportsRef.set({
                        internEmail: auth.currentUser.email.toLowerCase(),
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
                                await db.collection("interns_schedules")
                                .doc(auth.currentUser.uid)
                                .set({
                                    internEmail: auth.currentUser.email,
                                    adjusted_sched: adjustedSchedule,
                                    updatedAt: new Date()
                                }, { merge: true });
                            } catch (scheduleErr) {
                                console.warn("Failed to update intern schedule:", scheduleErr);
                                // Don't fail the entire timeout operation if schedule update fails
                            }
                        }
                    }

                    showResultMessage("Time-out recorded!", "success");
                    // Wait a moment for Firestore to propagate changes before refreshing UI
                    setTimeout(() => {
                        loadTotalHours();
                        loadHoursLeft();
                        refreshBtn();
                    }, 500);
                } catch (err) {
                    console.error("Failed to record time out:", err);
                    showResultMessage("Failed to record time out: " + err.message, "error");
                }

                if (map) {
                    if (internMarker) map.removeLayer(internMarker);
                    internMarker = L.marker([lat, lng])
                        .addTo(map)
                        .bindPopup("Your Location (Timed Out)")
                        .openPopup();
                }
            } else {
                showResultMessage("You are outside the geofence. Cannot time out.", "error");
            }
        },
        (err) => {
            showResultMessage("Unable to get location.", "error");
        }
    );
}

let globalTotalHours = 0;

// Function to load total hours and update progress bar
async function loadTotalHours() {
    try {
        // Check if a room is selected
        const container = document.getElementById("roomScheduleContainer");
        const activeRoom = container.dataset.activeRoom;
        
        if (!activeRoom) {
            console.warn("No room selected for loading total hours");
            return;
        }

        const scheduleSnap = await db.collection("schedules")
            .where("roomCode", "==", activeRoom)
            .limit(1)
            .get();
            
        if (scheduleSnap.empty) {
            console.warn("No schedule found for the selected room");
            return;
        }
        
        const scheduleData = scheduleSnap.docs[0].data();
        const totalHours = scheduleData.totalHours || 0;
        globalTotalHours = totalHours;
    } catch (err) {
        console.error("Error loading total hours:", err);
    }
}

async function loadHoursLeft() {
    if (!auth.currentUser) return;

    const totalHours = globalTotalHours;

    try {
        const internRef = db.collection("interns_inside").doc(auth.currentUser.uid);
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

async function loadRoomProgress() {
    if (!auth.currentUser) return;

    try {
        const internRef = db.collection("interns").doc(auth.currentUser.uid);
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
                const roomSnap = await db.collection("rooms")
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
                const scheduleSnap = await db.collection("schedules")
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
                const internProgressRef = db.collection("interns_inside").doc(auth.currentUser.uid);
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

// Function to update progress for a specific room
async function updateRoomProgress(roomCode) {
    try {
        // Get schedule information for total hours
        const scheduleSnap = await db.collection("schedules")
            .where("roomCode", "==", roomCode)
            .limit(1)
            .get();

        if (scheduleSnap.empty) return;

        const scheduleData = scheduleSnap.docs[0].data();
        const totalHours = scheduleData.totalHours || 0;

        // Get intern's progress for this room
        const internProgressRef = db.collection("interns_inside").doc(auth.currentUser.uid);
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

async function refreshBtn() {
    try {
        const internRef = db.collection("interns_inside").doc(auth.currentUser.uid);
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

// Mobile menu toggle
const mobileMenuButton = document.getElementById("mobile-menu-button");
const overlay = document.getElementById("overlay");
const menuIcon = document.getElementById("menu-icon");

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("-translate-x-full");
    overlay.classList.toggle("hidden");

    if (!sidebar.classList.contains("-translate-x-full")) {
        mobileMenuButton.style.transform = "translateX(230px)";
        menuIcon.classList.remove("fa-bars");
        menuIcon.classList.add("fa-arrow-left");
    } else {
        mobileMenuButton.style.transform = "translateX(0)";
        menuIcon.classList.remove("fa-arrow-left");
        menuIcon.classList.add("fa-bars");
    }
}

mobileMenuButton.addEventListener("click", toggleSidebar);
overlay.addEventListener("click", toggleSidebar);

window.addEventListener("DOMContentLoaded", loadTotalHours);

// Close sidebar when clicking outside on mobile
window.addEventListener("resize", function () {
    const sidebar = document.getElementById("sidebar");
    if (window.innerWidth >= 1024) {
        sidebar.classList.remove("-translate-x-full");
        overlay.classList.add("hidden");
    }
});



async function joinRoom() {
    const joinCode = document.getElementById("joinRoomInput").value.trim();
    const status = document.getElementById("joinRoomStatus");

    if (!joinCode) {
        status.textContent = "❌ Enter a join code.";
        return;
    }

    try {
        // Validate room
        const roomSnap = await db.collection("rooms")
            .where("joinCode", "==", joinCode)
            .limit(1)
            .get();

        if (roomSnap.empty) {
            status.textContent = "❌ Room not found.";
            return;
        }

        const roomDoc = roomSnap.docs[0];
        const roomData = roomDoc.data();
        const roomRef = roomDoc.ref;

        // Add joinCode to intern's rooms array
        const internRef = db.collection("interns").doc(auth.currentUser.uid);
        await internRef.update({
            rooms: firebase.firestore.FieldValue.arrayUnion(joinCode)
        });

        // Add intern's email to room's interns array
        await roomRef.update({
            interns: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
        });

        // Check if intern_data document already exists for this intern and room
        const existingInternDataSnap = await db.collection("intern_data")
            .where("intern_email", "==", auth.currentUser.email)
            .where("room_code", "==", joinCode)
            .limit(1)
            .get();

        // Save to intern_data collection
        const geofenceSnap = await db.collection("geofences").doc(joinCode).get();

        if (geofenceSnap.exists) {
            const geofence = geofenceSnap.data();

            const internData = {
                intern_email: auth.currentUser.email,
                room_code: joinCode,
                type: "supervisor",
                geofence: geofence
            };

            if (!existingInternDataSnap.empty) {
                // Update existing document
                const existingDocRef = existingInternDataSnap.docs[0].ref;
                await existingDocRef.update(internData);
            } else {
                // Create new document
                await db.collection("intern_data").add(internData);
            }
        } else {
            const scheduleSnap = await db.collection("schedules").where("roomCode", "==", joinCode).limit(1).get();

            if (!scheduleSnap.empty) {
                const schedule = scheduleSnap.docs[0].data();

                const internData = {
                    intern_email: auth.currentUser.email,
                    room_code: joinCode,
                    type: "coordinator",
                    schedule: schedule
                };

                if (!existingInternDataSnap.empty) {
                    // Update existing document
                    const existingDocRef = existingInternDataSnap.docs[0].ref;
                    await existingDocRef.update(internData);
                } else {
                    // Create new document
                    await db.collection("intern_data").add(internData);
                }
            }
        }

        closeJoinRoomModal();
        // Save intern data after joining
        await saveInternData();
        // Reload the page after successful room join
        location.reload();
        fetchJoinedRooms();
    } catch (err) {
        console.error("Failed to join room:", err);
        status.textContent = "❌ Failed to join room. " + err;
    }
}



function openJoinRoomModal() {

    const modal = document.getElementById("joinRoomModal");
    const content = modal.querySelector('.modal-content');
    modal.style.display = "flex";
    setTimeout(() => {
        content.classList.remove('fade-out');
        content.classList.add('fade-in');
    }, 10);
    document.getElementById("joinRoomInput").value = "";
    document.getElementById("joinRoomStatus").textContent = "";
    document.getElementById("joinRoomInput").focus();
}

function closeJoinRoomModal() {
    const modal = document.getElementById("joinRoomModal");
    const content = modal.querySelector('.modal-content');
    content.classList.remove('fade-in');
    content.classList.add('fade-out');
    content.addEventListener('transitionend', () => {
        modal.style.display = "none";
    }, { once: true });
}



function toggleJoinRoomButton() {
    const container = document.getElementById("roomScheduleContainer");
    const joinButton = document.querySelector(".fixed.bottom-6.right-10");

    if (container && joinButton) {
        if (container.classList.contains("hidden")) {
            joinButton.style.display = "block";
        } else {
            joinButton.style.display = "none";
        }
    }
}

function backToRooms() {
    const container = document.getElementById("roomScheduleContainer");
    container.classList.add("hidden");
    container.dataset.activeRoom = "";

    // Clear kebab menu
    document.getElementById('roomScheduleKebabMenu').innerHTML = '';

    // Show room selection UI elements
    document.getElementById("joinRoomInput").parentElement.style.display = "flex";
    document.getElementById("joinedRoomsList").style.display = "block";
    document.getElementById("internRooms").parentElement.style.display = "block";

    // Show the join room button
    toggleJoinRoomButton();
}

async function fetchJoinedRooms() {
  const internRoomsDiv = document.getElementById("internRooms");
  internRoomsDiv.innerHTML = "<p class='text-gray-500'>Loading rooms...</p>";

  try {
    const internRef = db.collection("interns").doc(auth.currentUser.uid);
    const internDoc = await internRef.get();
    if (!internDoc.exists) {
      internRoomsDiv.innerHTML = "<p class='text-gray-500'>No intern record found.</p>";
      return;
    }

    const joinedCodes = internDoc.data().rooms || [];
    if (joinedCodes.length === 0) {
      internRoomsDiv.innerHTML = "<p class='text-gray-500'>No rooms joined yet.</p>";
      return;
    }

    const noRoomsMessage = document.getElementById("noRoomsMessage");

    internRoomsDiv.innerHTML = "";

    for (const code of joinedCodes) {
      const roomSnap = await db.collection("rooms")
        .where("joinCode", "==", code)
        .limit(1)
        .get();

      if (!roomSnap.empty) {
        const room = roomSnap.docs[0].data();
        console.log("Joined room data:", room);

        // Only display coordinator rooms, skip supervisor rooms
        if (room.supervisorEmail) {
          continue;
        }

        const card = document.createElement("div");
        card.className = "border rounded-lg shadow-md p-4 hover:shadow-lg transition cursor-pointer mb-3";
        card.style.backgroundColor = "#4174b8";
        card.id = `room-card-${room.joinCode || room.roomCode || code}`;

        // Handle different field name variations
        const roomName = room.roomName || "Unnamed Room";
        const roomCodeDisplay = room.joinCode || code;

        // Fetch coordinator name
        let roomDescription = "Not found";
        if (room.coordinatorEmail) {
          try {
            const coordSnap = await db.collection("coordinators")
              .where("email", "==", room.coordinatorEmail)
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
                <button class="kebab-button" onclick="toggleKebabMenu('${roomCodeDisplay}', event)">
                <i class="fas fa-ellipsis-v" style="color: white;"></i>
              </button>
              <div id="popover-${roomCodeDisplay}" class="popover">
                <button class="popover-item leave-room" onclick="leaveRoom('${roomCodeDisplay}')">
                  <i class="fas fa-sign-out-alt mr-2"></i>Leave Room
                </button>
              </div>
            </div>
          </div>
          <p class="text-xs" style="color: #DBDBDB;">Code: ${roomCodeDisplay}</p>
          <p class="text-xs mt-2" style="color: #DBDBDB;">${roomDescription}</p>
        `;
        //<p class="text-sm text-gray-600 mb-2">${roomDescription}</p>
        //<p class="text-xs text-gray-400 mt-2">${room.supervisorEmail ? 'Supervisor/Principal' : 'Coordinator/Instructor'}</p>
        internRoomsDiv.appendChild(card);

        // Add click handler to show schedule
        card.addEventListener("click", () => {
          const container = document.getElementById("roomScheduleContainer");
          const roomCode = room.joinCode || room.roomCode || code;

          // If same room is clicked again → hide
          if (container.dataset.activeRoom === roomCode) {
            container.classList.toggle("hidden");
            // Show room selection UI when hiding schedule
            document.getElementById("joinRoomInput").parentElement.style.display = "flex";
            document.getElementById("joinedRoomsList").style.display = "block";
            document.getElementById("internRooms").parentElement.style.display = "block";
            // Toggle join room button visibility
            toggleJoinRoomButton();
          } else {
            container.dataset.activeRoom = roomCode;
            container.classList.remove("hidden");

            // Hide room selection UI when showing schedule
            document.getElementById("joinRoomInput").parentElement.style.display = "none";
            document.getElementById("joinedRoomsList").style.display = "none";
            document.getElementById("internRooms").parentElement.style.display = "none";

            displayRoomSchedule(roomCode);
            // Toggle join room button visibility
            toggleJoinRoomButton();
          }
        });
      }
    }

    // Toggle visibility of noRoomsMessage based on whether coordinator rooms are joined
    // Filter out supervisor rooms from joinedCodes
    const coordinatorRooms = [];
    for (const code of joinedCodes) {
      const roomSnap = await db.collection("rooms")
        .where("joinCode", "==", code)
        .limit(1)
        .get();
      if (!roomSnap.empty) {
        const room = roomSnap.docs[0].data();
        if (!room.supervisorEmail) {
          coordinatorRooms.push(code);
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

// Kebab menu functions
function toggleKebabMenu(roomCode, event) {
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

async function leaveRoom(roomCode) {
  if (!confirm(`Are you sure you want to leave this room (${roomCode})?`)) {
    return;
  }

  try {
    const internRef = db.collection("interns").doc(auth.currentUser.uid);

    // Remove roomCode from intern's rooms array
    await internRef.update({
      rooms: firebase.firestore.FieldValue.arrayRemove(roomCode)
    });

    // Remove intern's email from room's interns array
    const roomSnap = await db.collection("rooms")
      .where("joinCode", "==", roomCode)
      .limit(1)
      .get();

    if (!roomSnap.empty) {
      const roomDoc = roomSnap.docs[0];
      const roomRef = roomDoc.ref;

      await roomRef.update({
        interns: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email)
      });
    }

    // Check if the room being left is a supervisor room (has geofence)
    const geofenceSnap = await db.collection("geofences").doc(roomCode).get();
    const isSupervisorRoom = geofenceSnap.exists;

    // Close the popover
    const popover = document.getElementById(`popover-${roomCode}`);
    if (popover) {
      popover.classList.remove('show');
    }

    // Refresh the rooms list
    fetchJoinedRooms();

    // If the current active room is the one being left, hide the schedule
    const container = document.getElementById("roomScheduleContainer");
    if (container.dataset.activeRoom === roomCode) {
      container.classList.add("hidden");
      container.dataset.activeRoom = "";
      document.getElementById("joinRoomInput").parentElement.style.display = "flex";
      document.getElementById("joinedRoomsList").style.display = "block";
      document.getElementById("internRooms").parentElement.style.display = "block";
      toggleJoinRoomButton();
    }

    // If leaving a supervisor room, update supervisor zone status
    if (isSupervisorRoom) {
      await checkSupervisorZoneStatus();
      alert("Successfully left the supervisor room! You have been disconnected from the supervisor zone.");
    } else {
      alert("Successfully left the room!");
      disconnectSupervisorZone();
      fetchJoinedRooms();
    }
  } catch (err) {
    console.error("Failed to leave room:", err);
    alert("Failed to leave room. Please try again.");
  }
}

// Function to save intern data to intern_data collection
async function saveInternData() {
    try {
        const internEmail = auth.currentUser.email;
        const internRef = db.collection("interns").doc(auth.currentUser.uid);
        const internDoc = await internRef.get();
        if (!internDoc.exists) throw new Error("Intern data not found");

        const internData = internDoc.data();
        const supervisorEmail = internData.supervisorEmail;
        const coordinatorCode = internData.coordinatorCode;

        // Find supervisorRoom
        let supervisorRoom = null;
        const supervisorRoomSnap = await db.collection("rooms")
            .where("supervisorEmail", "==", supervisorEmail)
            .limit(1)
            .get();
        if (!supervisorRoomSnap.empty) {
            supervisorRoom = supervisorRoomSnap.docs[0].data().joinCode;
        }

        // Find coordinatorRoom
        let coordinatorRoom = null;
        const coordinatorSnap = await db.collection("coordinators")
            .where("code", "==", coordinatorCode)
            .limit(1)
            .get();
        if (!coordinatorSnap.empty) {
            const coordinatorEmail = coordinatorSnap.docs[0].data().email;
            const coordinatorRoomSnap = await db.collection("rooms")
                .where("coordinatorEmail", "==", coordinatorEmail)
                .limit(1)
                .get();
            if (!coordinatorRoomSnap.empty) {
                coordinatorRoom = coordinatorRoomSnap.docs[0].data().joinCode;
            }
        }

        // Fetch internSchedule
        let internSchedule = [];
        if (coordinatorRoom) {
            const scheduleSnap = await db.collection("schedules")
                .where("roomCode", "==", coordinatorRoom)
                .get();
            internSchedule = scheduleSnap.docs.map(doc => doc.data());
        }

        // Fetch geofence
        let geofence = null;
        if (supervisorRoom) {
            const geofenceSnap = await db.collection("geofences").doc(supervisorRoom).get();
            if (geofenceSnap.exists) {
                geofence = geofenceSnap.data();
            }
        }

        // Save to intern_data collection
        const internDataRef = db.collection("intern_data").doc(internEmail);
        await internDataRef.set({
            supervisorRoom: supervisorRoom,
            coordinatorRoom: coordinatorRoom,
            internSchedule: internSchedule,
            geofence: geofence
        }, { merge: true });

        console.log("Intern data saved successfully");
    } catch (err) {
        console.error("Failed to save intern data:", err);
    }
}

// Close popovers when clicking outside
document.addEventListener('click', function(event) {
  if (!event.target.closest('.kebab-menu')) {
    const allPopovers = document.querySelectorAll('.popover');
    allPopovers.forEach(popover => {
      popover.classList.remove('show');
    });
  }
});



async function setSupervisorZone() {
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
    const roomSnap = await db.collection("rooms")
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
    const internEmail = auth.currentUser.email;

    // Check if intern's email exists in the room's interns field
    if (!roomData.interns || !roomData.interns.includes(internEmail)) {
      // Save intern's email to the room's interns field
      await roomRef.update({
        interns: firebase.firestore.FieldValue.arrayUnion(internEmail)
      });
    }

    // Add roomCode to intern's rooms array
    const internRef = db.collection("interns").doc(auth.currentUser.uid);
    await internRef.update({
      rooms: firebase.firestore.FieldValue.arrayUnion(roomCode)
    });

    // Check if geofence exists for this room
    const geofenceSnap = await db.collection("geofences").doc(roomCode).get();
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
    const existingInternDataSnap = await db.collection("intern_data")
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
      await db.collection("intern_data").add(internDataPayload);
      console.log("🔍 DEBUG setSupervisorZone: Created new intern_data");
    }

    // Update global geofence variables for immediate use
    geofenceCenter = [geofenceData.center.lat, geofenceData.center.lng];
    geofenceRadius = geofenceData.radius || 100;

    // Refresh the map if it exists
    if (map) {
      if (geofenceCircle) map.removeLayer(geofenceCircle);
      geofenceCircle = L.circle(geofenceCenter, {
        radius: geofenceRadius,
        color: "red",
        fillColor: "#f03",
        fillOpacity: 0.3,
      }).addTo(map);
      map.setView(geofenceCenter, 17);
      map.invalidateSize();
    }

    // Refresh rooms list to show the newly joined room
    await fetchJoinedRooms();

    // Update the UI to show connected status
    await checkSupervisorZoneStatus();

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

async function disconnectSupervisorZone() {
  if (!confirm('Are you sure you want to disconnect from the supervisor zone?')) {
    return;
  }

  try {
    const internRef = db.collection("interns").doc(auth.currentUser.uid);
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
      const roomSnap = await db.collection("rooms").where("joinCode", "==", roomCode).limit(1).get();
      if (!roomSnap.empty) {
        const roomData = roomSnap.docs[0].data();
        if (roomData.supervisorEmail && roomData.interns && roomData.interns.includes(auth.currentUser.email)) {
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
    const roomSnap = await db.collection("rooms").where("joinCode", "==", supervisorRoomCode).limit(1).get();
    if (!roomSnap.empty) {
      const roomDoc = roomSnap.docs[0];
      const roomRef = roomDoc.ref;
      await roomRef.update({
        interns: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email)
      });
    }

    // Update UI to show disconnected status
    await checkSupervisorZoneStatus();

    alert('Successfully disconnected from the supervisor zone.');
  } catch (err) {
    console.error('Failed to disconnect from supervisor zone:', err);
    alert('Failed to disconnect from supervisor zone. Please try again.');
  }
}

function toggleMapModal() {
  const modal = document.getElementById('mapModal');
  if (!modal) return;

  const isShowing = modal.style.display === 'flex';
  modal.style.display = isShowing ? 'none' : 'flex';

  if (!isShowing) {
    // Initialize map for modal
    setTimeout(() => {
      if (!window.modalMap || typeof window.modalMap.setView !== 'function') {
        window.modalMap = L.map('modalMap').setView(geofenceCenter || [10.7502, 121.9324], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(window.modalMap);

        if (geofenceCenter && geofenceRadius) {
          if (window.modalGeofenceCircle) {
            window.modalMap.removeLayer(window.modalGeofenceCircle);
          }
          window.modalGeofenceCircle = L.circle(geofenceCenter, {
            radius: geofenceRadius,
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.3,
          }).addTo(window.modalMap);
          window.modalMap.fitBounds(window.modalGeofenceCircle.getBounds());
        }
      } else {
        window.modalMap.setView(geofenceCenter || [10.7502, 121.9324], 15);
        if (window.modalGeofenceCircle) {
          window.modalMap.removeLayer(window.modalGeofenceCircle);
        }
        if (geofenceCenter && geofenceRadius) {
          window.modalGeofenceCircle = L.circle(geofenceCenter, {
            radius: geofenceRadius,
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.3,
          }).addTo(window.modalMap);
          window.modalMap.fitBounds(window.modalGeofenceCircle.getBounds());
        }
      }
      if (window.modalMap && typeof window.modalMap.invalidateSize === 'function') {
        window.modalMap.invalidateSize();
      }
    }, 100);
  }
}