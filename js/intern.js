// Intern Management Module
class InternManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.errorHandler = window.errorHandler;
        this.toastManager = window.toastManager;
        this.init();
    }

    init() {
        // Set up real-time listeners for interns
        this.setupInternListeners();
    }

    setupInternListeners() {
        const selectedRoom = window.appState.get('selectedRoomCode');
        if (!selectedRoom) return;

        // Listen for intern presence changes
        const unsubscribe = this.db.collection('interns_inside')
            .onSnapshot((snapshot) => {
                this.handlePresenceUpdate(snapshot);
            }, (error) => {
                console.error('Error listening to intern presence:', error);
                this.errorHandler.handleFirebaseError(error);
            });

        window.appState.addListener('interns-presence', unsubscribe);
    }

    handlePresenceUpdate(snapshot) {
        const presenceMap = window.appState.get('internsPresence');

        snapshot.docs.forEach(doc => {
            presenceMap.set(doc.id, { internId: doc.id, ...doc.data() });
        });

        // Remove offline interns
        const onlineInternIds = new Set(snapshot.docs.map(doc => doc.id));
        presenceMap.forEach((presence, internId) => {
            if (!onlineInternIds.has(internId)) {
                presenceMap.set(internId, { internId, status: 'outside' });
            }
        });

        window.appState.set('internsPresence', presenceMap);
        this.updateInternPresenceUI();
    }

    async loadInterns(roomCode) {
        try {
            this.errorHandler.setLoading('load-interns', true);

            const roomSnapshot = await this.db.collection('rooms')
                .where('joinCode', '==', roomCode)
                .limit(1)
                .get();

            if (roomSnapshot.empty) {
                throw new Error('Room not found');
            }

            const roomData = roomSnapshot.docs[0].data();
            const internsEmails = roomData.interns || [];

            if (internsEmails.length === 0) {
                window.appState.set('interns', []);
                this.renderInternList([]);
                return [];
            }

            // Batch load intern details
            const internPromises = internsEmails.map(async (email) => {
                const internSnapshot = await this.db.collection('interns')
                    .where('email', '==', email)
                    .limit(1)
                    .get();

                if (!internSnapshot.empty) {
                    const internData = internSnapshot.docs[0].data();
                    return { id: internSnapshot.docs[0].id, ...internData };
                }

                return { email, name: 'Unknown Intern', status: 'unknown' };
            });

            const interns = await Promise.all(internPromises);
            window.appState.set('interns', interns);

            // Load presence data
            await this.loadInternsPresence(interns);

            this.renderInternList(interns);

            return interns;

        } catch (error) {
            console.error('Error loading interns:', error);
            this.errorHandler.handleError(error, 'loading interns');
            throw error;
        } finally {
            this.errorHandler.setLoading('load-interns', false);
        }
    }

    async loadInternsPresence(interns) {
        try {
            const presencePromises = interns.map(async (intern) => {
                const presenceDoc = await this.db.collection('interns_inside').doc(intern.id).get();
                if (presenceDoc.exists) {
                    return { internId: intern.id, ...presenceDoc.data() };
                }
                return { internId: intern.id, status: 'outside' };
            });

            const presenceData = await Promise.all(presencePromises);
            const presenceMap = new Map();

            presenceData.forEach(presence => {
                presenceMap.set(presence.internId, presence);
            });

            window.appState.set('internsPresence', presenceMap);

        } catch (error) {
            console.error('Error loading interns presence:', error);
            this.errorHandler.handleError(error, 'loading interns presence');
        }
    }

    async addInternToRoom(roomCode, internEmail) {
        try {
            this.errorHandler.setLoading('add-intern', true);

            // Validate email
            if (!internEmail || !TimeUtils.validateEmail(internEmail)) {
                throw new Error('Valid email is required');
            }

            // Check if intern exists
            const internSnapshot = await this.db.collection('interns')
                .where('email', '==', internEmail)
                .limit(1)
                .get();

            if (internSnapshot.empty) {
                throw new Error('Intern not found. They must register first.');
            }

            const internData = internSnapshot.docs[0].data();
            const internId = internSnapshot.docs[0].id;

            // Check if intern is already in the room
            const roomSnapshot = await this.db.collection('rooms')
                .where('joinCode', '==', roomCode)
                .limit(1)
                .get();

            if (roomSnapshot.empty) {
                throw new Error('Room not found');
            }

            const roomData = roomSnapshot.docs[0].data();
            if (roomData.interns && roomData.interns.includes(internEmail)) {
                throw new Error('Intern is already in this room');
            }

            // Add intern to room
            const updatedInterns = [...(roomData.interns || []), internEmail];
            await this.db.collection('rooms').doc(roomSnapshot.docs[0].id).update({
                interns: updatedInterns
            });

            this.toastManager.success(`Intern ${internData.name} added to room successfully!`);

            // Reload interns
            await this.loadInterns(roomCode);

        } catch (error) {
            console.error('Error adding intern to room:', error);
            this.errorHandler.handleError(error, 'adding intern to room');
            throw error;
        } finally {
            this.errorHandler.setLoading('add-intern', false);
        }
    }

    async removeInternFromRoom(roomCode, internEmail) {
        try {
            this.errorHandler.setLoading('remove-intern', true);

            const roomSnapshot = await this.db.collection('rooms')
                .where('joinCode', '==', roomCode)
                .limit(1)
                .get();

            if (roomSnapshot.empty) {
                throw new Error('Room not found');
            }

            const roomData = roomSnapshot.docs[0].data();
            const roomId = roomSnapshot.docs[0].id;

            if (!roomData.interns || !roomData.interns.includes(internEmail)) {
                throw new Error('Intern not found in this room');
            }

            // Remove intern from room
            const updatedInterns = roomData.interns.filter(email => email !== internEmail);
            await this.db.collection('rooms').doc(roomId).update({
                interns: updatedInterns
            });

            // Remove intern's presence data
            const internSnapshot = await this.db.collection('interns')
                .where('email', '==', internEmail)
                .limit(1)
                .get();

            if (!internSnapshot.empty) {
                const internId = internSnapshot.docs[0].id;
                await this.db.collection('interns_inside').doc(internId).delete().catch(() => {
                    // Ignore error if presence document doesn't exist
                });
            }

            // Remove intern's schedule data
            const internSchedulesSnapshot = await this.db.collection('intern_data')
                .where('room_code', '==', roomCode)
                .where('intern_email', '==', internEmail)
                .get();

            if (!internSchedulesSnapshot.empty) {
                const batch = this.db.batch();
                internSchedulesSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }

            this.toastManager.success('Intern removed from room successfully!');

            // Reload interns
            await this.loadInterns(roomCode);

        } catch (error) {
            console.error('Error removing intern from room:', error);
            this.errorHandler.handleError(error, 'removing intern from room');
            throw error;
        } finally {
            this.errorHandler.setLoading('remove-intern', false);
        }
    }

    async updateInternSchedule(internEmail, scheduleData) {
        try {
            this.errorHandler.setLoading('update-intern-schedule', true);

            // Find intern data document
            const internDataSnapshot = await this.db.collection('intern_data')
                .where('intern_email', '==', internEmail)
                .where('room_code', '==', window.appState.get('selectedRoomCode'))
                .limit(1)
                .get();

            if (internDataSnapshot.empty) {
                throw new Error('Intern schedule data not found');
            }

            const internDataDoc = internDataSnapshot.docs[0];
            const currentData = internDataDoc.data();

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

            // Update intern schedule
            const updatedSchedule = {
                totalHours: scheduleData.totalHours,
                schedule: {
                    startDate: scheduleData.startDate,
                    endDate,
                    timeMode: scheduleData.timeMode,
                    startTime: scheduleData.dailyStartTime,
                    endTime: scheduleData.dailyEndTime,
                    hpd: scheduleData.timeMode === 'hoursPerDay' ? scheduleData.dailyHours : null,
                    allowedDays: scheduleData.allowedDays,
                    dailyTimes
                },
                updatedAt: new Date()
            };

            await this.db.collection('intern_data').doc(internDataDoc.id).update(updatedSchedule);

            this.toastManager.success('Intern schedule updated successfully!');

        } catch (error) {
            console.error('Error updating intern schedule:', error);
            this.errorHandler.handleError(error, 'updating intern schedule');
            throw error;
        } finally {
            this.errorHandler.setLoading('update-intern-schedule', false);
        }
    }

    async logoutAllInterns() {
        try {
            this.errorHandler.setLoading('logout-all-interns', true);

            const selectedRoom = window.appState.get('selectedRoomCode');
            if (!selectedRoom) {
                throw new Error('No room selected');
            }

            // Get all interns in the room
            const roomSnapshot = await this.db.collection('rooms')
                .where('joinCode', '==', selectedRoom)
                .limit(1)
                .get();

            if (roomSnapshot.empty) {
                throw new Error('Room not found');
            }

            const roomData = roomSnapshot.docs[0].data();
            const internsEmails = roomData.interns || [];

            if (internsEmails.length === 0) {
                this.toastManager.info('No interns to log out');
                return;
            }

            // Batch logout interns
            const batch = this.db.batch();
            const logoutPromises = [];

            for (const email of internsEmails) {
                const internSnapshot = await this.db.collection('interns')
                    .where('email', '==', email)
                    .limit(1)
                    .get();

                if (!internSnapshot.empty) {
                    const internId = internSnapshot.docs[0].id;

                    // Update presence to outside
                    const presenceRef = this.db.collection('interns_inside').doc(internId);
                    batch.set(presenceRef, {
                        status: 'outside',
                        lastSeen: new Date(),
                        loggedOutBy: 'coordinator'
                    }, { merge: true });

                    // Log the logout event
                    logoutPromises.push(this.logInternEvent(internId, 'logout', 'Logged out by coordinator'));
                }
            }

            await batch.commit();
            await Promise.all(logoutPromises);

            this.toastManager.success(`Logged out ${internsEmails.length} intern(s) successfully!`);

            // Reload interns to update UI
            await this.loadInterns(selectedRoom);

        } catch (error) {
            console.error('Error logging out all interns:', error);
            this.errorHandler.handleError(error, 'logging out all interns');
            throw error;
        } finally {
            this.errorHandler.setLoading('logout-all-interns', false);
        }
    }

    async logInternEvent(internId, eventType, description) {
        try {
            await this.db.collection('intern_logs').add({
                internId,
                eventType,
                description,
                timestamp: new Date(),
                coordinatorEmail: this.auth.currentUser?.email
            });
        } catch (error) {
            console.error('Error logging intern event:', error);
        }
    }

    async getInternSchedule(internEmail) {
        try {
            const internDataSnapshot = await this.db.collection('intern_data')
                .where('intern_email', '==', internEmail)
                .where('room_code', '==', window.appState.get('selectedRoomCode'))
                .limit(1)
                .get();

            if (internDataSnapshot.empty) {
                return null;
            }

            return internDataSnapshot.docs[0].data();

        } catch (error) {
            console.error('Error getting intern schedule:', error);
            this.errorHandler.handleError(error, 'getting intern schedule');
            return null;
        }
    }

    renderInternList(interns) {
        const internList = document.getElementById('roomInternList');
        if (!internList) return;

        if (interns.length === 0) {
            internList.innerHTML = '<p class="text-sm text-gray-500">No interns in this room.</p>';
            return;
        }

        const html = interns.map(intern => {
            const presence = window.appState.get('internsPresence').get(intern.id) || { status: 'unknown' };
            const statusIcon = presence.status === 'inside' ? '✅' : '❌';
            const statusText = presence.status === 'inside' ? 'Timed In' : 'Not Timed In';
            const statusClass = presence.status === 'inside' ? 'text-green-600' : 'text-red-600';

            return `
                <li class="bg-gray-50 rounded-lg shadow p-4 flex justify-between items-center">
                    <div>
                        <h3 class="text-lg font-semibold">${intern.name || 'Unnamed Intern'}</h3>
                        <p class="text-sm text-gray-500">${intern.email}</p>
                        <p class="text-sm ${statusClass} font-medium mt-1">${statusIcon} ${statusText}</p>
                    </div>
                    <div>
                        <button onclick="internManager.editInternSchedule('${intern.email}')"
                            class="text-blue-600 hover:underline mr-2">Edit Schedule</button>
                        <button onclick="internManager.removeIntern('${intern.email}')"
                            class="text-red-600 hover:underline">Remove</button>
                    </div>
                </li>
            `;
        }).join('');

        internList.innerHTML = html;
    }

    updateInternPresenceUI() {
        const interns = window.appState.get('interns');
        if (interns.length === 0) return;

        // Update presence indicators in the UI
        interns.forEach(intern => {
            const presence = window.appState.get('internsPresence').get(intern.id);
            if (presence) {
                const statusElement = document.querySelector(`[data-intern-email="${intern.email}"] .presence-status`);
                if (statusElement) {
                    const statusIcon = presence.status === 'inside' ? '✅' : '❌';
                    const statusText = presence.status === 'inside' ? 'Timed In' : 'Not Timed In';
                    const statusClass = presence.status === 'inside' ? 'text-green-600' : 'text-red-600';

                    statusElement.className = `text-sm ${statusClass} font-medium mt-1`;
                    statusElement.innerHTML = `${statusIcon} ${statusText}`;
                }
            }
        });
    }

    async editInternSchedule(internEmail) {
        try {
            const scheduleData = await this.getInternSchedule(internEmail);
            if (!scheduleData) {
                this.toastManager.error('No schedule found for this intern');
                return;
            }

            // Populate edit form with current schedule data
            this.populateEditScheduleForm(scheduleData);

            // Show edit modal
            const modal = document.getElementById('editInternScheduleModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }

        } catch (error) {
            console.error('Error editing intern schedule:', error);
            this.errorHandler.handleError(error, 'editing intern schedule');
        }
    }

    populateEditScheduleForm(scheduleData) {
        const schedule = scheduleData.schedule;

        // Populate form fields
        document.getElementById('editTotalHoursInput').value = scheduleData.totalHours || '';
        document.getElementById('editStartDateInput').value = schedule.startDate || '';

        // Set time mode
        if (schedule.timeMode === 'endTime') {
            document.querySelector('input[name="editTimeMode"][value="endTime"]').checked = true;
            document.getElementById('editHoursPerDayBlock').classList.add('hidden');
            document.getElementById('editEndTimeBlock').classList.remove('hidden');
            document.getElementById('editStartTimeET').value = schedule.startTime || '';
            document.getElementById('editEndTimeET').value = schedule.endTime || '';
        } else {
            document.querySelector('input[name="editTimeMode"][value="hoursPerDay"]').checked = true;
            document.getElementById('editHoursPerDayBlock').classList.remove('hidden');
            document.getElementById('editEndTimeBlock').classList.add('hidden');
            document.getElementById('editStartTimeHPD').value = schedule.startTime || '';
            document.getElementById('editHoursPerDay').value = schedule.hpd || '';
        }

        // Set allowed days
        const allowedDays = schedule.allowedDays || [];
        document.querySelectorAll('.editAllowedDay').forEach(cb => {
            cb.checked = allowedDays.includes(cb.value);
        });
    }

    async removeIntern(internEmail) {
        if (!confirm('Are you sure you want to remove this intern from the room?')) {
            return;
        }

        const selectedRoom = window.appState.get('selectedRoomCode');
        await this.removeInternFromRoom(selectedRoom, internEmail);
    }
}

// Create global intern manager instance
window.internManager = new InternManager();

// Export for use in modules
window.InternManager = InternManager;
