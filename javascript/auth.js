// Authentication Module
class AuthManager {
  constructor() {
    this.auth = window.firebaseApp.auth;
    this.db = window.firebaseApp.db;
    this.currentUser = null;
    this.userRole = null;
  }

  async init() {
    this.auth.onAuthStateChanged(async (user) => {
      this.currentUser = user;
      if (user) {
        await this.determineUserRole(user.email);
        this.updateUI();
      } else {
        this.userRole = null;
        this.updateUI();
      }
    });
  }

  async determineUserRole(email) {
    try {
      // Check if user is a coordinator
      const coordinatorDoc = await this.db.collection('coordinators').where('email', '==', email).get();
      if (!coordinatorDoc.empty) {
        this.userRole = 'coordinator';
        return;
      }

      // Check if user is an intern
      const internDoc = await this.db.collection('interns').where('email', '==', email).get();
      if (!internDoc.empty) {
        this.userRole = 'intern';
        return;
      }

      // Check if user is a supervisor
      const supervisorDoc = await this.db.collection('supervisors').where('email', '==', email).get();
      if (!supervisorDoc.empty) {
        this.userRole = 'supervisor';
        return;
      }

      this.userRole = 'unknown';
    } catch (error) {
      console.error('Error determining user role:', error);
      this.userRole = 'unknown';
    }
  }

  updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (this.currentUser && this.userRole) {
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
    } else {
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
    }
  }

  async login(email, password) {
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      
      if (!userCredential.user.emailVerified) {
        await this.auth.signOut();
        throw new Error('Please verify your email before logging in.');
      }

      return userCredential.user;
    } catch (error) {
      throw error;
    }
  }

  async register(userData) {
    try {
      const userCredential = await this.auth.createUserWithEmailAndPassword(userData.email, userData.password);
      
      await userCredential.user.sendEmailVerification();
      
      // Store user data based on role
      const userDoc = {
        email: userData.email,
        fullName: userData.fullName,
        createdAt: new Date()
      };

      if (userData.role === 'coordinator') {
        userDoc.organization = userData.organization;
        userDoc.code = this.generateCoordinatorCode();
        await this.db.collection('coordinators').doc(userCredential.user.uid).set(userDoc);
      } else if (userData.role === 'intern') {
        userDoc.school = userData.school;
        userDoc.supervisorEmail = userData.supervisorEmail;
        userDoc.coordinatorCode = userData.coordinatorCode;
        await this.db.collection('interns').doc(userCredential.user.uid).set(userDoc);
      } else if (userData.role === 'supervisor') {
        userDoc.company = userData.company;
        await this.db.collection('supervisors').doc(userCredential.user.uid).set(userDoc);
      }

      await this.auth.signOut();
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  }

  async logout() {
    try {
      await this.auth.signOut();
      window.location.href = '../index.html';
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  generateCoordinatorCode() {
    const letters = Math.random().toString(36).substring(2, 6).toUpperCase();
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return letters + numbers;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getUserRole() {
    return this.userRole;
  }
}

// Initialize auth manager
window.authManager = new AuthManager();
