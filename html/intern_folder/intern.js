// Intern Dashboard Application
// This file contains the main logic for the intern dashboard, including authentication,
// room management, time tracking, task management, and geofencing functionality.
// Updated to support time entry display enhancements: splitting entries into morning/afternoon/evening,
// sorting by date descending and period order, and navigation buttons for time entry cards.

console.log("🔥 [INIT] Starting Firebase initialization...");
const firebaseConfig = {
    apiKey: "AIzaSyDaCCFqs7cwKMiicnlP2Ig3s-WHw8gyZts",
    authDomain: "index-database-d00f9.firebaseapp.com",
    projectId: "index-database-d00f9",
    storageBucket: "index-database-d00f9.appspot.com",
    messagingSenderId: "310780304431",
    appId: "1:310780304431:web:18c2fdd5ab6405e80dfada",
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ [INIT] Firebase app initialized successfully");
} catch (error) {
    console.error("❌ [INIT] Firebase initialization failed:", error);
    alert("Application initialization error. Please refresh the page.");
}

const auth = firebase.auth();
const db = firebase.firestore();

console.log("🔐 [INIT] Setting up Firebase Auth persistence...");
try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    console.log("✅ [INIT] Auth persistence set to LOCAL");
} catch (error) {
    console.error("❌ [INIT] Failed to set auth persistence:", error);
}

// AuthManager removed to avoid conflicts with existing authentication code
console.log("👤 [INIT] Skipping AuthManager initialization - using existing auth code");

let userData = null;
let isRegisterMode = false;
let geofenceCenter = null;
let geofenceRadius = 100;
let justLoggedIn = false;
let timerInterval = null;
let map = null;
let internMarker = null;
let geofenceCircle = null;
let mapInitialized = false;
let infoWindow = null;
let globalCoordinatorTotal = 0;
let initialAuthLoad = true;

function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
        return 0;
    }
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function calculateTotalHours(data) {
    let total = 0;
    const periods = ['morning', 'afternoon', 'evening'];
    for (const period of periods) {
        const inTime = data[`${period}In`];
        const outTime = data[`${period}Out`];
        if (inTime && outTime) {
            const inMinutes = timeToMinutes(inTime);
            const outMinutes = timeToMinutes(outTime);
            if (outMinutes > inMinutes) {
                total += (outMinutes - inMinutes) / 60;
            }
        }
    }
    return total;
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
    toggleModeBtn.textContent = isRegisterMode ? "Log in here" : "Register here";
}

async function authAction() {
    console.log("🔐 [AUTH] authAction called - Mode:", isRegisterMode ? "REGISTER" : "LOGIN");

    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const fullNameEl = document.getElementById("fullName");
    const schoolEl = document.getElementById("school");
    const rememberEl = document.getElementById("remember");
    const statusEl = document.getElementById("authStatus");

    if (!emailEl || !passwordEl || !fullNameEl || !schoolEl || !rememberEl || !statusEl) {
        console.error("❌ [AUTH] Auth form elements not found:", {
            emailEl: !!emailEl,
            passwordEl: !!passwordEl,
            fullNameEl: !!fullNameEl,
            schoolEl: !!schoolEl,
            rememberEl: !!rememberEl,
            statusEl: !!statusEl
        });
        return;
    }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const fullName = fullNameEl.value.trim();
    const school = schoolEl.value.trim();
    const rememberMe = rememberEl.checked;
    const status = statusEl;

    console.log("📝 [AUTH] Form values:", {
        email: email.substring(0, 3) + "***", // Partial email for privacy
        hasPassword: !!password,
        fullName,
        school,
        rememberMe,
        isRegisterMode
    });

    // Store remember me preference
    localStorage.setItem("rememberMe", rememberMe);
    console.log("💾 [AUTH] Remember me preference stored:", rememberMe);

    if (isRegisterMode) {
        console.log("📝 [AUTH] Starting user registration process...");
        try {
            console.log("🔥 [AUTH] Creating user with Firebase Auth...");
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            console.log("✅ [AUTH] User created successfully:", cred.user.uid);

            console.log("📧 [AUTH] Sending email verification...");
            await cred.user.sendEmailVerification();
            console.log("✅ [AUTH] Email verification sent");

            console.log("💾 [AUTH] Saving user data to Firestore...");
            await db.collection("intern").doc(cred.user.uid).set({
                email,
                name: fullName,
                school,
                role: "intern",
                createdAt: new Date(),
            });
            console.log("✅ [AUTH] User data saved to Firestore");

            status.textContent = "✅ Verification email sent. Please verify before logging in.";
            console.log("🎉 [AUTH] Registration completed successfully");
        } catch (err) {
            console.error("❌ [AUTH] Registration failed:", err);
            status.textContent = "❌ " + err.message;
        }
    } else {
        console.log("🔑 [AUTH] Starting login process...");

        // Check if email belongs to supervisor
        console.log("🔍 [AUTH] Checking if email belongs to supervisor...");
        try {
            const supervisorSnapshot = await db
                .collection("supervisors")
                .where("email", "==", email)
                .get();
            console.log("🔍 [AUTH] Supervisor check result:", !supervisorSnapshot.empty);

            if (!supervisorSnapshot.empty) {
                console.log("⚠️ [AUTH] Email belongs to supervisor account");
                status.textContent = "⚠️ This account is a supervisor. Please use the supervisor login.";
                return;
            }
        } catch (err) {
            console.error("❌ [AUTH] Error checking supervisor collection:", err);
        }

        // Check if email belongs to coordinator
        console.log("🔍 [AUTH] Checking if email belongs to coordinator...");
        try {
            const coordinatorSnapshot = await db
                .collection("coordinators")
                .where("email", "==", email)
                .get();
            console.log("🔍 [AUTH] Coordinator check result:", !coordinatorSnapshot.empty);

            if (!coordinatorSnapshot.empty) {
                console.log("⚠️ [AUTH] Email belongs to coordinator account");
                status.textContent = "⚠️ This account is a coordinator. Please use the coordinator login.";
                return;
            }
        } catch (err) {
            console.error("❌ [AUTH] Error checking coordinator collection:", err);
        }

        console.log("🔥 [AUTH] Attempting Firebase sign in...");
        auth
            .signInWithEmailAndPassword(email, password)
            .then((cred) => {
                console.log("✅ [AUTH] Firebase sign in successful:", {
                    uid: cred.user.uid,
                    email: cred.user.email,
                    emailVerified: cred.user.emailVerified
                });
                justLoggedIn = true;

                if (!cred.user.emailVerified) {
                    console.log("⚠️ [AUTH] Email not verified, signing out...");
                    status.textContent = "⚠️ Please verify your email first.";
                    auth.signOut();
                    return;
                }

                console.log("🎉 [AUTH] Login process completed successfully");
            })
            .catch((err) => {
                console.error("❌ [AUTH] Firebase sign in failed:", err);
                status.textContent = "❌ " + err.message;
            });
    }
    refreshBtn();
}

auth.onAuthStateChanged(async (user) => {
    console.log("🔐 [AUTH_STATE] onAuthStateChanged triggered:", {
        hasUser: !!user,
        initialAuthLoad,
        timestamp: new Date().toISOString()
    });

    if (user) {
        console.log("👤 [AUTH_STATE] User details:", {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            isAnonymous: user.isAnonymous,
            providerData: user.providerData?.map(p => ({ providerId: p.providerId })),
            metadata: {
                creationTime: user.metadata?.creationTime,
                lastSignInTime: user.metadata?.lastSignInTime
            }
        });
    } else {
        console.log("❌ [AUTH_STATE] No user authenticated");
    }

    const modal = document.getElementById("authModal");
    const content = document.getElementById("mainContent");
    const sidebar = document.getElementById("sidebar");

    // Handle initial load state
    if (initialAuthLoad && !user) {
        console.log("⏳ [AUTH_STATE] Initial auth load - showing auth modal");
        initialAuthLoad = false;
        modal.style.display = "flex";
        content.style.display = "none";
        const loading = document.getElementById("loadingScreen");
        loading.classList.add("opacity-0");
        setTimeout(() => (loading.style.display = "none"), 300);
        return;
    }

    // Check authentication and email verification
    if (!user) {
        console.log("❌ [AUTH_STATE] No user - showing auth modal");
        modal.style.display = "flex";
        content.style.display = "none";
        const loading = document.getElementById("loadingScreen");
        loading.classList.add("opacity-0");
        setTimeout(() => (loading.style.display = "none"), 300);
        return;
    }

    if (!user.emailVerified) {
        console.log("⚠️ [AUTH_STATE] Email not verified - showing auth modal");
        modal.style.display = "flex";
        content.style.display = "none";
        const loading = document.getElementById("loadingScreen");
        loading.classList.add("opacity-0");
        setTimeout(() => (loading.style.display = "none"), 300);
        return;
    }

    console.log("✅ [AUTH_STATE] User authenticated and email verified - proceeding with user data validation");

    // Wait for Firebase to refresh token to avoid race condition
    console.log("🔄 [AUTH_STATE] Refreshing ID token to avoid race conditions...");
    try {
        const token = await user.getIdToken(true);
        console.log("✅ [AUTH_STATE] Token refreshed successfully:", {
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 20) + "..."
        });
    } catch (tokenError) {
        console.error("❌ [AUTH_STATE] Token refresh failed:", tokenError);
        modal.style.display = "flex";
        content.style.display = "none";
        return;
    }

    // Check if user exists in intern collection
    console.log("🔍 [AUTH_STATE] Checking user existence in intern collection...");
    try {
        const userDocRef = db.collection("intern").doc(user.uid);
        console.log("🔍 [AUTH_STATE] Querying document:", userDocRef.path);

        const userDoc = await userDocRef.get();
        console.log("🔍 [AUTH_STATE] Firestore query result:", {
            exists: userDoc.exists,
            hasData: userDoc.exists && !!userDoc.data()
        });

        if (userDoc.exists) {
            const docData = userDoc.data();
            console.log("📄 [AUTH_STATE] User document data:", {
                email: docData.email,
                name: docData.name,
                role: docData.role,
                school: docData.school,
                createdAt: docData.createdAt,
                hasProfilePicture: !!docData.profilePicture,
                hasPhotoURL: !!docData.photoURL
            });
        } else {
            console.error("❌ [AUTH_STATE] User document not found in intern collection");
            modal.style.display = "flex";
            content.style.display = "none";
            return;
        }

        userData = userDoc.data();
        console.log("💾 [AUTH_STATE] User data loaded into memory");

        // Check and fix missing role
        if (!userData.role) {
            console.log("🔧 [AUTH_STATE] Role missing - adding default role 'intern'");
            try {
                await db.collection("intern").doc(user.uid).update({ role: "intern" });
                userData.role = "intern";
                console.log("✅ [AUTH_STATE] Role updated successfully");
            } catch (roleUpdateError) {
                console.error("❌ [AUTH_STATE] Failed to update role:", roleUpdateError);
            }
        }

        console.log("🔍 [AUTH_STATE] Validating user role:", userData.role);
        if (userData.role !== "intern") {
            console.error("❌ [AUTH_STATE] Invalid role - expected 'intern', got:", userData.role);
            modal.style.display = "flex";
            content.style.display = "none";
            return;
        }

        console.log("✅ [AUTH_STATE] User validation completed successfully");
    } catch (error) {
        console.error("❌ [AUTH_STATE] Error during user validation:", {
            error: error.message,
            code: error.code,
            stack: error.stack
        });
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

    // Update user profile in sidebar
    document.getElementById("username").textContent =
        userData.name || "Intern Name";
    document.getElementById("userEmail").textContent = user.email;

    // Update profile picture - try multiple sources
    const userPic = document.getElementById("userPic");
    let profilePic = "/images/default.webp";

    // Try different possible profile picture sources
    if (userData.profilePicture) {
        profilePic = userData.profilePicture;
    } else if (userData.photoURL) {
        profilePic = userData.photoURL;
    } else if (user.photoURL) {
        profilePic = user.photoURL;
    }

    userPic.src = profilePic;
    userPic.onerror = function () {
        this.src = "/images/default.webp";
    };

    loadInternData(userData, user);

    // Initialize supervisor zone status on page load
    checkSupervisorZoneStatus(user);

    // Handle Firebase initialization errors
    if (!firebase.apps.length) {
        console.error("Firebase app not initialized");
        alert("Application initialization error. Please refresh the page.");
        return;
    }
});

async function loadInternData(userInfo, user) {
        try {
            console.log("DEBUG: loadInternData started for user:", user.uid);
            // Get joined rooms using collectionGroup
            console.log("DEBUG: About to query memberships for intern");
            const membersSnap = await db.collectionGroup("members").where("internId", "==", user.uid).get();
            console.log("Fetching rooms for intern...");
            const joinedRooms = [];
            for (const doc of membersSnap.docs) {
              const roomId = doc.ref.parent.parent.id;
              joinedRooms.push({
                roomId: roomId,
                data: doc.data()
              });
            }
            console.log("DEBUG: joinedRooms found:", joinedRooms.length);

            // For each room, load data if needed
            for (const { roomId, data: memberData } of joinedRooms) {
                console.log("DEBUG: Processing room:", roomId);
                try {
                  const roomDoc = await db.collection("rooms").doc(roomId).get();
                  console.log("DEBUG: roomDoc exists:", roomDoc.exists);
                  if (!roomDoc.exists) continue;
                  const roomData = roomDoc.data();

                  // If supervisor room (has geofence), load geofence
                  console.log("DEBUG: About to query geofences for room:", roomId);
                  try {
                    const geofenceSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
                    console.log("DEBUG: geofenceSnap empty:", geofenceSnap.empty);
                    if (!geofenceSnap.empty) {
                        const geo = geofenceSnap.docs[0].data();
                        if (geo.center) {
                            geofenceCenter = [geo.center.lat, geo.center.lng];
                            geofenceRadius = geo.radius || 100;
                            // Initialize map
                            setTimeout(() => {
                                if (!mapInitialized) {
                                    map = L.map('map').setView([10.7502, 121.9324], 15);
                                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                                        maxZoom: 19,
                                    }).addTo(map);
                                    mapInitialized = true;
                                } else {
                                    if (map) {
                                        map.setView([geofenceCenter[0], geofenceCenter[1]], 17);
                                    }
                                }

                                if (geofenceCircle) {
                                    map.removeLayer(geofenceCircle);
                                }

                                geofenceCircle = L.circle(geofenceCenter, {
                                    radius: geofenceRadius,
                                    color: "red",
                                    fillColor: "#f03",
                                    fillOpacity: 0.3
                                }).addTo(map);

                                map.fitBounds(geofenceCircle.getBounds());
                            }, 300);
                        }
                    }
                  } catch (err) {
                    console.warn(`DEBUG: Could not get geofences for room ${roomId}:`, err);
                  }

                  // Load tasks for the room
                  try {
                      console.log("DEBUG: About to query tasks for room:", roomId);
                      const tasksSnap = await db.collection("rooms").doc(roomId).collection("tasks").get();
                      console.log("DEBUG: tasksSnap empty:", tasksSnap.empty);
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
                                  <h3 class="text-lg font-semibold text-blue-700 mb-1">${task.title}</h3>
                                  <p class="text-gray-700 mb-1">${task.description}</p>
                                  <p class="text-sm text-gray-500">Posted on: ${task.createdAt?.toDate().toLocaleString() || "Unknown date"}</p>
                              `;
                              taskList.appendChild(li);
                          });
                      }
                  } catch (err) {
                      console.error("Error loading tasks:", err);
                      document.getElementById("taskList").innerHTML =
                          "<li class='text-red-600'>❌ Failed to load tasks.</li>";
                  }
                } catch (err) {
                  console.warn(`DEBUG: Could not get room ${roomId}:`, err);
                }
            }

            // Load total hours for progress bar (only if a room is selected)
            const container = document.getElementById("roomScheduleContainer");
            const activeRoom = container.dataset.activeRoom;
            if (activeRoom) {
                loadTotalHours(activeRoom);
            }
            loadHoursLeft(activeRoom);
            refreshBtn(activeRoom);

            const modal = document.getElementById("authModal");
            if (modal) {
                modal.style.display = "none";
            }

            // At the very end of onAuthStateChanged
            setTimeout(() => {
                const loading = document.getElementById("loadingScreen");
                loading.classList.add("opacity-0");
                setTimeout(() => (loading.style.display = "none"), 300);
            }, 100);

            window.onload = () => {
                const loading = document.getElementById("loadingScreen");
                setTimeout(() => {
                    loading.classList.add("opacity-0");
                    setTimeout(() => (loading.style.display = "none"), 500);
                }, 300);
            };

            // Load joined rooms
            fetchJoinedRooms();
        } catch (error) {
            console.error('Error loading intern data:', error);
            // Gracefully handle permission errors by proceeding without loading joined rooms data
            const modal = document.getElementById("authModal");
            if (modal) {
                modal.style.display = "none";
            }
        }
    }

async function checkSupervisorZoneStatus(user) {
  if (!user) {
    console.error("User not authenticated");
    return;
  }

  try {
    console.log("DEBUG: checkSupervisorZoneStatus started");
    console.log("DEBUG: User present:", user.uid);

    // Determine user role
    const userId = user.uid;
    const isCoordinator = await db.collection("coordinators").doc(userId).get().then(doc => doc.exists);
    const isSupervisor = await db.collection("supervisors").doc(userId).get().then(doc => doc.exists);
    const isIntern = !isCoordinator && !isSupervisor;

    console.log(`DEBUG: User roles - Coordinator: ${isCoordinator}, Supervisor: ${isSupervisor}, Intern: ${isIntern}`);

    const joinedRooms = [];

    if (isIntern) {
      // Interns: fetch only their own membership docs
      console.log("DEBUG: Intern user - fetching own membership docs");
      try {
        const membersSnap = await db.collectionGroup("members").where("internId", "==", user.uid).get();
        for (const doc of membersSnap.docs) {
          const roomId = doc.ref.parent.parent.id;
          joinedRooms.push({
            roomId: roomId,
            data: doc.data()
          });
        }
      } catch (err) {
        console.warn("DEBUG: Could not get memberships for intern:", err);
      }
    } else {
      // Coordinators and supervisors: fetch all interns in each room
      console.log("DEBUG: Coordinator/Supervisor user - fetching all interns in rooms");
      try {
        const roomsSnap = await db.collection("rooms").get();
        for (const roomDoc of roomsSnap.docs) {
          try {
            const internsSnap = await db.collection("rooms").doc(roomDoc.id).collection("members").get();
            if (!internsSnap.empty) {
              joinedRooms.push({
                roomId: roomDoc.id,
                data: internsSnap.docs.map(doc => doc.data())
              });
            }
          } catch (err) {
            console.warn(`DEBUG: Could not get interns for room ${roomDoc.id}:`, err);
          }
        }
      } catch (err) {
        console.warn("DEBUG: Could not get rooms for coordinator/supervisor:", err);
      }
    }

    console.log("DEBUG: joinedRooms found:", joinedRooms.length);

    let supervisorRoomId = null;

    // Check if any of the joined rooms has a geofence
    for (const { roomId } of joinedRooms) {
      console.log("DEBUG: Checking geofence for room:", roomId);
      try {
        const geofenceSnap = await db.collection("rooms")
          .doc(roomId)
          .collection("geofences")
          .limit(1) // just need to know if one exists
          .get();
        console.log("DEBUG: geofenceSnap for room", roomId, "empty:", geofenceSnap.empty);

        if (!geofenceSnap.empty) {
          supervisorRoomId = roomId;
          console.log("DEBUG: Found supervisor room:", supervisorRoomId);
          break;
        }
      } catch (err) {
        console.warn(`DEBUG: Could not get geofence for room ${roomId}:`, err);
      }
    }

    const inputDiv = document.getElementById('supervisorZoneInput');
    const connectedMsg = document.getElementById('supervisorZoneConnected');
    const input = document.getElementById('supervisorRoomCodeInput');

    if (supervisorRoomId) {
      // Hide input, show connected message
      inputDiv.style.display = 'none';
      connectedMsg.classList.remove('hidden');
      connectedMsg.innerHTML = `
        <p>Connected to supervisor zone: <strong>${supervisorRoomId}</strong></p>
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

      // Refresh button states for the supervisor room on page load
      refreshBtn(supervisorRoomId);
    } else {
      // Show input and button
      inputDiv.style.display = 'flex';
      connectedMsg.classList.add('hidden');
      input.value = '';
    }
  } catch (error) {
    console.error('Error checking supervisor zone status:', error);
    // Handle gracefully if no permission or not found
    const inputDiv = document.getElementById('supervisorZoneInput');
    const connectedMsg = document.getElementById('supervisorZoneConnected');
    if (inputDiv && connectedMsg) {
      inputDiv.style.display = 'flex';
      connectedMsg.classList.add('hidden');
    }
  }
}

let currentTimeEntries = [];
let currentTimeEntryIndex = 0;

// Function to display result messages using SweetAlert
function showResultMessage(message, type) {
  const icon = type === 'error' ? 'error' : type === 'success' ? 'success' : 'info';
  Swal.fire({
    text: message,
    icon: icon,
    timer: 3000,
    showConfirmButton: false
  });
}

async function displayRoomSchedule(roomId) {
    const container = document.getElementById("roomScheduleContainer");
    const nonSupervisorElements = document.getElementById("nonSupervisorElements");
    const tableDiv = document.getElementById("roomScheduleTable");

    container.classList.remove("hidden");

    // Get room name
    let roomName = "Room Time Entries";
    try {
        const roomDoc = await db.collection("rooms").doc(roomId).get();
        if (roomDoc.exists) {
            roomName = roomDoc.data().roomName || "Unnamed Room";
        }
    } catch (err) {
        console.error("Failed to fetch room name:", err);
    }
    document.getElementById("roomScheduleTitle").textContent = roomName;

    // Check if geofence exists for this room (supervisor room)
    const geoSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
    if (!geoSnap.empty) {
        // This is a supervisor room - show supervisor elements with map
        nonSupervisorElements.classList.add("hidden");
        const supervisorElements = document.getElementById("supervisorElements");
        supervisorElements.classList.remove("hidden");

        // Initialize map for supervisor room
        setTimeout(() => {
            const geofenceData = geoSnap.docs[0].data();
            const center = geofenceData.center;
            const radius = geofenceData.radius || 100;

            const mapDiv = document.getElementById("roomMap");
            mapDiv.innerHTML = "";

            const supervisorMap = L.map(mapDiv).setView([center.lat, center.lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(supervisorMap);

            const geofenceCircle = L.circle([center.lat, center.lng], {
                radius: radius,
                color: "red",
                fillColor: "#f03",
                fillOpacity: 0.3
            }).addTo(supervisorMap);

            supervisorMap.fitBounds(geofenceCircle.getBounds());

            setTimeout(() => {
                supervisorMap.invalidateSize();
            }, 100);
        }, 100);

        return;
    }

    // This is a non-supervisor room - show time entries
    nonSupervisorElements.classList.remove("hidden");

    tableDiv.innerHTML = "<p class='text-gray-500'>Loading time entries...</p>";
    try {
        const entriesSnap = await db.collection("rooms").doc(roomId).collection("schedules").orderBy("createdAt", "desc").get();

        console.log("DEBUG: Time entries fetched for room", roomId, "total docs:", entriesSnap.size);
        let filteredCount = 0;
        entriesSnap.docs.forEach(doc => {
            if (doc.id === auth.currentUser.uid) {
                filteredCount++;
                console.log("DEBUG: Time entry:", doc.id, doc.data());
            }
        });
        console.log("DEBUG: Filtered time entries for current user:", filteredCount);

        if (entriesSnap.empty) {
            tableDiv.innerHTML = "<p class='text-gray-500'>No time entries found for this room.</p>";
            return;
        }

        currentTimeEntries = [];
        entriesSnap.docs.forEach(doc => {
            // Skip rendering time entries that belong to the current user
            if (doc.id === auth.currentUser.uid) return;

            const data = doc.data();
            const date = data.date;
            const createdAt = data.createdAt;

            // Morning slot
            if (data.morningIn && data.morningOut) {
                currentTimeEntries.push({
                    date: date,
                    period: "Morning",
                    start: data.morningIn,
                    end: data.morningOut,
                    dayTotalHours: data.dayTotalHours,
                    totalHours: data.totalHours,
                    createdAt: createdAt
                });
            }

            // Afternoon slot
            if (data.afternoonIn && data.afternoonOut) {
                currentTimeEntries.push({
                    date: date,
                    period: "Afternoon",
                    start: data.afternoonIn,
                    end: data.afternoonOut,
                    dayTotalHours: data.dayTotalHours,
                    totalHours: data.totalHours,
                    createdAt: createdAt
                });
            }

            // Evening slot
            if (data.eveningIn && data.eveningOut) {
                currentTimeEntries.push({
                    date: date,
                    period: "Evening",
                    start: data.eveningIn,
                    end: data.eveningOut,
                    dayTotalHours: data.dayTotalHours,
                    totalHours: data.totalHours,
                    createdAt: createdAt
                });
            }
        });

        // Determine active period based on current time
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let activePeriod = null;
        if (currentMinutes >= 6 * 60 && currentMinutes <= 12 * 60) {
            activePeriod = 'morning';
        } else if (currentMinutes >= 13 * 60 && currentMinutes <= 17 * 60) {
            activePeriod = 'afternoon';
        } else if (currentMinutes >= 18 * 60 || currentMinutes <= 5 * 60) {
            activePeriod = 'evening';
        }

        // Sort by current period first, then by date desc, then by period order (Morning, Afternoon, Evening)
        currentTimeEntries.sort((a, b) => {
            // First, prioritize current period
            const aIsCurrent = a.period.toLowerCase() === activePeriod;
            const bIsCurrent = b.period.toLowerCase() === activePeriod;
            if (aIsCurrent && !bIsCurrent) return -1;
            if (!aIsCurrent && bIsCurrent) return 1;

            // Then by date desc
            const dateA = new Date(a.createdAt);
            const dateB = new Date(b.createdAt);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateB - dateA; // Newest dates first
            }
            // Same date, sort by period order
            const periodOrder = { "Morning": 1, "Afternoon": 2, "Evening": 3 };
            return periodOrder[a.period] - periodOrder[b.period];
        });

        currentTimeEntryIndex = 0;
        renderTimeEntryCards();
    } catch (err) {
        console.error("Failed to fetch room time entries:", err);
        if (err.code === 'permission-denied') {
            tableDiv.innerHTML = "<p class='text-red-500'>❌ Access denied to time entry data.</p>";
        } else {
            tableDiv.innerHTML = "<p class='text-red-500'>❌ Failed to load time entries.</p>";
        }
    }
}

function renderTimeEntryCards() {
    const tableDiv = document.getElementById("roomScheduleTable");

    if (currentTimeEntries.length === 0) {
        tableDiv.innerHTML = "<p class='text-gray-500'>No time entries available.</p>";
        return;
    }

    const entry = currentTimeEntries[currentTimeEntryIndex];

    // Calculate current date and period
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let currentPeriod = null;
    if (currentMinutes >= 6 * 60 && currentMinutes <= 12 * 60) {
        currentPeriod = 'Morning';
    } else if (currentMinutes >= 13 * 60 && currentMinutes <= 17 * 60) {
        currentPeriod = 'Afternoon';
    } else if (currentMinutes >= 18 * 60 || currentMinutes <= 5 * 60) {
        currentPeriod = 'Evening';
    }

    let dayOfWeek = "N/A";
    if (entry.date) {
        try {
            const [year, month, day] = entry.date.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            dayOfWeek = days[dateObj.getDay()];
        } catch (e) {
            dayOfWeek = "Invalid date";
        }
    }

    const html = `
        <div class="bg-white border border-gray-300 rounded-lg shadow-md p-6">
            <h3 class="text-lg font-semibold text-blue-700 mb-4 text-center">Time Entry</h3>
            <div class="grid grid-cols-2 gap-4">
                <div class="text-center">
                    <p class="text-sm text-gray-500">Date</p>
                    <p class="text-lg font-medium">${entry.date}</p>
                </div>
                <div class="text-center">
                    <p class="text-sm text-gray-500">Period</p>
                    <p class="text-lg font-medium">${entry.period}</p>
                </div>
                <div class="text-center">
                    <p class="text-sm text-gray-500">Start Time</p>
                    <p class="text-lg font-medium">${to12Hour(entry.start) || "-"}</p>
                </div>
                <div class="text-center">
                    <p class="text-sm text-gray-500">End Time</p>
                    <p class="text-lg font-medium">${to12Hour(entry.end) || "-"}</p>
                </div>
                <div class="text-center">
                    <p class="text-sm text-gray-500">Day</p>
                    <p class="text-lg font-medium">${dayOfWeek}</p>
                </div>
                <div class="text-center">
                    <p class="text-sm text-gray-500">Day Hours</p>
                    <p class="text-lg font-medium">${entry.dayTotalHours || "-"}</p>
                </div>
            </div>
        </div>

        <div class="flex items-center justify-center space-x-4 mt-4">
            <button id="prevTimeEntry" class="px-3 py-2 mr-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"${currentTimeEntryIndex === 0 ? 'disabled' : ''}>
                <i class="fas fa-arrow-left"></i>
            </button>
            <span class="text-sm text-gray-600">${currentTimeEntryIndex + 1} of ${currentTimeEntries.length}</span>
            <button id="nextTimeEntry" class="px-3 py-2 ml-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400" ${currentTimeEntryIndex === currentTimeEntries.length - 1 ? 'disabled' : ''}>
                <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `;
    tableDiv.innerHTML = html;

    // Add event listeners for navigation buttons
    document.getElementById("prevTimeEntry").addEventListener("click", () => {
        if (currentTimeEntryIndex > 0) {
            currentTimeEntryIndex--;
            renderTimeEntryCards();
        }
    });
    document.getElementById("nextTimeEntry").addEventListener("click", () => {
        if (currentTimeEntryIndex < currentTimeEntries.length - 1) {
            currentTimeEntryIndex++;
            renderTimeEntryCards();
        }
    });
}

function proceedToDashboard() {
    document.getElementById("confirmModal").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
    document.getElementById("sidebar").style.display = "block";
    document.getElementById("heading").style.display = "block";
    
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

                if (window.innerWidth < 1024) {
                    document.getElementById("mobile-menu-button").style.display = "none";
                }

                document.getElementById("heading").style.display = "none";
            })
        ;
    }
}

async function checkGeofence(roomId = null) {
    console.debug("[DEBUG] checkGeofence called with roomId:", roomId);
    if (!geofenceCenter || !geofenceRadius) {
        console.debug("[DEBUG] Geofence not set.");
        showResultMessage("Geofence not set.", "error");
        return;
    }

    if (!navigator.geolocation) {
        console.debug("[DEBUG] Geolocation not supported.");
        showResultMessage("Geolocation not supported.", "error");
        return;
    }

    const container = document.getElementById("roomScheduleContainer");
    const activeRoom = container.dataset.activeRoom;

    if (!activeRoom && !roomId) {
        console.debug("[DEBUG] No active room selected.");
        showResultMessage("Please select a room first.", "error");
        return;
    }

    const targetRoomId = roomId || activeRoom;
    console.debug("[DEBUG] Target room ID:", targetRoomId);

    const attendanceRoomId = await getAttendanceRoomId(targetRoomId);

    // Check if user is a member of the room
    console.log("[TIME_IN] Checking if user is member of room:", targetRoomId);
    const memberDoc = await db.collection("rooms").doc(targetRoomId).collection("members").doc(auth.currentUser.uid).get();
    if (!memberDoc.exists) {
        console.log("[TIME_IN] User is not a member of this room");
        showResultMessage("You are not a member of this room.", "error");
        return;
    }
    console.log("[TIME_IN] User is a member of the room");

    // Determine active period based on current time
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let activePeriod = null;
    if (currentMinutes >= 6 * 60 && currentMinutes <= 12 * 60) {
        activePeriod = 'morning';
    } else if (currentMinutes >= 13 * 60 && currentMinutes <= 17 * 60) {
        activePeriod = 'afternoon';
    } else if (currentMinutes >= 18 * 60 || currentMinutes <= 5 * 60) {
        activePeriod = 'evening';
    }
    if (!activePeriod) {
        console.log(`[TIME_IN] No active period found`);
        console.log(`[TIME_IN] No active time period found, current time: ${now.toLocaleTimeString()}`);
        showResultMessage("No active time period for time-in.", "error");
        return;
    }

    // Get current location
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            showCurrentLocationOnMap(lat, lng);
            const distance = getDistance(lat, lng, geofenceCenter[0], geofenceCenter[1]);
            if (distance <= geofenceRadius) {
                // Record check in
                const now = new Date();
                const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const scheduleRef = db.collection("rooms").doc(targetRoomId).collection("schedules").doc(auth.currentUser.uid);
                const scheduleDoc = await scheduleRef.get();
                let scheduleData = scheduleDoc.exists ? scheduleDoc.data() : { date: todayDateStr, createdAt: new Date() };
                scheduleData[activePeriod + 'In'] = now.toTimeString().slice(0, 5); // HH:MM
                scheduleData[activePeriod + 'InCoords'] = { lat, lng };
                await scheduleRef.set(scheduleData, { merge: true });

                // Query latest attendance event
                const eventsSnap = await db.collection("rooms").doc(attendanceRoomId).collection("attendanceEvents")
                    .where("internId", "==", auth.currentUser.uid)
                    .orderBy("timestamp", "desc")
                    .limit(1)
                    .get();

                if (!eventsSnap.empty) {
                    const latestEvent = eventsSnap.docs[0];
                    const latestData = latestEvent.data();
                    if (latestData.type === "CHECK_OUT") {
                        // Update latest CHECK_OUT to CHECK_IN
                        await latestEvent.ref.update({
                            type: "CHECK_IN",
                            timestamp: now,
                            period: activePeriod
                        });
                    } else if (latestData.type === "CHECK_IN" && latestData.period === activePeriod) {
                        showResultMessage("Already checked in for this period.", "error");
                        return;
                    } else {
                        // Create new CHECK_IN
                        const attendanceEventRef = db.collection("rooms").doc(attendanceRoomId).collection("attendanceEvents").doc();
                        await attendanceEventRef.set({
                            internId: auth.currentUser.uid,
                            type: "CHECK_IN",
                            timestamp: now,
                            period: activePeriod
                        });
                    }
                } else {
                    // No events, create new CHECK_IN
                    const attendanceEventRef = db.collection("rooms").doc(attendanceRoomId).collection("attendanceEvents").doc();
                    await attendanceEventRef.set({
                        internId: auth.currentUser.uid,
                        type: "CHECK_IN",
                        timestamp: now,
                        period: activePeriod
                    });
                }

                showResultMessage("Time-in recorded!", "success");
                setTimeout(() => {
                    loadTotalHours(targetRoomId);
                    loadHoursLeft(targetRoomId);
                    refreshBtn(targetRoomId);
                }, 500);
            } else {
                showResultMessage("You are outside the geofence. Cannot time in.", "error");
            }
        },
        (err) => {
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

    const container = document.getElementById("roomScheduleContainer");
    const activeRoom = container.dataset.activeRoom;

    if (!activeRoom) {
        showResultMessage("Please select a room first.", "error");
        return;
    }

    const attendanceRoomId = await getAttendanceRoomId(activeRoom);

    let scheduleDoc;
    try {
        console.log("[TIME_OUT] Fetching schedules for room:", activeRoom);
        const entriesSnap = await db.collection("rooms").doc(activeRoom).collection("schedules").orderBy("createdAt", "desc").get();
        console.log("[TIME_OUT] Fetched", entriesSnap.size, "schedule documents");
        if (entriesSnap.empty) {
            console.log("[TIME_OUT] No schedule found for this room");
            showResultMessage("No schedule found for the selected room.", "error");
            return;
        }
        scheduleDoc = entriesSnap.docs[0]; // take the latest schedule
        console.log("[TIME_OUT] Using schedule doc id:", scheduleDoc.id);
    } catch (err) {
        console.error("[TIME_OUT] Failed to load schedule:", err);
        showResultMessage("Failed to load schedule.", "error");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            showCurrentLocationOnMap(lat, lng);

            const distance = getDistance(lat, lng, geofenceCenter[0], geofenceCenter[1]);

            if (distance <= geofenceRadius) {
                const now = new Date();
                const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const scheduleRef = db.collection("rooms").doc(activeRoom).collection("schedules").doc(auth.currentUser.uid);
                const scheduleDoc = await scheduleRef.get();
                let scheduleData = scheduleDoc.exists ? scheduleDoc.data() : { date: todayDateStr, createdAt: new Date() };

                // Query for the latest CHECK_IN event for this intern
                const eventsSnap = await db.collection("rooms").doc(attendanceRoomId).collection("attendanceEvents")
                    .where("internId", "==", auth.currentUser.uid)
                    .where("type", "==", "CHECK_IN")
                    .orderBy("timestamp", "desc")
                    .limit(1)
                    .get();

                if (!eventsSnap.empty) {
                    const eventDoc = eventsSnap.docs[0];
                    const eventData = eventDoc.data();

                    // Fetch active period from the attendanceEvents document
                    const activePeriod = eventData.period;

                    console.log("Active period found:", activePeriod);

                    if (!activePeriod) {
                        showResultMessage("No active time-in to check out from.", "error");
                        return;
                    }

                    // Update event to CHECK_OUT
                    await eventDoc.ref.update({ type: "CHECK_OUT" });

                    scheduleData[activePeriod + 'Out'] = now.toTimeString().slice(0, 5); // HH:MM
                    scheduleData[activePeriod + 'OutCoords'] = { lat, lng };

                    const inTime = scheduleData[activePeriod + 'In'];
                    const outTime = scheduleData[activePeriod + 'Out'];
                    const inMinutes = timeToMinutes(inTime);
                    const outMinutes = timeToMinutes(outTime);
                    const duration = (outMinutes - inMinutes) / 60;

                    // Save period total hours
                    scheduleData[activePeriod + 'TotalHours'] = duration;

                    // Calculate total hours from all periods
                    let totalHours = 0;
                    if (scheduleData.morningTotalHours) totalHours += scheduleData.morningTotalHours;
                    if (scheduleData.afternoonTotalHours) totalHours += scheduleData.afternoonTotalHours;
                    if (scheduleData.eveningTotalHours) totalHours += scheduleData.eveningTotalHours;
                    scheduleData.totalHours = totalHours;

                    await scheduleRef.set(scheduleData, { merge: true });

                    // Update progressHours
                    const internRef = db.collection("rooms").doc(activeRoom).collection("members").doc(auth.currentUser.uid);
                    await internRef.update({
                        progressHours: firebase.firestore.FieldValue.increment(duration)
                    });

                    showResultMessage("Time-out recorded!", "success");

                    setTimeout(() => {
                        loadTotalHours(activeRoom);
                        loadHoursLeft(activeRoom);
                        refreshBtn(activeRoom);
                    }, 500);
                } else {
                    showResultMessage("No active check-in found to check out from.", "error");
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

async function loadTotalHours(roomId) {
    try {
        if (!roomId) return;

        // Check if it's a supervisor room
        const geofenceSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
        const isSupervisorRoom = !geofenceSnap.empty;

        // Fetch schedule totalHours
        const entriesSnap = await db.collection("rooms").doc(roomId).collection("schedules").orderBy("createdAt", "desc").get();
        let scheduleDoc;
        if (isSupervisorRoom) {
            // For supervisor rooms, take the latest shared schedule
            scheduleDoc = entriesSnap.docs[0];
        } else {
            // For non-supervisor rooms, find by user uid
            scheduleDoc = entriesSnap.docs.find(doc => doc.id === auth.currentUser.uid);
        }
        if (scheduleDoc) {
            globalTotalHours = scheduleDoc.data().totalHours || 0;
        }
    } catch (err) {
        console.error("Error loading schedule total hours:", err);
    }
}

async function loadHoursLeft(roomId) {
    if (!auth.currentUser || !roomId) return;

    try {
        const internDoc = await db.collection("rooms").doc(roomId).collection("members").doc(auth.currentUser.uid).get();
        let progressHours = 0;
        if (internDoc.exists) {
            progressHours = internDoc.data().progressHours || 0;
        }

        const hoursLeft = Math.max(globalTotalHours - progressHours, 0);

        const hoursValue = document.getElementById("hoursValue");
        const hoursProgress = document.getElementById("hoursProgress");

        if (hoursValue && hoursProgress) {
            hoursValue.textContent = `${hoursLeft.toFixed(1)} hrs`;

            const progressPercent = globalTotalHours > 0 ? (progressHours / globalTotalHours) * 100 : 0;
            const degrees = (progressPercent / 100) * 360;

            hoursProgress.style.setProperty("--progress", `${degrees}deg`);
        }
    } catch (err) {
        console.error("Failed to load hours left:", err);
    }
}

async function loadRoomProgress() {
    if (!auth.currentUser) return;

    try {
        const membersSnap = await db.collectionGroup("members").where("internId", "==", auth.currentUser.uid).get();
        const joinedRooms = [];
        for (const doc of membersSnap.docs) {
          const roomId = doc.ref.parent.parent.id;
          joinedRooms.push({
            roomId: roomId,
            data: doc.data()
          });
        }

        let progressHTML = "";

        for (const { roomId, data: memberData } of joinedRooms) {
            try {
                const roomDoc = await db.collection("rooms").doc(roomId).get();
                if (!roomDoc.exists) continue;
                const roomData = roomDoc.data();

            // Skip supervisor rooms
            const geofenceSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
            if (!geofenceSnap.empty) continue;

                const roomName = roomData.roomName || "Unnamed Room";

                // Fetch coordinator's full name
                let coordinatorName = "Unnamed Coordinator";
                if (roomData.coordinatorEmail) {
                    try {
                        const coordSnap = await db.collection("coordinators")
                            .where("email", "==", roomData.coordinatorEmail)
                            .limit(1)
                            .get();
                        if (!coordSnap.empty) {
                            const coordData = coordSnap.docs[0].data();
                            coordinatorName = coordData.fullName || "Unnamed Coordinator";
                        }
                    } catch (err) {
                        console.error("Error fetching coordinator:", err);
                    }
                }

                // Use totalHours from roomData instead of schedule
                const totalHours = roomData.totalHours || 0;

                const progressHours = memberData.progressHours || 0;
                const progressPercent = totalHours > 0 ? (progressHours / totalHours) * 100 : 0;

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
                                ${progressHours.toFixed(1)} / ${totalHours} hours
                            </div>
                            <div class="text-xs text-gray-400 mt-1">
                                Coordinator: ${coordinatorName}
                            </div>
                        </div>
                    </div>
                `;
            } catch (err) {
                console.error(`Error loading progress for room ${roomId}:`, err);
            }
        }

        document.getElementById("roomProgressContainer").innerHTML = progressHTML;
    } catch (error) {
        console.error('Error loading room progress:', error);
        // Gracefully handle permission errors by showing empty progress
        document.getElementById("roomProgressContainer").innerHTML = "<p class='text-gray-500'>Unable to load progress data.</p>";
    }
}

async function getAttendanceRoomId(roomId) {
    const roomDoc = await db.collection("rooms").doc(roomId).get();
    if (!roomDoc.exists) {
        // Find a room with coordinatorEmail
        const roomsSnap = await db.collection("rooms").where("coordinatorEmail", "!=", null).limit(1).get();
        if (!roomsSnap.empty) {
            return roomsSnap.docs[0].id;
        }
        return roomId;
    }
    const roomData = roomDoc.data();
    if (roomData.coordinatorEmail) {
        return roomId;
    } else {
        // Find a room with coordinatorEmail
        const roomsSnap = await db.collection("rooms").where("coordinatorEmail", "!=", null).limit(1).get();
        if (!roomsSnap.empty) {
            return roomsSnap.docs[0].id;
        }
        return roomId;
    }
}

async function refreshBtn(roomId) {
    try {
        if (!roomId) return;

        console.log("[REFRESH_BTN] Starting refreshBtn for roomId:", roomId, "internId:", auth.currentUser.uid);

        // Determine active period based on current time
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let activePeriod = null;
        if (currentMinutes >= 6 * 60 && currentMinutes <= 12 * 60) {
            activePeriod = 'morning';
        } else if (currentMinutes >= 13 * 60 && currentMinutes <= 17 * 60) {
            activePeriod = 'afternoon';
        } else if (currentMinutes >= 18 * 60 || currentMinutes <= 3 * 60 + 59) {
            activePeriod = 'evening';
        }

        const timeInBtn = document.getElementById("timeInButton");
        const timeOutBtn = document.getElementById("timeOutButton");

        // Get the correct room ID where attendance events are stored
        const attendanceRoomId = await getAttendanceRoomId(roomId);
        console.log("[REFRESH_BTN] doc id before attendance events:", attendanceRoomId);

        // Query for the latest attendance event for this intern
        const eventsSnap = await db.collection("rooms").doc(attendanceRoomId).collection("attendanceEvents")
            .where("internId", "==", auth.currentUser.uid)
            .orderBy("timestamp", "desc")
            .limit(1)
            .get();

        if (!eventsSnap.empty) {
            const eventDoc = eventsSnap.docs[0];
            const eventData = eventDoc.data();
            const eventType = eventData.type;

            console.log("[REFRESH_BTN] Attendance event type:", eventType);

            if (eventType === "CHECK_IN") {
                // Has check-in, disable timeIn, enable timeOut
                timeInBtn.disabled = true;
                timeOutBtn.disabled = false;
                timeInBtn.style.opacity = 0.5;
                timeOutBtn.style.opacity = 1;
                console.log("[REFRESH_BTN] Event is CHECK_IN: timeIn disabled, timeOut enabled");
            } else if (eventType === "CHECK_OUT") {
                // Has check-out, disable timeOut, enable timeIn
                timeInBtn.disabled = false;
                timeOutBtn.disabled = true;
                timeInBtn.style.opacity = 1;
                timeOutBtn.style.opacity = 0.5;
                console.log("[REFRESH_BTN] Event is CHECK_OUT: timeIn enabled, timeOut disabled");
            } else {
                // Unknown type, enable timeIn, disable timeOut
                timeInBtn.disabled = false;
                timeOutBtn.disabled = true;
                timeInBtn.style.opacity = 1;
                timeOutBtn.style.opacity = 0.5;
                console.log("[REFRESH_BTN] Unknown event type: timeIn enabled, timeOut disabled");
            }
        } else {
            // No attendance events, enable timeIn, disable timeOut
            timeInBtn.disabled = false;
            timeOutBtn.disabled = true;
            timeInBtn.style.opacity = 1;
            timeOutBtn.style.opacity = 0.5;
            console.log("[REFRESH_BTN] No attendance event found: timeIn enabled, timeOut disabled");
            console.log("[REFRESH_BTN] Fetched attendance events: none");
        }

        console.log("[REFRESH_BTN] Final button states - timeInBtn.disabled:", timeInBtn.disabled, "timeOutBtn.disabled:", timeOutBtn.disabled);
    } catch (error) {
        alert("Error fetching status:" + error);
        console.log("DEBUG: refreshBtn error:", error);
    }
}

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

window.addEventListener("DOMContentLoaded", () => {
    if (auth.currentUser) {
        const container = document.getElementById("roomScheduleContainer");
        const activeRoom = container.dataset.activeRoom;
        loadTotalHours(activeRoom);
    }
});

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
        const roomId = roomDoc.id;

        // Check if already member
        const internSnap = await db.collection("rooms").doc(roomId).collection("members").doc(auth.currentUser.uid).get();
        if (internSnap.exists) {
            status.textContent = "❌ Already joined this room.";
            return;
        }

        // Add intern
        await db.collection("rooms").doc(roomId).collection("members").doc(auth.currentUser.uid).set({
            internId: auth.currentUser.uid,
            email: auth.currentUser.email,
            name: userData.name || "Intern Name",
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            progressHours: 0,
            status: "active"
        });

        closeJoinRoomModal();
        fetchJoinedRooms();
        location.reload();
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

    document.getElementById('roomScheduleKebabMenu').innerHTML = '';

    document.getElementById("joinRoomInput").parentElement.style.display = "flex";
    document.getElementById("joinedRoomsList").style.display = "block";
    document.getElementById("internRooms").parentElement.style.display = "block";

    toggleJoinRoomButton();
}

async function fetchJoinedRooms() {
    if (!auth.currentUser) {
        console.error("User not authenticated");
        return;
    }

    const internRoomsDiv = document.getElementById("internRooms");
    internRoomsDiv.innerHTML = "<p class='text-gray-500'>Loading rooms...</p>";

    try {
        const membersSnap = await db.collectionGroup("members").where("internId", "==", auth.currentUser.uid).get();
        const joinedRooms = [];
        for (const doc of membersSnap.docs) {
          const roomId = doc.ref.parent.parent.id;
          joinedRooms.push({
            roomId: roomId,
            data: doc.data()
          });
        }

        const noRoomsMessage = document.getElementById("noRoomsMessage");

        internRoomsDiv.innerHTML = "";

        let roomCount = 0;
        for (const { roomId } of joinedRooms) {
            const roomDoc = await db.collection("rooms").doc(roomId).get();
            if (!roomDoc.exists) continue;
            const roomData = roomDoc.data();

            // Skip supervisor rooms
            const geofenceSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
            if (!geofenceSnap.empty) continue;

            const card = document.createElement("div");
            card.className = "border rounded-lg shadow-md p-4 hover:shadow-lg transition cursor-pointer mb-3";
            card.style.backgroundColor = "#4174b8";
            card.id = `room-card-${roomId}`;

            const roomName = roomData.roomName || "Unnamed Room";

            let roomDescription = "Not found";
            if (roomData.coordinatorEmail) {
                try {
                    const coordSnap = await db.collection("coordinators")
                        .where("email", "==", roomData.coordinatorEmail)
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
                        <button class="kebab-button" onclick="toggleKebabMenu('${roomId}', event)">
                        <i class="fas fa-ellipsis-v" style="color: white;"></i>
                      </button>
                      <div id="popover-${roomId}" class="popover">
                        <button class="popover-item leave-room" onclick="leaveRoom('${roomId}')">
                          <i class="fas fa-sign-out-alt mr-2"></i>Leave Room
                        </button>
                      </div>
                    </div>
                </div>
                <p class="text-xs" style="color: #DBDBDB;">Code: ${roomData.joinCode || roomId}</p>
                <p class="text-xs mt-2" style="color: #DBDBDB;">${roomDescription}</p>
            `;

            internRoomsDiv.appendChild(card);
            roomCount++;

            card.addEventListener("click", () => {
                const container = document.getElementById("roomScheduleContainer");
                if (container.dataset.activeRoom === roomId) {
                    container.classList.toggle("hidden");
                    document.getElementById("joinRoomInput").parentElement.style.display = "flex";
                    document.getElementById("joinedRoomsList").style.display = "block";
                    document.getElementById("internRooms").parentElement.style.display = "block";
                    toggleJoinRoomButton();
                } else {
                    container.dataset.activeRoom = roomId;
                    container.classList.remove("hidden");

                    document.getElementById("joinRoomInput").parentElement.style.display = "none";
                    document.getElementById("joinedRoomsList").style.display = "none";
                    document.getElementById("internRooms").parentElement.style.display = "none";

                    displayRoomSchedule(roomId);
                    toggleJoinRoomButton();
                }
            });
        }

        if (roomCount > 0) {
            noRoomsMessage.classList.add("hidden");
        } else {
            noRoomsMessage.classList.remove("hidden");
        }
    } catch (err) {
        console.error("Error loading rooms:", err);
        internRoomsDiv.innerHTML = "<p class='text-red-500'>❌ Failed to load rooms.</p>";
    }
}

function toggleKebabMenu(roomId, event) {
    event.stopPropagation();

    const allPopovers = document.querySelectorAll('.popover');
    allPopovers.forEach(popover => {
        if (popover.id !== `popover-${roomId}`) {
            popover.classList.remove('show');
        }
    });

    const popover = document.getElementById(`popover-${roomId}`);
    if (popover) {
        popover.classList.toggle('show');
    }
}

async function leaveRoom(roomId) {
    if (!confirm(`Are you sure you want to leave this room (${roomId})?`)) {
        return;
    }

    try {
        await db.collection("rooms").doc(roomId).collection("members").doc(auth.currentUser.uid).delete();

        const popover = document.getElementById(`popover-${roomId}`);
        if (popover) {
            popover.classList.remove('show');
        }

        fetchJoinedRooms();

        const container = document.getElementById("roomScheduleContainer");
        if (container.dataset.activeRoom === roomId) {
            container.classList.add("hidden");
            container.dataset.activeRoom = "";
            document.getElementById("joinRoomInput").parentElement.style.display = "flex";
            document.getElementById("joinedRoomsList").style.display = "block";
            document.getElementById("internRooms").parentElement.style.display = "block";
            toggleJoinRoomButton();
        }

        alert("Successfully left the room!");
    } catch (err) {
        console.error("Failed to leave room:", err);
        alert("Failed to leave room. Please try again.");
    }
}

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

    const button = document.getElementById('setZoneButton');
    const spinner = document.getElementById('setZoneSpinner');
    const text = document.getElementById('setZoneText');
    button.disabled = true;
    spinner.classList.remove('hidden');
    text.textContent = 'Connecting...';

    if (!roomCode) {
        console.log("DEBUG: Zone setting failed: No room code entered");
        setZoneStatus.textContent = 'Please enter a supervisor room code.';
        setZoneStatus.style.color = 'red';
        button.disabled = false;
        spinner.classList.add('hidden');
        text.textContent = 'Set Zone';
        return;
    }

    try {
        const roomSnap = await db.collection("rooms")
            .where("joinCode", "==", roomCode)
            .limit(1)
            .get();

        if (roomSnap.empty) {
            console.log("DEBUG: Zone setting failed: Room not found with code:", roomCode);
            setZoneStatus.textContent = 'Room not found with the given code.';
            setZoneStatus.style.color = 'red';
            button.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Set Zone';
            return;
        }

        const roomDoc = roomSnap.docs[0];
        const roomData = roomDoc.data();
        const roomId = roomDoc.id;

        const geofenceSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
        if (geofenceSnap.empty) {
            console.log("DEBUG: Zone setting failed: No geofence found for room:", roomId);
            setZoneStatus.textContent = 'No geofence found for this supervisor room.';
            setZoneStatus.style.color = 'red';
            button.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Set Zone';
            return;
        }

        const geofenceData = geofenceSnap.docs[0].data();

        // Add intern if not already
        const internRef = db.collection("rooms").doc(roomId).collection("members").doc(auth.currentUser.uid);
        const internSnap = await internRef.get();
        if (!internSnap.exists) {
            await internRef.set({
                internId: auth.currentUser.uid,
                email: auth.currentUser.email,
                name: userData.name || "Intern Name",
                joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
                progressHours: 0,
                status: "active"
            });
        }

        geofenceCenter = [geofenceData.center.lat, geofenceData.center.lng];
        geofenceRadius = geofenceData.radius || 100;

        console.log("DEBUG: Zone set successfully with center:", geofenceCenter, "and radius:", geofenceRadius);

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

        await fetchJoinedRooms();
        await checkSupervisorZoneStatus(auth.currentUser);

        // Refresh button states for the supervisor room
        refreshBtn(roomId);

        setZoneStatus.style.color = 'green';
        setZoneStatus.textContent = 'Successfully joined supervisor room and set geofence zone.';

        button.disabled = false;
        spinner.classList.add('hidden');
        text.textContent = 'Set Zone';

        setTimeout(() => {
            setZoneStatus.textContent = '';
        }, 2000);

    } catch (error) {
        console.log("DEBUG: Zone setting failed:", error.message);
        console.error('Error setting supervisor zone:', error);
        setZoneStatus.style.color = 'red';
        setZoneStatus.textContent = 'Error setting supervisor zone: ' + error.message;
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
        const membersSnap = await db.collectionGroup("members").where("internId", "==", auth.currentUser.uid).get();
        let supervisorRoomId = null;
        for (const doc of membersSnap.docs) {
            const roomId = doc.ref.parent.parent.id;
            const geofenceSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
            if (!geofenceSnap.empty) {
                supervisorRoomId = roomId;
                break;
            }
        }

        if (!supervisorRoomId) {
            alert('No supervisor zone found to disconnect from.');
            return;
        }

        await db.collection("rooms").doc(supervisorRoomId).collection("members").doc(auth.currentUser.uid).delete();

        await checkSupervisorZoneStatus(auth.currentUser);

        alert('Successfully disconnected from the supervisor zone.');
    } catch (error) {
        console.error('Error disconnecting from supervisor zone:', error);
        alert('Failed to disconnect from supervisor zone. Please try again.');
    }
}

async function loadTasks() {
    if (!auth.currentUser) return;

    try {
        console.log("Loading tasks for all joined rooms...");
        const membersSnap = await db.collectionGroup("members").where("internId", "==", auth.currentUser.uid).get();
        const joinedRooms = [];
        for (const doc of membersSnap.docs) {
            const roomId = doc.ref.parent.parent.id;
            joinedRooms.push(roomId);
        }

        const taskFilter = document.getElementById("taskFilter");
        taskFilter.innerHTML = '<option value="all">All Rooms</option>';

        let allTasks = [];

        for (const roomId of joinedRooms) {
            try {
                const roomDoc = await db.collection("rooms").doc(roomId).get();
                if (!roomDoc.exists) continue;
                const roomData = roomDoc.data();
                const roomName = roomData.roomName || "Unnamed Room";

                // Add to filter dropdown
                const option = document.createElement("option");
                option.value = roomId;
                option.textContent = roomName;
                taskFilter.appendChild(option);

                // Load tasks for this room
                const tasksSnap = await db.collection("rooms").doc(roomId).collection("tasks").get();
                tasksSnap.forEach((doc) => {
                    const task = doc.data();
                    task.roomId = roomId;
                    task.roomName = roomName;
                    task.id = doc.id;
                    allTasks.push(task);
                });
            } catch (err) {
                console.error(`Error loading tasks for room ${roomId}:`, err);
            }
        }

        // Store all tasks globally for filtering
        window.allTasks = allTasks;

        // Add event listener to taskFilter
        taskFilter.addEventListener('change', filterTasks);

        // Initially render all tasks
        renderAllTasks();

    } catch (error) {
        console.error('Error loading tasks:', error);
        document.getElementById("taskList").innerHTML = "<p class='text-red-500'>❌ Failed to load tasks.</p>";
    }
}

function filterTasks() {
    renderAllTasks();
}

function renderAllTasks() {
    const taskFilter = document.getElementById("taskFilter");
    const selectedRoom = taskFilter.value;
    let tasksToRender = window.allTasks;

    if (selectedRoom !== 'all') {
        tasksToRender = window.allTasks.filter(task => task.roomId === selectedRoom);
    }

    // Group tasks by due date categories
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

    const nextWeekStart = new Date(thisWeekEnd);
    nextWeekStart.setDate(thisWeekEnd.getDate() + 1);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    const noDueDateTasks = [];
    const thisWeekTasks = [];
    const nextWeekTasks = [];
    const laterTasks = [];

    tasksToRender.forEach(task => {
        if (!task.dueDate) {
            noDueDateTasks.push(task);
        } else {
            const dueDate = new Date(task.dueDate);
            if (dueDate >= thisWeekStart && dueDate <= thisWeekEnd) {
                thisWeekTasks.push(task);
            } else if (dueDate >= nextWeekStart && dueDate <= nextWeekEnd) {
                nextWeekTasks.push(task);
            } else if (dueDate > nextWeekEnd) {
                laterTasks.push(task);
            } else {
                noDueDateTasks.push(task); // Overdue or past
            }
        }
    });

    // Sort tasks within each category
    noDueDateTasks.sort((a, b) => a.title.localeCompare(b.title));
    thisWeekTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    nextWeekTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    laterTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Render tasks in accordions
    renderTasksInAccordion("noDueDateTasks", noDueDateTasks);
    renderTasksInAccordion("thisWeekTasks", thisWeekTasks);
    renderTasksInAccordion("nextWeekTasks", nextWeekTasks);
    renderTasksInAccordion("laterTasks", laterTasks);
}

function renderTasksInAccordion(containerId, tasks) {
    console.log(`[TASK_RENDER] Rendering tasks in container: ${containerId}, total tasks: ${tasks.length}`);
    try {
        const container = document.getElementById(containerId);
        if (tasks.length === 0) {
            console.log(`[TASK_RENDER] No tasks in category: ${containerId}`);
            container.innerHTML = "<div class='text-gray-500'>No tasks in this category.</div>";
            return;
        }

        container.innerHTML = "";
        tasks.forEach(task => {
            console.log(`[TASK_RENDER] Rendering task: ${task.title}, room: ${task.roomName}, due: ${task.dueDate}, id: ${task.id}`);
            const taskCard = document.createElement("div");
            taskCard.className = "bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition";
            taskCard.innerHTML = `
                <h4 class="text-lg font-semibold text-blue-700 mb-2">${task.title}</h4>
                <p class="text-gray-600 mb-2">${task.description}</p>
                <div class="text-sm text-gray-500">
                    <p>Room: ${task.roomName}</p>
                    <p>Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"}</p>
                </div>
            `;
            taskCard.addEventListener("click", () => showTaskDetails(task));
            container.appendChild(taskCard);
            console.log(`[TASK_RENDER] Appended task card for: ${task.title}`);
        });
        console.log(`[TASK_RENDER] Finished rendering ${tasks.length} tasks in ${containerId}`);
    } catch (error) {
        console.error(`[TASK_RENDER] Error rendering tasks in container ${containerId}:`, error);
    }
}

function showTaskDetails(task) {
    // Populate task details
    document.getElementById("taskTitle").textContent = task.title || "Untitled Task";
    document.getElementById("taskDescription").textContent = task.description || "No description available.";
    document.getElementById("taskDueDate").textContent = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date";
    document.getElementById("taskStatus").textContent = task.status || "Pending";
    document.getElementById("taskAssignedBy").textContent = task.assignedBy || "Coordinator";

    // Show the task details section
    document.getElementById("taskDetailsSection").classList.remove("hidden");

    // Hide the task list accordion
    document.getElementById("taskList").style.display = "none";

    // Hide the task tabs navigation and filter
    document.getElementById("taskTabsNav").style.display = "none";
    document.getElementById("taskFilter").style.display = "none";

    // Hide the tab contents
    document.getElementById("noDueDateTasks").classList.add("hidden");
    document.getElementById("thisWeekTasks").classList.add("hidden");
    document.getElementById("nextWeekTasks").classList.add("hidden");
    document.getElementById("laterTasks").classList.add("hidden");
}

function backToTasks() {
    // Hide the task details section
    document.getElementById("taskDetailsSection").classList.add("hidden");

    // Show the task tabs navigation and filter
    document.getElementById("taskTabsNav").style.display = "block";
    document.getElementById("taskFilter").style.display = "block";

    // Show the active tab content, default to noDueDateTasks
    showTaskTab('noDueDateTasks');
}

function toggleMapModal() {
    const modal = document.getElementById('mapModal');
    if (!modal) return;

    const isShowing = modal.style.display === 'flex';
    modal.style.display = isShowing ? 'none' : 'flex';

    if (!isShowing) {
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
