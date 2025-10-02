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
let selectedRoomCode = null;

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
});

// Authentication State Change
window.onload = () => {
    console.log("DEBUG: window.onload called, setting up auth state listener");
    auth.onAuthStateChanged(async (user) => {
        console.log("DEBUG: onAuthStateChanged triggered, user:", user ? user.email : "null");
        if (user && user.emailVerified) {
            console.log("DEBUG: User is verified, checking supervisor collection");
            const snapshot = await db
                .collection("supervisors")
                .where("email", "==", user.email)
                .limit(1)
                .get();
            console.log("DEBUG: Supervisor query result, empty:", snapshot.empty);
            if (snapshot.empty) {
                console.log("DEBUG: No supervisor document found, signing out and showing error");
                await auth.signOut();
                document.getElementById("authModal").classList.remove("hidden");
                document.getElementById("dashboard").classList.add("hidden");
                document.getElementById("confirmModal").style.display = "none";
                document.getElementById("authStatus").textContent = "❌ This email is not registered as a supervisor. Please register first.";
                return;
            }
            console.log("DEBUG: Supervisor found, showing confirmation modal");
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
            console.log("DEBUG: User not verified or null, showing auth modal");
            document.getElementById("authModal").classList.remove("hidden");
            document.getElementById("dashboard").classList.add("hidden");
            document.getElementById("confirmModal").style.display = "none";
        }
    });
};

// Authentication Functions
function login(event) {
    if (event) event.preventDefault(); // Prevent form submission and page reload
    console.log("DEBUG: login function called");
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const fullName = document.getElementById("fullName").value;
    const company = document.getElementById("company").value;
    const authStatus = document.getElementById("authStatus");

    console.log("DEBUG: login inputs - email:", email, "isRegisterMode:", isRegisterMode);

    if (isRegisterMode) {
        console.log("DEBUG: Registering new user");
        auth
            .createUserWithEmailAndPassword(email, password)
            .then((cred) => {
                console.log("DEBUG: User created, sending verification email");
                return cred.user.sendEmailVerification().then(() => {
                    console.log("DEBUG: Verification email sent, creating supervisor doc");
                    return db.collection("supervisors").doc(cred.user.uid).set({
                        email,
                        fullName,
                        company,
                        createdAt: new Date(),
                    });
                });
            })
            .then(() => {
                console.log("DEBUG: Registration successful, supervisor doc created");
                authStatus.textContent =
                    "✅ Verification email sent. Please verify before logging in.";
            })
            .catch((err) => {
                console.error("DEBUG: Registration error:", err);
                authStatus.textContent = "❌ " + err.message;
            });
    } else {
        console.log("DEBUG: Attempting login");
        auth
            .signInWithEmailAndPassword(email, password)
            .then(async (cred) => {
                console.log("DEBUG: Sign in successful, checking email verification");
                if (!cred.user.emailVerified) {
                    console.log("DEBUG: Email not verified");
                    authStatus.textContent =
                        "⚠️ Please verify your email before logging in.";
                    auth.signOut();
                    return;
                }
                console.log("DEBUG: Email verified, checking supervisor collection");
                const snapshot = await db
                    .collection("supervisors")
                    .where("email", "==", email)
                    .limit(1)
                    .get();
                if (snapshot.empty) {
                    console.log("DEBUG: No supervisor document found");
                    authStatus.textContent =
                        "❌ This email is not registered as a supervisor.";
                    auth.signOut();
                    return;
                }
                console.log("DEBUG: Supervisor found, login complete");
                // Proceed to dashboard after successful login
                proceedToDashboard();
            })
            .catch((err) => {
                console.error("DEBUG: Login error:", err);
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
    map.panTo(e.latlng); // Pan to the clicked location without changing zoom level
}

function initMap() {
    map = L.map("map").setView([10.7502, 121.9324], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "Map data © OpenStreetMap contributors",
    }).addTo(map);

    disableGeofenceEdit(); // Disable editing by default
}

async function getRoomIdByJoinCode(joinCode) {
    const roomSnap = await db.collection("rooms")
        .where("joinCode", "==", joinCode)
        .limit(1)
        .get();
    if (roomSnap.empty) {
        return null;
    }
    return roomSnap.docs[0].id;
}

// Load geofence for this room
async function loadGeofence(joinCode) {
    if (!joinCode) return;
    const roomId = await getRoomIdByJoinCode(joinCode);
    if (!roomId) {
        console.warn("loadGeofence: Room not found for joinCode", joinCode);
        return;
    }
    const geoSnap = await db.collection("rooms").doc(roomId).collection("geofences").limit(1).get();
    if (!geoSnap.empty) {
        const data = geoSnap.docs[0].data();
        const latlng = [data.center.lat, data.center.lng];
        const radius = data.radius || 100;
        document.getElementById("radiusInput").value = radius;

        if (marker) map.removeLayer(marker);
        if (circle) map.removeLayer(circle);

        marker = L.marker(latlng).addTo(map);
        circle = L.circle(latlng, { radius: radius }).addTo(map);
        map.setView(latlng, 16);
        map.invalidateSize();
    } else {
        // No geofence for this room, reset map
        if (marker) map.removeLayer(marker);
        if (circle) map.removeLayer(circle);
        marker = null;
        circle = null;
        document.getElementById("radiusInput").value = 100;
        map.setView([10.7502, 121.9324], 15);
    }
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

async function saveGeofence() {
    console.log("saveGeofence: Function called");
    const radius = parseInt(document.getElementById("radiusInput").value);
    console.log("saveGeofence: Radius from input:", radius);

    if (!marker || !auth.currentUser) {
        console.error("saveGeofence: Missing marker or user", {
            marker: !!marker,
            user: !!auth.currentUser,
            markerDetails: marker ? marker.getLatLng() : null,
            userEmail: auth.currentUser ? auth.currentUser.email : null
        });
        document.getElementById("status").textContent =
            "⚠️ Select a location on the map first.";
        console.warn("saveGeofence: No marker or user.", {
            marker,
            user: auth.currentUser,
        });
        return;
    }

    if (!selectedRoomCode) {
        console.error("saveGeofence: No room selected", { selectedRoomCode });
        document.getElementById("status").textContent =
            "⚠️ No room selected.";
        return;
    }

    const { lat, lng } = marker.getLatLng();
    const email = auth.currentUser.email;
    console.log("saveGeofence: Extracted values:", {
        lat,
        lng,
        radius,
        joinCode: selectedRoomCode,
        email,
    });

    const roomId = await getRoomIdByJoinCode(selectedRoomCode);
    if (!roomId) {
        console.error("saveGeofence: Room not found for joinCode", selectedRoomCode);
        document.getElementById("status").textContent =
            "❌ Room not found.";
        return;
    }

    const geofenceData = {
        center: { lat, lng },
        radius: radius,
        joinCode: selectedRoomCode,
        supervisorEmail: email,
        updatedAt: new Date(),
    };
    console.log("saveGeofence: Data to save:", geofenceData);

    db.collection("rooms").doc(roomId).collection("geofences").doc().set(geofenceData)
        .then(() => {
            console.log("saveGeofence: Firestore set successful");
            document.getElementById(
                "status"
            ).textContent = `✅ Geofence saved at (${lat.toFixed(
                4
            )}, ${lng.toFixed(4)}) with radius ${radius}m.`;
            console.log("saveGeofence: Geofence saved successfully.");
            disableGeofenceEdit(); // Disable editing after saving
        })
        .catch((error) => {
            console.error("saveGeofence: Firestore set failed", error);
            document.getElementById("status").textContent =
                "❌ Failed to save geofence.";
            console.error("saveGeofence: Error saving geofence:", error);
            document.getElementById("status").textContent += ` (${
                error.code || error.message
            })`;
        });
}

// Intern Management Functions
async function loadInterns() {
  console.log("loadInterns called");

  const email = auth.currentUser?.email;
  const internList = document.getElementById("internList");
  internList.innerHTML = "<p class='text-sm text-gray-500'>Loading...</p>";

  if (!email) {
    internList.innerHTML = "<p class='text-sm text-red-600'>No supervisor logged in.</p>";
    return;
  }

  try {
    // Fetch interns linked to this supervisor
    const snapshot = await db.collection("interns")
      .where("supervisorEmail", "==", email)
      .get();

    internList.innerHTML = "";
    if (snapshot.empty) {
      internList.innerHTML = "<p class='text-sm text-gray-500'>No interns assigned.</p>";
      return;
    }

    for (const docSnap of snapshot.docs) {
      const intern = docSnap.data();
      const internId = docSnap.id;

      try {
        const presenceDoc = await db.collection("interns_inside").doc(internId).get();

        let timedInStatus = "❌ Not Timed In";
        let timedInClass = "text-red-600";

        if (presenceDoc.exists) {
          const data = presenceDoc.data();
          if (data.timedIn) {
            timedInStatus = "✅ Timed In";
            timedInClass = "text-green-600";
          }
        }

        internList.innerHTML += `
          <li class="bg-gray-50 rounded-lg shadow p-4 flex justify-between items-center">
            <div>
              <h3 class="text-lg font-semibold">${intern.name || "Unnamed Intern"}</h3>
              <p class="text-sm text-gray-500">${intern.email || ""}</p>
              <p class="text-sm ${timedInClass} font-medium mt-1">${timedInStatus}</p>
            </div>
          </li>
        `;

      } catch (presenceErr) {
        console.error("Error loading intern presence:", presenceErr);
        internList.innerHTML += `
          <li class="text-red-600">❌ Error loading presence for ${intern.name || internId}</li>`;
      }
    }

  } catch (err) {
    console.error("Error loading interns:", err);
    internList.innerHTML =
      "<p class='text-sm text-red-600'>❌ Error loading interns.</p>";
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
    initMap();
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

  const supervisorEmail = auth.currentUser?.email;
  if (!supervisorEmail) {
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
      supervisorEmail,
      createdAt: new Date(),
    });

    statusEl.textContent = `✅ Room created! Join Code: ${joinCode}`;
    statusEl.classList.remove("text-red-600");
    statusEl.classList.add("text-green-600");

    // Refresh the rooms list to show the new room
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

  const supervisorEmail = auth.currentUser?.email;
  if (!supervisorEmail) {
    roomList.innerHTML = "<p class='text-sm text-red-600'>Not logged in.</p>";
    return;
  }

  try {
    const snapshot = await db.collection("rooms")
    .where("supervisorEmail", "==", supervisorEmail)
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

  // Fetch and render interns dynamically
  fetchRoomInterns(selectedRoomCode);
  loadInterns();

  // Load geofence for this room
  loadGeofence(selectedRoomCode);

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

        internList.innerHTML = interns.map(email => `<li>${email}</li>`).join("");
    } catch (err) {
        internList.innerHTML = `<li class='text-red-500'>Error: ${err.message}</li>`;
    }
}