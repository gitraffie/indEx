<?php
// Intern Dashboard - Intern Management System
// PHP Version of intern-dashboard.html
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intern Dashboard - Intern Management System</title>
  <link rel="stylesheet" href="../css/main.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>
</head>
<body class="bg-gray-50">
  <!-- Header -->
  <?php include '../components/header.php'; ?>

  <!-- Main Content -->
  <main class="min-h-screen py-8">
    <!-- Auth Modal -->
    <div id="authModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm">
        <h2 id="modalTitle" class="text-xl font-bold mb-4 text-center">Intern Login</h2>
        <input id="email" type="email" placeholder="Email" class="w-full px-3 py-2 border rounded mb-3">
        <input id="password" type="password" placeholder="Password" class="w-full px-3 py-2 border rounded mb-3">
        <div id="extraFields" class="hidden">
          <input id="fullName" type="text" placeholder="Full Name" class="w-full px-3 py-2 border rounded mb-3">
          <input id="school" type="text" placeholder="School Name" class="w-full px-3 py-2 border rounded mb-3">
          <input id="supervisorEmail" type="email" placeholder="Supervisor Email" class="w-full px-3 py-2 border rounded mb-3">
          <input id="coordinatorCodeInput" type="text" placeholder="Coordinator Code" class="w-full px-3 py-2 border rounded mb-3">
        </div>
        <button id="authButton" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
          🔐 Log In
        </button>
        <p id="authStatus" class="text-sm mt-2 text-center text-red-600"></p>
        <p class="text-sm text-center mt-4">
          <span id="togglePrompt">Don't have an account?</span>
          <button id="toggleMode" class="text-blue-600 hover:underline">Register here</button>
        </p>
      </div>
    </div>

    <!-- Dashboard -->
    <div id="dashboard" class="hidden max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Welcome Section -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          👨‍🎓 Welcome, <span id="internName">Intern</span>
        </h1>
        <p class="text-gray-600 mb-2">School: <span id="internSchool" class="font-semibold">-</span></p>
        <p class="text-gray-600 mb-2">Supervisor: <span id="internSupervisor" class="font-semibold">-</span></p>
        <p class="text-blue-600 font-semibold">Coordinator Code: <span id="internCoordinatorCode">-</span></p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Available Tasks -->
        <div class="lg:col-span-2">
          <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">📋 Available Tasks</h2>
            <div id="availableTasksList" class="space-y-4">
              <p class="text-gray-500">Loading tasks...</p>
            </div>
          </div>

          <!-- My Submissions -->
          <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold mb-4">📊 My Submissions</h2>
            <div id="submissionsList" class="space-y-4">
              <p class="text-gray-500">Loading submissions...</p>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-lg shadow-md p-6 mb-4">
            <h3 class="text-lg font-semibold mb-4">📈 My Stats</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Tasks Completed</span>
                <span id="tasksCompleted" class="font-semibold">0</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Tasks Pending</span>
                <span id="tasksPending" class="font-semibold">0</span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-semibold mb-4">🎯 Quick Actions</h3>
            <button id="refreshTasksBtn" class="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition mb-2">
              🔄 Refresh Tasks
            </button>
            <button id="viewProfileBtn" class="w-full bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition">
              👤 View Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <?php include '../components/footer.php'; ?>

  <!-- Scripts -->
  <script src="../javascript/firebase-config.js"></script>
  <script src="../javascript/utils.js"></script>
  <script src="../javascript/auth.js"></script>
  <script>
    class InternDashboard {
      constructor() {
        this.auth = window.firebaseApp.auth;
        this.db = window.firebaseApp.db;
        this.currentUser = null;
        this.internData = null;
        
        this.init();
      }

      async init() {
        // Check authentication state
        this.auth.onAuthStateChanged(async (user) => {
          if (user && user.emailVerified) {
            await this.loadInternData(user);
            this.showDashboard();
            this.loadAvailableTasks();
            this.loadMySubmissions();
            this.loadStats();
          } else {
            this.showAuthModal();
          }
        });

        // Event listeners
        this.setupEventListeners();
      }

      async loadInternData(user) {
        try {
          const doc = await this.db.collection('interns').doc(user.uid).get();
          if (doc.exists) {
            this.internData = doc.data();
            this.currentUser = user;
            
            document.getElementById('internName').textContent = this.internData.fullName || 'Intern';
            document.getElementById('internSchool').textContent = this.internData.school || 'Unknown';
            document.getElementById('internSupervisor').textContent = this.internData.supervisorEmail || 'Unknown';
            document.getElementById('internCoordinatorCode').textContent = this.internData.coordinatorCode || 'N/A';
          }
        } catch (error) {
          console.error('Error loading intern data:', error);
          Utils.showError('Failed to load intern data');
        }
      }

      setupEventListeners() {
        // Auth mode toggle
        document.getElementById('toggleMode').addEventListener('click', () => {
          this.toggleAuthMode();
        });

        // Auth action
        document.getElementById('authButton').addEventListener('click', () => {
          this.handleAuthAction();
        });

        // Refresh tasks
        document.getElementById('refreshTasksBtn').addEventListener('click', () => {
          this.loadAvailableTasks();
        });

        // View profile
        document.getElementById('viewProfileBtn').addEventListener('click', () => {
          this.viewProfile();
        });
      }

      toggleAuthMode() {
        const isRegisterMode = document.getElementById('extraFields').classList.contains('hidden');
        
        if (isRegisterMode) {
          document.getElementById('modalTitle').textContent = 'Intern Registration';
          document.getElementById('authButton').textContent = '📝 Register';
          document.getElementById('togglePrompt').textContent = 'Already have an account?';
          document.getElementById('toggleMode').textContent = 'Log in here';
          document.getElementById('extraFields').classList.remove('hidden');
        } else {
          document.getElementById('modalTitle').textContent = 'Intern Login';
          document.getElementById('authButton').textContent = '🔐 Log In';
          document.getElementById('togglePrompt').textContent = "Don't have an account?";
          document.getElementById('toggleMode').textContent = 'Register here';
          document.getElementById('extraFields').classList.add('hidden');
        }
      }

      async handleAuthAction() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const status = document.getElementById('authStatus');

        if (document.getElementById('extraFields').classList.contains('hidden')) {
          // Login mode
          try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            
            if (!userCredential.user.emailVerified) {
              await this.auth.signOut();
              Utils.showError('Please verify your email before logging in.');
              return;
            }

            Utils.showSuccess('Login successful!');
          } catch (error) {
            Utils.showError(error.message);
          }
        } else {
          // Register mode
          const fullName = document.getElementById('fullName').value;
          const school = document.getElementById('school').value;
          const supervisorEmail = document.getElementById('supervisorEmail').value;
          const coordinatorCode = document.getElementById('coordinatorCodeInput').value;

          if (!fullName || !school || !supervisorEmail || !coordinatorCode) {
            Utils.showError('All fields are required.');
            return;
          }

          try {
            // Verify coordinator code exists
            const coordinatorQuery = await this.db.collection('coordinators')
              .where('code', '==', coordinatorCode)
              .get();
            
            if (coordinatorQuery.empty) {
              Utils.showError('Invalid coordinator code.');
              return;
            }

            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);

            await this.db.collection('interns').doc(userCredential.user.uid).set({
              email,
              fullName,
              school,
              supervisorEmail,
              coordinatorCode,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await userCredential.user.sendEmailVerification();
            Utils.showSuccess('Verification email sent. Please verify and then log in.');
            await this.auth.signOut();
          } catch (error) {
            Utils.showError(error.message);
          }
        }
      }

      async loadAvailableTasks() {
        try {
          if (!this.internData) return;

          const tasksSnapshot = await this.db.collection('tasks')
            .where('coordinatorCode', '==', this.internData.coordinatorCode)
            .orderBy('createdAt', 'desc')
            .get();

          const availableTasksList = document.getElementById('availableTasksList');
          availableTasksList.innerHTML = '';

          if (tasksSnapshot.empty) {
            availableTasksList.innerHTML = '<p class="text-gray-500">No tasks available.</p>';
            return;
          }

          tasksSnapshot.forEach(doc => {
            const task = doc.data();
            const taskElement = document.createElement('div');
            taskElement.className = 'border border-gray-200 rounded-lg p-4';
            taskElement.innerHTML = `
              <h4 class="font-semibold text-lg mb-2">${task.title}</h4>
              <p class="text-gray-600 mb-2">${task.description}</p>
              <p class="text-sm text-gray-500 mb-3">Posted: ${Utils.formatDate(task.createdAt?.toDate())}</p>
              <button onclick="internDashboard.submitTask('${doc.id}')" 
                      class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">
                📤 Submit Work
              </button>
            `;
            availableTasksList.appendChild(taskElement);
          });
        } catch (error) {
          console.error('Error loading tasks:', error);
        }
      }

      async loadMySubmissions() {
        try {
          if (!this.currentUser) return;

          const submissionsSnapshot = await this.db.collection('submissions')
            .where('internUID', '==', this.currentUser.uid)
            .orderBy('submittedAt', 'desc')
            .get();

          const submissionsList = document.getElementById('submissionsList');
          submissionsList.innerHTML = '';

          if (submissionsSnapshot.empty) {
            submissionsList.innerHTML = '<p class="text-gray-500">No submissions yet.</p>';
            return;
          }

          submissionsSnapshot.forEach(doc => {
            const submission = doc.data();
            const submissionElement = document.createElement('div');
            submissionElement.className = 'border border-gray-200 rounded-lg p-4';
            
            let statusBadge = '';
            if (submission.status === 'pending') {
              statusBadge = '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">Pending</span>';
            } else if (submission.status === 'approved') {
              statusBadge = '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">Approved</span>';
            } else if (submission.status === 'rejected') {
              statusBadge = '<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">Rejected</span>';
            }

            submissionElement.innerHTML = `
              <h4 class="font-semibold text-lg mb-2">${submission.taskTitle}</h4>
              <p class="text-gray-600 mb-2">${submission.workDescription}</p>
              <p class="text-sm text-gray-500 mb-2">Submitted: ${Utils.formatDate(submission.submittedAt?.toDate())}</p>
              <div class="flex justify-between items-center">
                ${statusBadge}
                ${submission.feedback ? `<p class="text-sm text-gray-600">Feedback: ${submission.feedback}</p>` : ''}
              </div>
            `;
            submissionsList.appendChild(submissionElement);
          });
        } catch (error) {
          console.error('Error loading submissions:', error);
        }
      }

      async loadStats() {
        try {
          if (!this.currentUser) return;

          // Count completed tasks
          const completedSnapshot = await this.db.collection('submissions')
            .where('internUID', '==', this.currentUser.uid)
            .where('status', '==', 'approved')
            .get();
          
          document.getElementById('tasksCompleted').textContent = completedSnapshot.size;

          // Count pending tasks
          const pendingSnapshot = await this.db.collection('submissions')
            .where('internUID', '==', this.currentUser.uid)
            .where('status', '==', 'pending')
            .get();
          
          document.getElementById('tasksPending').textContent = pendingSnapshot.size;
        } catch (error) {
          console.error('Error loading stats:', error);
        }
      }

      async submitTask(taskId) {
        const workDescription = prompt('Please describe your work:');
        if (!workDescription) return;

        try {
          const taskDoc = await this.db.collection('tasks').doc(taskId).get();
          if (!taskDoc.exists) {
            Utils.showError('Task not found.');
            return;
          }

          const task = taskDoc.data();
          
          await this.db.collection('submissions').add({
            internUID: this.currentUser.uid,
            taskId: taskId,
            taskTitle: task.title,
            workDescription: workDescription,
            coordinatorCode: this.internData.coordinatorCode,
            status: 'pending',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          Utils.showSuccess('Task submitted successfully!');
          this.loadMySubmissions();
          this.loadStats();
        } catch (error) {
          Utils.showError('Failed to submit task.');
        }
      }

      viewProfile() {
        alert('Profile feature coming soon!');
      }

      showDashboard() {
        document.getElementById('authModal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
      }

      showAuthModal() {
        document.getElementById('authModal').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
      }
    }

    // Initialize dashboard
    let internDashboard;
    document.addEventListener('DOMContentLoaded', function() {
      // Initialize dashboard
      internDashboard = new InternDashboard();
    });
  </script>
</body>
</html>
