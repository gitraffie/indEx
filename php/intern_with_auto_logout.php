<?php
// Intern Dashboard with Auto Logout - PHP Version
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intern Dashboard - Auto Logout</title>
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

  <main class="min-h-screen py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h1 class="text-2xl font-bold mb-4">Intern Dashboard with Auto Logout</h1>
        <p class="text-gray-600 mb-4">This page will automatically log you out after 30 minutes of inactivity.</p>
        <div class="flex space-x-4">
          <a href="intern-dashboard.php" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            Go to Regular Dashboard
          </a>
          <button onclick="logout()" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition">
            Logout Now
          </button>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <?php include '../components/footer.php'; ?>

  <script>
    // Auto logout functionality
    let logoutTimer;
    const LOGOUT_TIME = 30 * 60 * 1000; // 30 minutes

    function resetLogoutTimer() {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        alert('You have been logged out due to inactivity.');
        window.location.href = 'intern-dashboard.php';
      }, LOGOUT_TIME);
    }

    function logout() {
      firebase.auth().signOut().then(() => {
        window.location.href = '../index.php';
      });
    }

    // Reset timer on user activity
    document.addEventListener('click', resetLogoutTimer);
    document.addEventListener('keypress', resetLogoutTimer);
    document.addEventListener('mousemove', resetLogoutTimer);

    // Initialize timer
    resetLogoutTimer();
  </script>
</body>
</html>
