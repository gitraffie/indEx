// Authentication Module for Intern Dashboard
class AuthManager {
    constructor() {
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.isRegisterMode = false;
        this.currentIntern = null;
        this.justLoggedIn = false;
        this.init();
    }

    init() {
        this.setupAuthStateListener();
    }

    toggleAuthMode() {
        this.isRegisterMode = !this.isRegisterMode;
        document.getElementById("modalTitle").textContent = this.isRegisterMode
            ? "INTERN REGISTRATION"
            : "INTERN LOGIN";
        document.getElementById("authButton").textContent = this.isRegisterMode
            ? "Register"
            : "Log In";
        document.getElementById("togglePrompt").textContent = this.isRegisterMode
            ? "Already have an account?"
            : "Don't have an account?";
        document.getElementById("extraFields")
            .classList.toggle("hidden", !this.isRegisterMode);
        document
            .getElementById("checkbox")
            .classList.toggle("hidden", this.isRegisterMode);
        document.getElementById("authStatus").textContent = "";

        // Update toggleMode button text
        const toggleModeBtn = document.getElementById("toggleMode");
        if (this.isRegisterMode) {
            toggleModeBtn.textContent = "Log in here";
        } else {
            toggleModeBtn.textContent = "Register here";
        }
    }

    async authAction() {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const fullName = document.getElementById("fullName").value;
        const school = document.getElementById("school").value;
        const rememberMe = document.getElementById("remember").checked;
        const status = document.getElementById("authStatus");

        // Store remember me preference
        localStorage.setItem("rememberMe", rememberMe);

        if (this.isRegisterMode) {
            try {
                const cred = await this.auth.createUserWithEmailAndPassword(
                    email,
                    password
                );
                await cred.user.sendEmailVerification();

                await this.db.collection("users").doc(cred.user.uid).set({
                    email,
                    name: fullName,
                    school: school,
                    role: "intern",
                    createdAt: new Date(),
                });
                status.textContent =
                    "✅ Verification email sent. Please verify before logging in.";
            } catch (err) {
                status.textContent = "❌ " + err.message;
            }
        } else {
            const userSnapshot = await this.db
                .collection("users")
                .where("email", "==", email)
                .get();
            if (!userSnapshot.empty) {
                const userData = userSnapshot.docs[0].data();
                if (userData.role === "supervisor") {
                    status.textContent =
                        "⚠️ This account is a supervisor. Please use the supervisor login.";
                    return;
                }
            }

            this.auth
                .signInWithEmailAndPassword(email, password)
                .then((cred) => {
                    this.justLoggedIn = true;
                    if (!cred.user.emailVerified) {
                        status.textContent = "⚠️ Please verify your email first.";
                        this.auth.signOut();
                        return;
                    }
                })
                .catch((err) => {
                    status.textContent = "❌ " + err.message;
                })
            ;
        }
    }

    setupAuthStateListener() {
        this.auth.onAuthStateChanged(async (user) => {
            const modal = document.getElementById("authModal");
            const content = document.getElementById("mainContent");
            const sidebar = document.getElementById("sidebar");

            if (!user || !user.emailVerified) {
                modal.style.display = "flex";
                content.style.display = "none";
                return;
            }

            try {
                const userDoc = await this.db.collection("users").doc(user.uid).get();
                if (!userDoc.exists || userDoc.data().role !== "intern") {
                    await this.auth.signOut();
                    modal.style.display = "flex";
                    content.style.display = "none";
                    return;
                }
            } catch (err) {
                console.error("Error getting user doc:", err);
                await this.auth.signOut();
                modal.style.display = "flex";
                content.style.display = "none";
                return;
            }

            document.getElementById("authModal").style.display = "none";
            if (this.justLoggedIn) {
                this.proceedToDashboard();
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
                    this.proceedToDashboard();
                    document.getElementById("sidebar").style.display = "block";
                    document.getElementById("mainContent").style.display = "block";
                    document.getElementById("heading").style.display = "block";
                }
            }

            document.getElementById("loggedInEmail").textContent = user.email;

            this.currentIntern = userDoc.data();

            // Update user profile in sidebar
            document.getElementById("username").textContent =
                this.currentIntern.name || "Intern Name";
            document.getElementById("userEmail").textContent = user.email;

            // Update profile picture - try multiple sources
            const userPic = document.getElementById("userPic");
            let profilePic = "/images/default.webp";

            // Try different possible profile picture sources
            if (this.currentIntern.profilePicture) {
                profilePic = this.currentIntern.profilePicture;
            } else if (this.currentIntern.photoURL) {
                profilePic = this.currentIntern.photoURL;
            } else if (user.photoURL) {
                profilePic = user.photoURL;
            }

            userPic.src = profilePic;
            userPic.onerror = function () {
                this.src = "/images/default.webp";
            };

            // Load intern data with proper error handling
            try {
                await this.loadInternData(this.currentIntern);
            } catch (err) {
                console.error("Failed to load intern data:", err);
                // Show error message to user
                alert("Failed to load dashboard data. Please refresh the page.");
            }

            // Initialize supervisor zone status on page load
            window.supervisorZoneManager.checkSupervisorZoneStatus();

            async function loadInternData(currentIntern) {
                // Set default values for supervisor info since supervisor functionality is removed
                document.getElementById("supervisorName").textContent = "Not available";
                document.getElementById("supervisorCompany").textContent = "Not available";
                document.getElementById("geofenceCoords").textContent = "No data";

                // Set default geofence values
                window.geofenceManager.geofenceCenter = null;
                window.geofenceManager.geofenceRadius = 100;

                // Load tasks for intern's joined rooms
                window.taskManager.loadTasks();

                // Load supervisor's schedule for this intern

                // Load total hours for progress bar (only if a room is selected)
                const container = document.getElementById("roomScheduleContainer");
                const activeRoom = container.dataset.activeRoom;
                if (activeRoom) {
                    window.progressManager.loadTotalHours();
                }
                window.progressManager.loadHoursLeft();
                window.progressManager.refreshBtn();

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

                // Load joined rooms - this will be handled by fetchJoinedRooms() function
                window.roomManager.fetchJoinedRooms();
            }
        });
    }

    proceedToDashboard() {
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

    logoutAndReset() {
        if (confirm("Are you sure you want to logout?")) {
            this.auth
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
}

// Export for use in modules
window.AuthManager = AuthManager;
