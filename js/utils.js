// Utils Module for Intern Dashboard
class Utils {
    constructor() {
        // Initialization if needed
    }

    to12Hour(time24) {
        if (!time24) return "";
        const [hour, minute] = time24.split(":");
        const hour12 = hour % 12 || 12;
        const ampm = hour < 12 ? "AM" : "PM";
        return `${hour12}:${minute} ${ampm}`;
    }

    saveInternData() {
        // This function is now handled in RoomManager.saveInternData()
        console.warn("saveInternData is deprecated. Use RoomManager.saveInternData() instead.");
    }
}

// Create global utils instance
window.utils = new Utils();

// Export for use in modules
window.Utils = Utils;
