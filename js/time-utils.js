// Time and Date Utility Functions
class TimeUtils {
    // Parse time string (HH:MM) to minutes since midnight
    static parseTimeToMinutes(timeStr) {
        if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
            throw new Error('Invalid time format. Expected HH:MM');
        }

        const [hours, minutes] = timeStr.split(':').map(Number);

        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new Error('Invalid time values');
        }

        return hours * 60 + minutes;
    }

    // Convert minutes since midnight to time string (HH:MM)
    static minutesToTimeString(minutes) {
        if (typeof minutes !== 'number' || minutes < 0 || minutes >= 1440) {
            throw new Error('Invalid minutes value');
        }

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    // Calculate hours between two time strings
    static hoursBetween(startTime, endTime) {
        try {
            const startMinutes = this.parseTimeToMinutes(startTime);
            const endMinutes = this.parseTimeToMinutes(endTime);

            let diffMinutes = endMinutes - startMinutes;

            // Handle overnight schedules
            if (diffMinutes < 0) {
                diffMinutes += 1440; // Add 24 hours
            }

            return diffMinutes / 60;
        } catch (error) {
            console.error('Error calculating hours between times:', error);
            return null;
        }
    }

    // Add hours to a time string
    static addHoursToTime(timeStr, hours) {
        try {
            const minutes = this.parseTimeToMinutes(timeStr);
            const totalMinutes = minutes + (hours * 60);
            const wrappedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
            return this.minutesToTimeString(wrappedMinutes);
        } catch (error) {
            console.error('Error adding hours to time:', error);
            return null;
        }
    }

    // Format time to 12-hour format with AM/PM
    static formatTimeToAMPM(timeStr) {
        if (!timeStr) return '';

        try {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const hour12 = hours % 12 === 0 ? 12 : hours % 12;
            return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
        } catch (error) {
            console.error('Error formatting time:', error);
            return timeStr;
        }
    }

    // Format date to readable string
    static formatDate(dateStr, options = {}) {
        if (!dateStr) return '';

        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;

            const defaultOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                ...options
            };

            return date.toLocaleDateString('en-US', defaultOptions);
        } catch (error) {
            console.error('Error formatting date:', error);
            return dateStr;
        }
    }

    // Get current date in YYYY-MM-DD format
    static getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }

    // Get current day abbreviation
    static getCurrentDayAbbr() {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[new Date().getDay()];
    }

    // Check if a date is today
    static isToday(dateStr) {
        const today = this.getCurrentDate();
        return dateStr === today;
    }

    // Check if a date is in the past
    static isPastDate(dateStr) {
        const today = this.getCurrentDate();
        return dateStr < today;
    }

    // Check if a date is in the future
    static isFutureDate(dateStr) {
        const today = this.getCurrentDate();
        return dateStr > today;
    }

    // Calculate end date based on start date, total hours, and daily hours
    static calculateEndDate(startDate, totalHours, dailyHours, allowedDays) {
        if (!startDate || !totalHours || !dailyHours || !allowedDays || allowedDays.length === 0) {
            throw new Error('Invalid parameters for end date calculation');
        }

        let remainingHours = totalHours;
        let currentDate = new Date(startDate + 'T00:00:00');

        // Precompute allowed JS weekday indices
        const allowedWD = new Set(allowedDays.map(day => DAY_CONSTANTS.KEY_TO_JSWD[day]));

        // Loop with guard to avoid infinite loop
        const GUARD_DAYS = 366 * 5;
        let steps = 0;

        while (remainingHours > 0 && steps < GUARD_DAYS) {
            const weekday = currentDate.getDay();
            if (allowedWD.has(weekday)) {
                const dayHours = Math.min(dailyHours, remainingHours);
                remainingHours -= dayHours;
            }
            currentDate.setDate(currentDate.getDate() + 1);
            steps++;
        }

        if (steps >= GUARD_DAYS) {
            throw new Error('Calculation exceeded maximum days. Check parameters.');
        }

        return currentDate.toISOString().split('T')[0];
    }

    // Generate daily time slots for a schedule
    static generateDailyTimes(startDate, endDate, dailyStartTime, dailyEndTime, allowedDays) {
        const dailyTimes = [];
        let currentDate = new Date(startDate + 'T00:00:00');

        while (currentDate.toISOString().split('T')[0] <= endDate) {
            const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

            if (allowedDays.includes(dayName)) {
                const dateStr = `${currentDate.getMonth() + 1}-${currentDate.getDate()}-${currentDate.getFullYear()}`;
                dailyTimes.push({
                    date: dateStr,
                    day: dayName,
                    start: dailyStartTime,
                    end: dailyEndTime
                });
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dailyTimes;
    }

    // Validate time range
    static validateTimeRange(startTime, endTime) {
        const hours = this.hoursBetween(startTime, endTime);
        return hours !== null && hours > 0;
    }

    // Check if two time ranges overlap
    static timeRangesOverlap(start1, end1, start2, end2) {
        const start1Min = this.parseTimeToMinutes(start1);
        const end1Min = this.parseTimeToMinutes(end1);
        const start2Min = this.parseTimeToMinutes(start2);
        const end2Min = this.parseTimeToMinutes(end2);

        // Handle overnight ranges
        const normalizeTime = (time) => time < start1Min ? time + 1440 : time;

        const normStart2 = normalizeTime(start2Min);
        const normEnd2 = normalizeTime(end2Min);

        return !(end1Min <= start2Min || start1Min >= end2Min) ||
               !(end1Min <= normStart2 || start1Min >= normEnd2);
    }

    // Get time slots for a day
    static getTimeSlots() {
        return {
            morning: { start: '09:00', end: '12:00' },
            afternoon: { start: '13:00', end: '17:00' },
            evening: { start: '18:00', end: '21:00' }
        };
    }

    // Calculate total hours from time slots
    static calculateTotalHoursFromSlots(slots) {
        let totalHours = 0;

        Object.values(slots).forEach(slot => {
            if (slot.start && slot.end) {
                totalHours += this.hoursBetween(slot.start, slot.end) || 0;
            }
        });

        return totalHours;
    }

    // Convert time to minutes since midnight
    static timeToMinutes(timeStr) {
        if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
            throw new Error('Invalid time format. Expected HH:MM');
        }

        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Validate email format
    static validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }

    // Validate password strength
    static validatePassword(password) {
        return password && password.length >= 6;
    }

    // Validate schedule parameters
    static validateScheduleParams(params) {
        const errors = [];

        if (!params.startDate) {
            errors.push('Start date is required');
        } else if (this.isPastDate(params.startDate)) {
            errors.push('Start date cannot be in the past');
        }

        if (!params.totalHours || params.totalHours <= 0) {
            errors.push('Total hours must be greater than 0');
        }

        if (!params.allowedDays || params.allowedDays.length === 0) {
            errors.push('At least one day must be selected');
        }

        if (params.timeMode === 'hoursPerDay') {
            if (!params.startTime) {
                errors.push('Start time is required for hours per day mode');
            }
            if (!params.hoursPerDay || params.hoursPerDay <= 0) {
                errors.push('Hours per day must be greater than 0');
            }
        } else if (params.timeMode === 'endTime') {
            if (!params.startTime || !params.endTime) {
                errors.push('Start and end times are required');
            } else if (!this.validateTimeRange(params.startTime, params.endTime)) {
                errors.push('End time must be after start time');
            }
        }

        return errors;
    }
}

// Export for use in other modules
window.TimeUtils = TimeUtils;
