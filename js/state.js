// Centralized State Management Module
class AppState {
    constructor() {
        this._state = {
            // Authentication
            currentUser: null,
            isAuthenticated: false,
            userRole: null, // 'coordinator' | 'intern' | 'supervisor'

            // Room Management
            selectedRoomCode: null,
            currentRoom: null,
            rooms: [],

            // Intern Management
            interns: [],
            internsPresence: new Map(),

            // Scheduling
            schedules: [],
            selectedScheduleIndex: null,
            currentDailyPage: 1,
            dailyRowsPerPage: CONFIG.DAILY_ROWS_PER_PAGE,

            // UI State
            loading: new Set(),
            errors: new Map(),
            toasts: [],

            // Modal States
            activeModals: new Set(),

            // Form States
            scheduleForm: {
                type: 'unified',
                startDate: null,
                endDate: null,
                totalHours: 0,
                timeMode: 'hoursPerDay',
                hoursPerDay: 8,
                allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
                timeSlots: {
                    morning: { start: '09:00', end: '12:00' },
                    afternoon: { start: '13:00', end: '17:00' },
                    evening: { start: '18:00', end: '21:00' }
                }
            },

            // Edit States
            editingIntern: null,
            editingSchedule: null,

            // Real-time listeners
            activeListeners: new Map(),
        };

        this._listeners = new Set();
    }

    // Get state value
    get(key) {
        return this._state[key];
    }

    // Set state value and notify listeners
    set(key, value) {
        this._state[key] = value;
        this._notifyListeners();
    }

    // Update nested state
    update(key, updater) {
        const currentValue = this._state[key];
        this._state[key] = updater(currentValue);
        this._notifyListeners();
    }

    // Subscribe to state changes
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    // Notify all listeners
    _notifyListeners() {
        this._listeners.forEach(listener => {
            try {
                listener(this._state);
            } catch (error) {
                console.error('State listener error:', error);
            }
        });
    }

    // Batch state updates
    batch(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this._state[key] = value;
        });
        this._notifyListeners();
    }

    // Reset state
    reset() {
        this._state = new AppState()._state;
        this._notifyListeners();
    }

    // Get computed values
    get computed() {
        return {
            isCoordinator: this._state.userRole === 'coordinator',
            isIntern: this._state.userRole === 'intern',
            isSupervisor: this._state.userRole === 'supervisor',
            hasSelectedRoom: !!this._state.selectedRoomCode,
            totalSchedules: this._state.schedules.length,
            totalInterns: this._state.interns.length,
            activeInterns: Array.from(this._state.internsPresence.values()).filter(p => p.status === 'inside').length,
        };
    }

    // Loading state management
    setLoading(operation, isLoading) {
        if (isLoading) {
            this._state.loading.add(operation);
        } else {
            this._state.loading.delete(operation);
        }
        this._notifyListeners();
    }

    isLoading(operation) {
        return this._state.loading.has(operation);
    }

    // Error state management
    setError(key, message) {
        this._state.errors.set(key, message);
        this._notifyListeners();
    }

    clearError(key) {
        this._state.errors.delete(key);
        this._notifyListeners();
    }

    getError(key) {
        return this._state.errors.get(key);
    }

    // Toast management
    addToast(toast) {
        const id = Date.now() + Math.random();
        this._state.toasts.push({ id, ...toast });
        this._notifyListeners();

        // Auto-remove after duration
        setTimeout(() => {
            this.removeToast(id);
        }, toast.duration || CONFIG.TOAST_DURATION);
    }

    removeToast(id) {
        this._state.toasts = this._state.toasts.filter(t => t.id !== id);
        this._notifyListeners();
    }

    // Modal management
    openModal(modalId) {
        this._state.activeModals.add(modalId);
        this._notifyListeners();
    }

    closeModal(modalId) {
        this._state.activeModals.delete(modalId);
        this._notifyListeners();
    }

    isModalOpen(modalId) {
        return this._state.activeModals.has(modalId);
    }

    // Listener management for real-time updates
    addListener(key, unsubscribe) {
        this._state.activeListeners.set(key, unsubscribe);
    }

    removeListener(key) {
        const unsubscribe = this._state.activeListeners.get(key);
        if (unsubscribe) {
            unsubscribe();
            this._state.activeListeners.delete(key);
        }
    }

    removeAllListeners() {
        this._state.activeListeners.forEach((unsubscribe, key) => {
            try {
                unsubscribe();
            } catch (error) {
                console.error(`Error removing listener ${key}:`, error);
            }
        });
        this._state.activeListeners.clear();
    }
}

// Create global state instance
window.appState = new AppState();

// Export for use in modules
window.AppState = AppState;
