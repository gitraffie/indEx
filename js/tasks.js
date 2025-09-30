// Tasks Module for Intern Dashboard
class TaskManager {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.allTasks = [];
        this.init();
    }

    init() {
        // Initialization if needed
    }

    parseDueDate(dueDate) {
        if (!dueDate) return null;

        let parsedDate = null;

        if (typeof dueDate === "string") {
            // Assume YYYY-MM-DD format
            parsedDate = new Date(dueDate + "T00:00:00");
        } else if (dueDate.seconds !== undefined) {
            // Firestore Timestamp
            parsedDate = new Date(dueDate.seconds * 1000);
        } else if (dueDate instanceof Date) {
            parsedDate = new Date(dueDate);
        } else {
            console.warn("Unrecognized dueDate format:", dueDate);
        }

        // Validate the date
        if (parsedDate && isNaN(parsedDate.getTime())) {
            console.warn("Invalid date parsed from dueDate:", dueDate);
            return null;
        }

        return parsedDate;
    }

    formatDueDate(dueDate) {
        const parsed = this.parseDueDate(dueDate);
        if (!parsed) return "No due date";
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        return `${monthNames[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
    }

    async loadTasks() {
        const taskList = document.getElementById("taskList");
        const taskFilter = document.getElementById("taskFilter");
        taskList.innerHTML = "<div class='text-gray-500'>Loading tasks...</div>";

        try {
            const tasksSnap = await this.db.collection("tasks").get();

            if (tasksSnap.empty) {
                taskList.innerHTML = "<div class='text-gray-500'>No tasks posted yet.</div>";
                this.allTasks = [];
                // Reset filter to default
                taskFilter.innerHTML = '<option value="all">All Rooms</option>';
                return;
            }

            this.allTasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort tasks by createdAt descending
            this.allTasks.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            // Get unique room codes from tasks
            const roomCodes = [...new Set(this.allTasks.map(task => task.roomCode))];

            // Fetch room names for filter options
            const roomNames = {};
            for (const code of roomCodes) {
                try {
                    const roomSnap = await this.db.collection("rooms")
                        .where("joinCode", "==", code)
                        .limit(1)
                        .get();
                    if (!roomSnap.empty) {
                        roomNames[code] = roomSnap.docs[0].data().roomName || code;
                    } else {
                        roomNames[code] = code;
                    }
                } catch (err) {
                    console.error(`Error fetching room name for ${code}:`, err);
                    roomNames[code] = code;
                }
            }

            // Populate filter dropdown
            taskFilter.innerHTML = '<option value="all">All Rooms</option>';
            roomCodes.forEach(code => {
                const option = document.createElement("option");
                option.value = code;
                option.textContent = roomNames[code];
                taskFilter.appendChild(option);
            });

            // Display all tasks initially
            this.displayTasks("all");

            // Add event listener to filter
            taskFilter.addEventListener("change", (e) => {
                this.displayTasks(e.target.value);
            });

        } catch (err) {
            console.error("Error loading tasks:", err);
            taskList.innerHTML = "<div class='text-red-600'>❌ Failed to load tasks.</div>";
            this.allTasks = [];
            taskFilter.innerHTML = '<option value="all">All Rooms</option>';
        }
    }

    async displayTasks(filterRoom) {
        const taskList = document.getElementById("taskList");

        // Filter tasks based on selected room
        let filteredTasks;
        if (filterRoom === "all") {
            // Show only tasks from joined rooms
            const joinedRooms = window.authManager.currentIntern?.rooms || [];
            console.log('joinedRooms:', joinedRooms);
            console.log('allTasks length:', this.allTasks.length);
            filteredTasks = this.allTasks.filter(task => joinedRooms.includes(task.roomCode));
            console.log('filteredTasks length:', filteredTasks.length);
            console.log('filteredTasks titles:', filteredTasks.map(t => t.title));
        } else {
            filteredTasks = this.allTasks.filter(task => task.roomCode === filterRoom);
        }

        if (filteredTasks.length === 0) {
            taskList.innerHTML = "<div class='text-gray-500'>No tasks found for the selected room.</div>";
            return;
        }

        // Get unique roomCodes from filteredTasks
        const roomCodes = [...new Set(filteredTasks.map(task => task.roomCode))];

        // Fetch room names
        const roomNames = {};
        for (const code of roomCodes) {
            try {
                const roomSnap = await this.db.collection("rooms")
                    .where("joinCode", "==", code)
                    .limit(1)
                    .get();
                if (!roomSnap.empty) {
                    roomNames[code] = roomSnap.docs[0].data().roomName || code;
                } else {
                    roomNames[code] = code;
                }
            } catch (err) {
                console.error(`Error fetching room name for ${code}:`, err);
                roomNames[code] = code;
            }
        }

        // Categorize tasks
        const categories = {
            overdue: [],
            noDue: [],
            thisWeek: [],
            nextWeek: [],
            later: []
        };

        filteredTasks.forEach(task => {
            const dueDate = this.parseDueDate(task.dueDate);
            const category = this.getTaskCategory(dueDate);
            console.log(`Task: ${task.title}, dueDate: ${dueDate}, category: ${category}`);
            categories[category].push({ ...task, parsedDueDate: dueDate });
        });

        console.log('categories counts:', Object.keys(categories).map(cat => `${cat}: ${categories[cat].length}`));

        // Sort each category by due date (or createdAt for noDue)
        Object.keys(categories).forEach(cat => {
            if (cat === 'noDue') {
                categories[cat].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
            } else {
                categories[cat].sort((a, b) => a.parsedDueDate - b.parsedDueDate);
            }
        });

        const categoryLabels = {
            overdue: 'Overdue',
            noDue: 'No Due Date',
            thisWeek: 'This Week',
            nextWeek: 'Next Week',
            later: 'Later'
        };

        taskList.innerHTML = '';

        Object.keys(categories).forEach(cat => {
            const tasks = categories[cat];

            const details = document.createElement('details');
            details.open = true; // Open accordions by default to show all tasks
            details.className = 'mb-4';

            const summary = document.createElement('summary');
            summary.className = 'bg-gray-100 p-3 rounded-t-lg font-semibold cursor-pointer hover:bg-gray-200';
            summary.textContent = `${categoryLabels[cat]} (${tasks.length})`;

            const container = document.createElement('div');
            container.className = 'p-3 bg-white border border-gray-200 rounded-b-lg';

            if (tasks.length === 0) {
                container.innerHTML = '<div class="text-gray-500">No tasks in this category.</div>';
            } else {
                tasks.forEach(task => {
                    const taskCard = document.createElement("div");
                    taskCard.className = "bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition cursor-pointer mb-3";

                    const dueDateStr = this.formatDueDate(task.dueDate);

                    // Determine status color
                    let statusColor = "text-gray-600";
                    if (task.status === "Completed") statusColor = "text-green-600";
                    else if (task.status === "In Progress") statusColor = "text-blue-600";
                    else if (task.status === "Pending") statusColor = "text-orange-600";

                    taskCard.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-semibold text-gray-800 text-lg">${task.title}</h4>
                        </div>
                        <p class="text-gray-600 text-sm mb-3 line-clamp-2">${task.description}</p>
                        <div class="flex justify-between items-center text-xs text-gray-500 mb-2">
                            <span>Due: ${dueDateStr}</span>
                            <span class="${statusColor}">${task.status || "Pending"}</span>
                        </div>
                        <div class="text-xs text-gray-400">Room: ${roomNames[task.roomCode]}</div>
                    `;

                    // Add click event to show task details inline
                    taskCard.addEventListener('click', () => this.showTaskDetails(task, task.id));

                    container.appendChild(taskCard);
                });
            }

            details.appendChild(summary);
            details.appendChild(container);
            taskList.appendChild(details);
        });
    }

    getTaskCategory(dueDate) {
        if (!dueDate) return 'noDue';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);

        if (due < today) return 'overdue';

        // Calculate start of current week (Sunday as start)
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // This week: from today to end of week
        if (due >= today && due <= endOfWeek) return 'thisWeek';

        // Next week
        const startNextWeek = new Date(endOfWeek);
        startNextWeek.setDate(endOfWeek.getDate() + 1);
        startNextWeek.setHours(0, 0, 0, 0);

        const endNextWeek = new Date(startNextWeek);
        endNextWeek.setDate(startNextWeek.getDate() + 6);
        endNextWeek.setHours(23, 59, 59, 999);

        if (due >= startNextWeek && due <= endNextWeek) return 'nextWeek';

        // More than two weeks from today
        return 'later';
    }

    showTaskDetails(task, taskId) {
        const taskDetailsSection = document.getElementById("taskDetailsSection");
        const taskDetailsContent = document.getElementById("taskDetailsContent");

        if (!taskDetailsSection || !taskDetailsContent) {
            console.error('Task details section not found');
            return;
        }

        // Populate task details content
        taskDetailsContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">${task.title || "Untitled Task"}</h3>
                    <p class="text-gray-600 mb-4">${task.description || "No description available."}</p>
                    <div class="space-y-2">
                        <p><strong>Priority:</strong> ${task.priority || "Normal"}</p>
                        <p><strong>Due Date:</strong> ${this.formatDueDate(task.dueDate)}</p>
                        <p><strong>Status:</strong> ${task.status || "Pending"}</p>
                        <p><strong>Assigned By:</strong> ${task.assignedBy || "Coordinator"}</p>
                    </div>
                </div>
                <div>
                    <h4 class="text-md font-semibold text-gray-800 mb-2">Progress</h4>
                    <div class="w-full bg-gray-200 rounded-full h-4 mb-2">
                        <div id="taskProgressBar" class="bg-blue-600 h-4 rounded-full" style="width: ${task.progress || 0}%"></div>
                    </div>
                    <p id="taskProgressText" class="text-sm text-gray-600">${task.progress || 0}% Complete</p>
                    <button onclick="window.taskManager.markTaskComplete('${taskId}')" class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                        Mark as Complete
                    </button>
                </div>
            </div>
            <div>
                <h4 class="text-md font-semibold text-gray-800 mb-2">Comments</h4>
                <div id="taskComments" class="space-y-2">
                    <p class="text-gray-500">Loading comments...</p>
                </div>
                <div class="mt-4">
                    <textarea id="newComment" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all" rows="3" placeholder="Add a comment..."></textarea>
                    <button onclick="window.taskManager.addComment('${taskId}')" class="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        Add Comment
                    </button>
                </div>
            </div>
        `;

        // Load comments
        this.loadTaskComments(taskId);

        // Show task details section
        taskDetailsSection.classList.remove('hidden');
        taskDetailsSection.scrollIntoView({ behavior: 'smooth' });
    }

    closeTaskModal() {
        const modal = document.getElementById("taskModal");
        const content = modal.querySelector('.modal-content');
        content.classList.remove('fade-in');
        content.classList.add('fade-out');
        content.addEventListener('transitionend', () => {
            modal.style.display = "none";
        }, { once: true });
    }

    async loadTaskComments(taskId) {
        const commentsContainer = document.getElementById("taskComments");
        commentsContainer.innerHTML = "<p class='text-gray-500'>Loading comments...</p>";

        try {
            const commentsSnap = await this.db.collection("tasks").doc(taskId).collection("comments").orderBy("createdAt", "asc").get();

            if (commentsSnap.empty) {
                commentsContainer.innerHTML = "<p class='text-gray-500'>No comments yet.</p>";
                return;
            }

            commentsContainer.innerHTML = "";

            commentsSnap.forEach(doc => {
                const comment = doc.data();
                const commentDiv = document.createElement("div");
                commentDiv.className = "bg-gray-100 p-3 rounded-lg mb-2";
                commentDiv.innerHTML = `
                    <p class="text-sm text-gray-800">${comment.text}</p>
                    <p class="text-xs text-gray-500 mt-1">By ${comment.author} on ${new Date(comment.createdAt.seconds * 1000).toLocaleString()}</p>
                `;
                commentsContainer.appendChild(commentDiv);
            });
        } catch (err) {
            console.error("Error loading comments:", err);
            commentsContainer.innerHTML = "<p class='text-red-500'>Failed to load comments.</p>";
        }
    }

    async addComment(taskId) {
        const commentInput = document.getElementById("newComment");
        const text = commentInput.value.trim();
        if (!text) return;

        try {
            await this.db.collection("tasks").doc(taskId).collection("comments").add({
                text: text,
                author: window.authManager.currentIntern.name || this.auth.currentUser.email,
                createdAt: new Date()
            });
            commentInput.value = "";
            this.loadTaskComments(taskId); // Reload comments
        } catch (err) {
            console.error("Error adding comment:", err);
            alert("Failed to add comment.");
        }
    }

    async markTaskComplete(taskId) {
        if (!taskId) {
            alert("Task ID not found.");
            return;
        }

        try {
            // Update task status to completed
            await this.db.collection("tasks").doc(taskId).update({
                status: "Completed",
                progress: 100,
                completedAt: new Date()
            });

            // Hide task details section
            this.backToTasks();

            // Reload tasks to reflect changes
            this.loadTasks();

            // Show success message
            alert("Task marked as complete!");
        } catch (err) {
            console.error("Error marking task complete:", err);
            alert("Failed to mark task as complete. Please try again.");
        }
    }

    backToTasks() {
        const taskDetailsSection = document.getElementById("taskDetailsSection");
        if (taskDetailsSection) {
            taskDetailsSection.classList.add('hidden');
        }
    }
}

// Create global task manager instance
window.taskManager = new TaskManager();

// Export for use in modules
window.TaskManager = TaskManager;

// Global function for HTML onclick
window.backToTasks = function() {
    window.taskManager.backToTasks();
};
