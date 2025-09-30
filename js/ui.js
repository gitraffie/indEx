// UI Module for Intern Dashboard
class UIManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mobile menu toggle
        const mobileMenuButton = document.getElementById("mobile-menu-button");
        const overlay = document.getElementById("overlay");
        const menuIcon = document.getElementById("menu-icon");

        if (mobileMenuButton) {
            mobileMenuButton.addEventListener("click", () => this.toggleSidebar());
        }

        if (overlay) {
            overlay.addEventListener("click", () => this.toggleSidebar());
        }

        // Close sidebar when clicking outside on mobile
        window.addEventListener("resize", () => {
            const sidebar = document.getElementById("sidebar");
            if (window.innerWidth >= 1024) {
                sidebar.classList.remove("-translate-x-full");
                overlay.classList.add("hidden");
            }
        });

        // Add comment button event listener
        const addCommentBtn = document.getElementById("addCommentBtn");
        if (addCommentBtn) {
            addCommentBtn.addEventListener("click", () => {
                const taskId = document.getElementById("taskModal").dataset.taskId;
                window.taskManager.addComment(taskId);
            });
        }

        // Close popovers when clicking outside
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.kebab-menu')) {
                const allPopovers = document.querySelectorAll('.popover');
                allPopovers.forEach(popover => {
                    popover.classList.remove('show');
                });
            }
        });
    }

    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        const mobileMenuButton = document.getElementById("mobile-menu-button");
        const menuIcon = document.getElementById("menu-icon");

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

    showResultMessage(message, type) {
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

    toggleMapModal() {
        const modal = document.getElementById('mapModal');
        if (!modal) return;

        const isShowing = modal.style.display === 'flex';
        modal.style.display = isShowing ? 'none' : 'flex';

        if (!isShowing) {
            // Initialize map for modal
            setTimeout(() => {
                if (!window.modalMap || typeof window.modalMap.setView !== 'function') {
                    window.modalMap = L.map('modalMap').setView(window.geofenceManager.geofenceCenter || [10.7502, 121.9324], 15);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                    }).addTo(window.modalMap);

                    if (window.geofenceManager.geofenceCenter && window.geofenceManager.geofenceRadius) {
                        if (window.modalGeofenceCircle) {
                            window.modalMap.removeLayer(window.modalGeofenceCircle);
                        }
                        window.modalGeofenceCircle = L.circle(window.geofenceManager.geofenceCenter, {
                            radius: window.geofenceManager.geofenceRadius,
                            color: 'red',
                            fillColor: '#f03',
                            fillOpacity: 0.3,
                        }).addTo(window.modalMap);
                        window.modalMap.fitBounds(window.modalGeofenceCircle.getBounds());
                    }
                } else {
                    window.modalMap.setView(window.geofenceManager.geofenceCenter || [10.7502, 121.9324], 15);
                    if (window.modalGeofenceCircle) {
                        window.modalMap.removeLayer(window.modalGeofenceCircle);
                    }
                    if (window.geofenceManager.geofenceCenter && window.geofenceManager.geofenceRadius) {
                        window.modalGeofenceCircle = L.circle(window.geofenceManager.geofenceCenter, {
                            radius: window.geofenceManager.geofenceRadius,
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

    openJoinRoomModal() {
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

    closeJoinRoomModal() {
        const modal = document.getElementById("joinRoomModal");
        const content = modal.querySelector('.modal-content');
        content.classList.remove('fade-in');
        content.classList.add('fade-out');
        content.addEventListener('transitionend', () => {
            modal.style.display = "none";
        }, { once: true });
    }

    toggleJoinRoomButton() {
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

    backToRooms() {
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
        this.toggleJoinRoomButton();
    }
}

// Create global UI manager instance
window.uiManager = new UIManager();

// Export for use in modules
window.UIManager = UIManager;
