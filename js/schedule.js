// Schedule Management Module
class ScheduleManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.errorHandler = window.errorHandler;
        this.toastManager = window.toastManager;
        this.init();
    }

    init() {
        // Set up real-time listeners for schedules
        this.setupScheduleListeners();
    }

    setupScheduleListeners() {
        const selectedRoom = window.appState.get('selectedRoomCode');
        if (!selectedRoom) return;

        // Listen for schedule changes
        const unsubscribe = this.db.collection('schedules')
            .where('roomCode', '==', selectedRoom)
            .orderBy('createdAt', 'desc')
            .onSnapshot((snapshot) => {
                this.handleSchedulesUpdate(snapshot);
            }, (error) => {
                console.error('Error listening to schedules:', error);
                this.errorHandler.handleFirebaseError(error);
            });

        window.appState.addListener('schedules', unsubscribe);
    }

    handleSchedulesUpdate(snapshot) {
        const schedules = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        window.appState.set('schedules', schedules);
        this.renderScheduleList(schedules);
    }

    async createSchedule(scheduleData) {
        try {
            this.errorHandler.setLoading('create-schedule', true);

            // Validate schedule data
            const validationErrors = TimeUtils.validateScheduleParams(scheduleData);
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join(', '));
            }

            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('User not authenticated');
            }

            const selectedRoom = window.appState.get('selectedRoomCode');
            if (!selectedRoom) {
                throw new Error('No room selected');
            }

            // Calculate end date and daily times
            const endDate = TimeUtils.calculateEndDate(
                scheduleData.startDate,
                scheduleData.totalHours,
                scheduleData.dailyHours,
                scheduleData.allowedDays
            );

            const dailyTimes = TimeUtils.generateDailyTimes(
                scheduleData.startDate,
                endDate,
                scheduleData.dailyStartTime,
                scheduleData.dailyEndTime,
                scheduleData.allowedDays
            );

            // Prepare schedule document
            const scheduleDoc = {
                startDate: scheduleData.startDate,
                endDate,
                totalHours: scheduleData.totalHours,
                dailyHours: scheduleData.dailyHours,
                allowedDays: scheduleData.allowedDays,
                dailyTimes,
                timeMode: scheduleData.timeMode,
                startTime: scheduleData.dailyStartTime,
                endTime: scheduleData.dailyEndTime,
                hpd: scheduleData.timeMode === 'hoursPerDay' ? scheduleData.dailyHours : null,
                roomCode: selectedRoom,
                coordinatorEmail: user.email,
                createdAt: new Date(),
                status: 'active'
            };

            // Save schedule
            const docRef = await this.db.collection('schedules').add(scheduleDoc);

            // Create intern schedules for all interns in the room
            await this.createInternSchedules(docRef.id, scheduleDoc);

            this.toastManager.success('Schedule created successfully!');

            return { id: docRef.id, ...scheduleDoc };

        } catch (error) {
            console.error('Error creating schedule:', error);
            this.errorHandler.handleError(error, 'creating schedule');
            throw error;
        } finally {
            this.errorHandler.setLoading('create-schedule', false);
        }
    }

    async createInternSchedules(scheduleId, scheduleData) {
        try {
            const roomInterns = window.appState.get('interns');

            if (roomInterns.length === 0) {
                return;
            }

            // Batch create intern schedules
            const batch = this.db.batch();
            const internSchedules = [];

            roomInterns.forEach(intern => {
                const internScheduleRef = this.db.collection('intern_data').doc();
                const internSchedule = {
                    intern_email: intern.email,
                    room_code: scheduleData.roomCode,
                    schedule_id: scheduleId,
                    totalHours: scheduleData.totalHours,
                    schedule: {
                        startDate: scheduleData.startDate,
                        endDate: scheduleData.endDate,
                        timeMode: scheduleData.timeMode,
                        startTime: scheduleData.startTime,
                        endTime: scheduleData.endTime,
                        hpd: scheduleData.hpd,
                        allowedDays: scheduleData.allowedDays,
                        dailyTimes: scheduleData.dailyTimes
                    },
                    createdAt: new Date()
                };

                batch.set(internScheduleRef, internSchedule);
                internSchedules.push({ id: internScheduleRef.id, ...internSchedule });
            });

            await batch.commit();

            // Update interns with schedule information
            window.appState.update('interns', interns =>
                interns.map(intern => ({
                    ...intern,
                    currentSchedule: scheduleData
                }))
            );

        } catch (error) {
            console.error('Error creating intern schedules:', error);
            this.errorHandler.handleError(error, 'creating intern schedules');
            throw error;
        }
    }

    async updateSchedule(scheduleId, updates) {
        try {
            this.errorHandler.setLoading('update-schedule', true);

            // Validate updates
            if (updates.totalHours || updates.dailyHours || updates.allowedDays) {
                const validationErrors = TimeUtils.validateScheduleParams({
                    ...updates,
                    startDate: updates.startDate || this.getCurrentSchedule()?.startDate,
                    totalHours: updates.totalHours || this.getCurrentSchedule()?.totalHours,
                    dailyHours: updates.dailyHours || this.getCurrentSchedule()?.dailyHours,
                    allowedDays: updates.allowedDays || this.getCurrentSchedule()?.allowedDays
                });

                if (validationErrors.length > 0) {
                    throw new Error(validationErrors.join(', '));
                }
            }

            // Update schedule
            await this.db.collection('schedules').doc(scheduleId).update({
                ...updates,
                updatedAt: new Date()
            });

            // Update related intern schedules
            await this.updateInternSchedules(scheduleId, updates);

            this.toastManager.success('Schedule updated successfully!');

        } catch (error) {
            console.error('Error updating schedule:', error);
            this.errorHandler.handleError(error, 'updating schedule');
            throw error;
        } finally {
            this.errorHandler.setLoading('update-schedule', false);
        }
    }

    async updateInternSchedules(scheduleId, updates) {
        try {
            // Find all intern schedules for this schedule
            const internSchedulesSnapshot = await this.db.collection('intern_data')
                .where('schedule_id', '==', scheduleId)
                .get();

            if (internSchedulesSnapshot.empty) {
                return;
            }

            // Batch update intern schedules
            const batch = this.db.batch();

            internSchedulesSnapshot.docs.forEach(doc => {
                const currentData = doc.data();
                batch.update(doc.ref, {
                    ...updates,
                    updatedAt: new Date()
                });
            });

            await batch.commit();

        } catch (error) {
            console.error('Error updating intern schedules:', error);
            this.errorHandler.handleError(error, 'updating intern schedules');
            throw error;
        }
    }

    async deleteSchedule(scheduleId) {
        try {
            this.errorHandler.setLoading('delete-schedule', true);

            // Delete schedule
            await this.db.collection('schedules').doc(scheduleId).delete();

            // Delete related intern schedules
            await this.deleteInternSchedules(scheduleId);

            this.toastManager.success('Schedule deleted successfully!');

        } catch (error) {
            console.error('Error deleting schedule:', error);
            this.errorHandler.handleError(error, 'deleting schedule');
            throw error;
        } finally {
            this.errorHandler.setLoading('delete-schedule', false);
        }
    }

    async deleteInternSchedules(scheduleId) {
        try {
            const internSchedulesSnapshot = await this.db.collection('intern_data')
                .where('schedule_id', '==', scheduleId)
                .get();

            if (internSchedulesSnapshot.empty) {
                return;
            }

            const batch = this.db.batch();
            internSchedulesSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();

        } catch (error) {
            console.error('Error deleting intern schedules:', error);
            this.errorHandler.handleError(error, 'deleting intern schedules');
            throw error;
        }
    }

    async loadSchedules(roomCode) {
        try {
            this.errorHandler.setLoading('load-schedules', true);

            const snapshot = await this.db.collection('schedules')
                .where('roomCode', '==', roomCode)
                .orderBy('createdAt', 'desc')
                .get();

            const schedules = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            window.appState.set('schedules', schedules);

            return schedules;

        } catch (error) {
            console.error('Error loading schedules:', error);
            this.errorHandler.handleError(error, 'loading schedules');
            throw error;
        } finally {
            this.errorHandler.setLoading('load-schedules', false);
        }
    }

    getCurrentSchedule() {
        const schedules = window.appState.get('schedules');
        const selectedIndex = window.appState.get('selectedScheduleIndex');
        return schedules[selectedIndex] || null;
    }

    async getScheduleDailyTimes(scheduleId, page = 1, limit = CONFIG.DAILY_ROWS_PER_PAGE) {
        try {
            const schedule = await this.db.collection('schedules').doc(scheduleId).get();

            if (!schedule.exists) {
                throw new Error('Schedule not found');
            }

            const scheduleData = schedule.data();
            const dailyTimes = scheduleData.dailyTimes || [];

            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const pageDailyTimes = dailyTimes.slice(startIndex, endIndex);

            return {
                dailyTimes: pageDailyTimes,
                totalPages: Math.ceil(dailyTimes.length / limit),
                currentPage: page,
                totalItems: dailyTimes.length
            };

        } catch (error) {
            console.error('Error getting schedule daily times:', error);
            this.errorHandler.handleError(error, 'getting schedule daily times');
            throw error;
        }
    }

    async checkScheduleConflicts(scheduleData) {
        try {
            const conflicts = [];

            // Check for overlapping schedules in the same room
            const existingSchedules = await this.db.collection('schedules')
                .where('roomCode', '==', scheduleData.roomCode)
                .where('status', '==', 'active')
                .get();

            existingSchedules.docs.forEach(doc => {
                const existing = doc.data();

                // Check for date overlap
                if (this.datesOverlap(scheduleData.startDate, scheduleData.endDate, existing.startDate, existing.endDate)) {
                    // Check for time overlap on same days
                    const overlappingDays = scheduleData.allowedDays.filter(day =>
                        existing.allowedDays.includes(day)
                    );

                    if (overlappingDays.length > 0) {
                        conflicts.push({
                            scheduleId: doc.id,
                            scheduleName: existing.name || `Schedule ${doc.id}`,
                            overlappingDays,
                            message: `Overlaps with existing schedule on ${overlappingDays.join(', ')}`
                        });
                    }
                }
            });

            return conflicts;

        } catch (error) {
            console.error('Error checking schedule conflicts:', error);
            this.errorHandler.handleError(error, 'checking schedule conflicts');
            return [];
        }
    }

    datesOverlap(start1, end1, start2, end2) {
        return start1 <= end2 && start2 <= end1;
    }

    renderScheduleList(schedules) {
        const container = document.getElementById('scheduleCardsContainer');
        if (!container) return;

        if (schedules.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 col-span-full">No schedules found for this room.</p>';
            return;
        }

        const html = schedules.map((schedule, index) => `
            <div class="mb-6 p-4 border rounded-lg bg-gray-50">
                <div class="flex gap-2 mb-2">
                    <div class="bg-white rounded-lg shadow p-4 flex-1">
                        <span class="font-semibold">Start Date:</span> ${TimeUtils.formatDate(schedule.startDate)}
                    </div>
                    <div class="bg-white rounded-lg shadow p-4 flex-1">
                        <span class="font-semibold">End Date:</span> ${TimeUtils.formatDate(schedule.endDate)}
                    </div>
                </div>
                <div class="flex gap-2 mb-2">
                    <div class="bg-white rounded-lg shadow p-4 flex-1">
                        <span class="font-semibold">Total Hours:</span> ${schedule.totalHours}
                    </div>
                    <div class="bg-white rounded-lg shadow p-4 flex-1">
                        <span class="font-semibold">Allowed Days:</span> ${schedule.allowedDays.join(', ')}
                    </div>
                </div>
                <div class="rounded-lg text-center mt-3">
                    <button onclick="scheduleManager.viewScheduleDetails(${index})"
                        class="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600">
                        View Daily Times
                    </button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    async viewScheduleDetails(scheduleIndex) {
        try {
            const schedules = window.appState.get('schedules');
            const schedule = schedules[scheduleIndex];

            if (!schedule) {
                throw new Error('Schedule not found');
            }

            window.appState.set('selectedScheduleIndex', scheduleIndex);
            window.appState.set('currentDailyPage', 1);

            // Show daily times section
            const dailyTimesSection = document.getElementById('dailyTimesSection');
            if (dailyTimesSection) {
                dailyTimesSection.classList.remove('hidden');
            }

            await this.renderDailyTimesPage();

        } catch (error) {
            console.error('Error viewing schedule details:', error);
            this.errorHandler.handleError(error, 'viewing schedule details');
        }
    }

    async renderDailyTimesPage() {
        try {
            const selectedIndex = window.appState.get('selectedScheduleIndex');
            const currentPage = window.appState.get('currentDailyPage');
            const schedules = window.appState.get('schedules');

            if (selectedIndex === null || !schedules[selectedIndex]) {
                document.getElementById('dailyTimesTableBody').innerHTML =
                    '<tr><td colspan="4" class="text-center text-gray-500">No schedule selected.</td></tr>';
                return;
            }

            const schedule = schedules[selectedIndex];
            const dailyTimes = schedule.dailyTimes || [];

            const startIndex = (currentPage - 1) * CONFIG.DAILY_ROWS_PER_PAGE;
            const endIndex = startIndex + CONFIG.DAILY_ROWS_PER_PAGE;
            const pageDailyTimes = dailyTimes.slice(startIndex, endIndex);

            const tbody = document.getElementById('dailyTimesTableBody');
            let html = '';

            pageDailyTimes.forEach(daily => {
                html += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="text-center p-3">${TimeUtils.formatDate(daily.date)}</td>
                        <td class="text-center p-3">${DAY_CONSTANTS.LABELS[daily.day] || daily.day}</td>
                        <td class="text-center p-3">${TimeUtils.formatTimeToAMPM(daily.start)}</td>
                        <td class="text-center p-3">${TimeUtils.formatTimeToAMPM(daily.end)}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;

            // Update pagination
            this.updatePagination(dailyTimes.length, currentPage);

        } catch (error) {
            console.error('Error rendering daily times page:', error);
            this.errorHandler.handleError(error, 'rendering daily times');
        }
    }

    updatePagination(totalItems, currentPage) {
        const totalPages = Math.ceil(totalItems / CONFIG.DAILY_ROWS_PER_PAGE);

        const prevBtn = document.getElementById('prevDailyPageBtn');
        const nextBtn = document.getElementById('nextDailyPageBtn');
        const pageInfo = document.getElementById('dailyPageInfo');

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;
        if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    async changePage(direction) {
        const currentPage = window.appState.get('currentDailyPage');
        const schedules = window.appState.get('schedules');
        const selectedIndex = window.appState.get('selectedScheduleIndex');

        if (!schedules[selectedIndex]) return;

        const dailyTimes = schedules[selectedIndex].dailyTimes || [];
        const totalPages = Math.ceil(dailyTimes.length / CONFIG.DAILY_ROWS_PER_PAGE);

        let newPage = currentPage + direction;
        newPage = Math.max(1, Math.min(totalPages, newPage));

        window.appState.set('currentDailyPage', newPage);
        await this.renderDailyTimesPage();
    }

    async computeAndReviewSchedule() {
        try {
            this.errorHandler.setLoading('compute-schedule', true);

            // Get form data
            const formData = this.getScheduleFormData();

            // Validate form data
            const validationErrors = TimeUtils.validateScheduleParams(formData);
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join(', '));
            }

            // Calculate schedule details
            const endDate = TimeUtils.calculateEndDate(
                formData.startDate,
                formData.totalHours,
                formData.dailyHours,
                formData.allowedDays
            );

            const dailyTimes = TimeUtils.generateDailyTimes(
                formData.startDate,
                endDate,
                formData.dailyStartTime,
                formData.dailyEndTime,
                formData.allowedDays
            );

            // Check for conflicts
            const conflicts = await this.checkScheduleConflicts({
                ...formData,
                endDate,
                roomCode: window.appState.get('selectedRoomCode')
            });

            // Store computed data in state
            window.appState.set('computedSchedule', {
                ...formData,
                endDate,
                dailyTimes,
                conflicts,
                totalDays: dailyTimes.length
            });

            // Show review modal
            if (window.uiManager) {
                window.uiManager.hideModal('scheduleInputModal');
                window.uiManager.showModal('scheduleReviewModal');
            }

            // Render review
            this.renderScheduleReview();

        } catch (error) {
            console.error('Error computing schedule:', error);
            this.errorHandler.handleError(error, 'computing schedule');
        } finally {
            this.errorHandler.setLoading('compute-schedule', false);
        }
    }

    getScheduleFormData() {
        const form = document.getElementById('scheduleForm');
        if (!form) {
            throw new Error('Schedule form not found');
        }

        return {
            type: form.querySelector('[name="scheduleType"]:checked')?.value || 'unified',
            startDate: new Date(form.querySelector('#startDate').value),
            totalHours: parseFloat(form.querySelector('#totalHours').value) || 0,
            timeMode: form.querySelector('[name="timeMode"]:checked')?.value || 'hoursPerDay',
            dailyHours: parseFloat(form.querySelector('#dailyHours').value) || 8,
            dailyStartTime: form.querySelector('#dailyStartTime').value || '09:00',
            dailyEndTime: form.querySelector('#dailyEndTime').value || '17:00',
            allowedDays: Array.from(form.querySelectorAll('#allowedDays input:checked')).map(cb => cb.value)
        };
    }

    renderScheduleReview() {
        const computedSchedule = window.appState.get('computedSchedule');
        if (!computedSchedule) return;

        // Update review content
        const reviewContent = document.getElementById('scheduleReviewContent');
        if (reviewContent) {
            reviewContent.innerHTML = `
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 p-3 rounded">
                            <strong>Start Date:</strong> ${TimeUtils.formatDate(computedSchedule.startDate)}
                        </div>
                        <div class="bg-gray-50 p-3 rounded">
                            <strong>End Date:</strong> ${TimeUtils.formatDate(computedSchedule.endDate)}
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 p-3 rounded">
                            <strong>Total Hours:</strong> ${computedSchedule.totalHours}
                        </div>
                        <div class="bg-gray-50 p-3 rounded">
                            <strong>Daily Hours:</strong> ${computedSchedule.dailyHours}
                        </div>
                    </div>
                    <div class="bg-gray-50 p-3 rounded">
                        <strong>Allowed Days:</strong> ${computedSchedule.allowedDays.join(', ')}
                    </div>
                    <div class="bg-gray-50 p-3 rounded">
                        <strong>Time Range:</strong> ${TimeUtils.formatTimeToAMPM(computedSchedule.dailyStartTime)} - ${TimeUtils.formatTimeToAMPM(computedSchedule.dailyEndTime)}
                    </div>
                    <div class="bg-gray-50 p-3 rounded">
                        <strong>Total Days:</strong> ${computedSchedule.totalDays}
                    </div>
                    ${computedSchedule.conflicts.length > 0 ? `
                        <div class="bg-red-50 p-3 rounded border border-red-200">
                            <strong class="text-red-800">⚠️ Conflicts Found:</strong>
                            <ul class="mt-2 list-disc list-inside text-red-700">
                                ${computedSchedule.conflicts.map(conflict => `<li>${conflict.message}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }

    async saveSchedule() {
        try {
            this.errorHandler.setLoading('save-schedule', true);

            const computedSchedule = window.appState.get('computedSchedule');
            if (!computedSchedule) {
                throw new Error('No schedule to save. Please compute schedule first.');
            }

            // Check for conflicts again before saving
            if (computedSchedule.conflicts.length > 0) {
                const proceed = confirm('This schedule has conflicts. Do you want to save it anyway?');
                if (!proceed) {
                    return;
                }
            }

            // Create the schedule
            await this.createSchedule(computedSchedule);

            // Close review modal
            if (window.uiManager) {
                window.uiManager.hideModal('scheduleReviewModal');
            }

            // Clear computed schedule
            window.appState.set('computedSchedule', null);

            // Refresh schedules list
            const selectedRoom = window.appState.get('selectedRoomCode');
            if (selectedRoom) {
                await this.loadSchedules(selectedRoom);
            }

        } catch (error) {
            console.error('Error saving schedule:', error);
            this.errorHandler.handleError(error, 'saving schedule');
        } finally {
            this.errorHandler.setLoading('save-schedule', false);
        }
    }
}

// Create global schedule manager instance
window.scheduleManager = new ScheduleManager();

// Export for use in modules
window.ScheduleManager = ScheduleManager;
