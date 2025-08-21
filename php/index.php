<?php
// Main index page - PHP version
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intern Management System</title>
  <link rel="stylesheet" href="css/main.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>
</head>
<body class="bg-gray-50">
  <!-- Header -->
  <?php include 'components/header.php'; ?>

  <!-- Hero Section -->
  <section class="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h1 class="text-4xl md:text-6xl font-bold mb-6">
        Welcome to Intern Management System
      </h1>
      <p class="text-xl md:text-2xl mb-8 opacity-90">
        Streamline your internship program with our comprehensive management platform
      </p>
      <div class="space-x-4">
        <a href="php/coordinator-dashboard.php" class="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">
          Coordinator Portal
        </a>
        <a href="php/intern-dashboard.php" class="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition">
          Intern Portal
        </a>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="py-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Key Features</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="bg-white p-6 rounded-lg shadow-md">
          <div class="text-blue-600 text-4xl mb-4">📋</div>
          <h3 class="text-xl font-semibold mb-2">Task Management</h3>
          <p class="text-gray-600">Create, assign, and track tasks efficiently</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-md">
          <div class="text-blue-600 text-4xl mb-4">👥</div>
          <h3 class="text-xl font-semibold mb-2">User Management</h3>
          <p class="text-gray-600">Manage coordinators, interns, and supervisors</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-md">
          <div class="text-blue-600 text-4xl mb-4">📊</div>
          <h3 class="text-xl font-semibold mb-2">Analytics</h3>
          <p class="text-gray-600">Track progress and performance metrics</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <?php include 'components/footer.php'; ?>

  <!-- Scripts -->
  <script src="javascript/firebase-config.js"></script>
  <script src="javascript/utils.js"></script>
  <script src="javascript/auth.js"></script>
</body>
</html>
