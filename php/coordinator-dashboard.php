<?php
// Coordinator Dashboard - Intern Management System
// PHP Version of coordinator-dashboard.html

// Include necessary PHP files
require_once '../includes/config.php';
require_once '../includes/auth.php';
require_once '../includes/utils.php';

// Check authentication
if (!isLoggedIn()) {
    header('Location: ../index.php');
    exit();
}

// Get coordinator data
$coordinator = getCurrentCoordinator();
if (!$coordinator) {
    header('Location: ../index.php');
    exit();
}

// Page variables
$pageTitle = 'Coordinator Dashboard - Intern Management System';
$coordinatorName = $coordinator['fullName'] ?? 'Coordinator';
$coordinatorOrg = $coordinator['organization'] ?? 'Unknown';
$coordinatorCode = $coordinator['code'] ?? 'N/A';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo htmlspecialchars($pageTitle); ?></title>
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
    <?php if (!isLoggedIn()): ?>
    <div id="authModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm">
        <h2 id="modalTitle" class="text-xl font-bold mb-4 text-center">Coordinator Login</h2>
        <form id="authForm" method="post" action="../includes/auth.php">
          <input id="email" type="email" name="email" placeholder="Email" class="w-full px-3 py-2 border rounded mb-3" required>
          <input id="password" type="password" name="password" placeholder="Password" class="w-full px-3 py-2 border rounded mb-3" required>
          <div id="extraFields" class="hidden">
            <input id="fullName" type="text" name="fullName" placeholder="Full Name" class="w-full px-3 py-2 border rounded mb-3">
            <input id="organization" type="text" name="organization" placeholder="Organization" class="w-full px-3 py-2 border rounded mb-3">
          </div>
          <button type="submit" id="authButton" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
            🔐 Log In
          </button>
        </form>
        <p id="authStatus" class="text-sm mt-2 text-center text-red-600"></p>
        <p class="text-sm text-center mt-4">
          <span id="togglePrompt">Don't have an account?</span>
          <button id="toggleMode" class="text-blue-600 hover:underline">Register here</button>
        </p>
      </div>
    </div>
    <?php endif; ?>

    <!-- Dashboard -->
    <div id="dashboard" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Welcome Section -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          👨‍🏫 Welcome, <?php echo htmlspecialchars($coordinatorName); ?>
        </h1>
        <p class="text-gray-600 mb-2">Organization: <span class="font-semibold"><?php echo htmlspecialchars($coordinatorOrg); ?></span></p>
        <p class="text-blue-600 font-semibold">Your Coordinator Code: <span><?php echo htmlspecialchars($coordinatorCode); ?></span></p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Task Management -->
        <div class="lg:col-span-2">
          <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">📋 Post New Task</h2>
            <form id="taskForm" method="post" action="../includes/tasks.php">
              <input id="taskTitle" type="text" name="taskTitle" placeholder="Task Title" class="w-full mb-3 px-3 py-2 border rounded" required>
              <textarea id="taskDescription" name="taskDescription" rows="4" placeholder="Task Description" class="w-full mb-3 px-3 py-2 border rounded" required></textarea>
              <button type="submit" id="postTaskBtn" class="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition">
                📨 Post Task
              </button>
            </form>
          </div>

          <!-- Recent Tasks -->
          <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold mb-4">📊 Recent Tasks</h2>
            <div id="tasksList" class="space-y-4">
              <?php
              $tasks = getCoordinatorTasks($coordinator['code']);
              if (empty($tasks)) {
                  echo '<p class="text-gray-500">No tasks posted yet.</p>';
              } else {
                  foreach ($tasks as $task) {
                      echo '<div class="border border-gray-200 rounded-lg p-4">';
                      echo '<h4 class="font-semibold text-lg mb-2">' . htmlspecialchars($task['title']) . '</h4>';
                      echo '<p class="text-gray-600 mb-2">' . htmlspecialchars($task['description']) . '</p>';
                      echo '<p class="text-sm text-gray-500">Posted: ' . htmlspecialchars($task['created_at']) . '</p>';
                      echo '</div>';
                  }
              }
              ?>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-lg shadow-md p-6 mb-4">
            <h3 class="text-lg font-semibold mb-4">📈 Quick Stats</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Total Tasks</span>
                <span class="font-semibold"><?php echo getTotalTasks($coordinator['code']); ?></span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Active Interns</span>
                <span class="font-semibold"><?php echo getActiveInterns($coordinator['code']); ?></span>
              </div>
            </div>
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
</body>
</html>
<?php
// Footer
include '../components/footer.php';
?>
