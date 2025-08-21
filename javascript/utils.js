// Utility Functions Module

class Utils {
  // Format date to readable string
  static formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Format time to 12-hour format
  static formatTime(timeStr) {
    if (!timeStr) return 'N/A';
    const [hour, minute] = timeStr.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
  }

  // Calculate distance between two coordinates
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Show loading spinner
  static showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = '<div class="flex justify-center items-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    }
  }

  // Hide loading spinner
  static hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = '';
    }
  }

  // Show success message
  static showSuccess(message, elementId = 'status') {
    const element = document.getElementById(elementId);
    if (element) {
      element.className = 'text-green-600 text-sm mt-2';
      element.textContent = message;
      setTimeout(() => {
        element.textContent = '';
      }, 5000);
    }
  }

  // Show error message
  static showError(message, elementId = 'status') {
    const element = document.getElementById(elementId);
    if (element) {
      element.className = 'text-red-600 text-sm mt-2';
      element.textContent = message;
      setTimeout(() => {
        element.textContent = '';
      }, 5000);
    }
  }

  // Validate email format
  static validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  // Validate password strength
  static validatePassword(password) {
    return password.length >= 6;
  }

  // Get current day abbreviation
  static getCurrentDayAbbr() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[new Date().getDay()];
  }

  // Check if current time is within schedule
  static isWithinSchedule(schedule) {
    if (!schedule) return false;
    
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = schedule.endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  // Check if today is an allowed day
  static isAllowedDay(allowedDays) {
    if (!allowedDays || !Array.isArray(allowedDays)) return false;
    
    const dayAbbr = this.getCurrentDayAbbr();
    return allowedDays.includes(dayAbbr);
  }

  // Format file size
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Debounce function
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Throttle function
  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

// Export for global use
window.Utils = Utils;
