// Toast Notification System
class ToastManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Create toast container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'fixed top-4 right-4 z-50 space-y-2';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const toast = this.createToast(message, type, duration);
        this.container.appendChild(toast);

        // Add to app state
        window.appState.addToast({
            message,
            type,
            duration
        });

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        return toast;
    }

    createToast(message, type, duration) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} transform translate-x-full opacity-0 transition-all duration-300 ease-in-out`;

        const icon = this.getIcon(type);
        const bgColor = this.getBgColor(type);

        toast.innerHTML = `
            <div class="flex items-center p-4 rounded-lg shadow-lg ${bgColor} text-white">
                <span class="mr-3">${icon}</span>
                <span class="flex-1">${message}</span>
                <button class="ml-3 hover:opacity-75" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                </button>
            </div>
        `;

        // Auto remove after duration
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);

        return toast;
    }

    removeToast(toast) {
        toast.classList.remove('show');
        toast.classList.add('hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    getBgColor(type) {
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };
        return colors[type] || colors.info;
    }

    // Convenience methods
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// Error Handler Class
class ErrorHandler {
    constructor() {
        this.toastManager = new ToastManager();
    }

    // Handle Firebase errors
    handleFirebaseError(error) {
        console.error('Firebase Error:', error);

        const errorMessages = {
            'auth/user-not-found': 'User not found. Please check your email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/weak-password': 'Password should be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/network-request-failed': 'Network error. Please check your connection.',
            'permission-denied': 'You do not have permission to perform this action.',
            'not-found': 'The requested document was not found.',
            'already-exists': 'This item already exists.',
            'failed-precondition': 'Operation failed due to current state.',
            'aborted': 'Operation was aborted.',
            'out-of-range': 'Value is out of acceptable range.',
            'unimplemented': 'This feature is not yet implemented.',
            'internal': 'Internal server error. Please try again.',
            'unavailable': 'Service is temporarily unavailable.',
            'data-loss': 'Data loss occurred during operation.',
            'unauthenticated': 'Please log in to continue.'
        };

        const message = errorMessages[error.code] || error.message || 'An unexpected error occurred.';
        this.toastManager.error(message);
        return message;
    }

    // Handle validation errors
    handleValidationError(field, message) {
        console.error(`Validation Error - ${field}:`, message);

        // Update state with field error
        window.appState.setError(field, message);

        // Show toast
        this.toastManager.error(`${field}: ${message}`);

        return message;
    }

    // Handle network errors
    handleNetworkError(error) {
        console.error('Network Error:', error);

        let message = 'Network connection error. Please check your internet connection.';

        if (error.name === 'TimeoutError') {
            message = 'Request timed out. Please try again.';
        } else if (error.message) {
            message = error.message;
        }

        this.toastManager.error(message);
        return message;
    }

    // Handle generic errors
    handleError(error, context = '') {
        console.error(`Error${context ? ` in ${context}` : ''}:`, error);

        let message = 'An unexpected error occurred.';

        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        }

        this.toastManager.error(message);
        return message;
    }

    // Clear specific error
    clearError(field) {
        window.appState.clearError(field);
    }

    // Clear all errors
    clearAllErrors() {
        window.appState.update('errors', new Map());
    }

    // Show loading state
    setLoading(operation, isLoading) {
        window.appState.setLoading(operation, isLoading);
    }

    // Check if operation is loading
    isLoading(operation) {
        return window.appState.isLoading(operation);
    }
}

// Create global instances
window.toastManager = new ToastManager();
window.errorHandler = new ErrorHandler();

// Export for use in modules
window.ToastManager = ToastManager;
window.ErrorHandler = ErrorHandler;
