// Authentication components and functions

class AuthManager {
  constructor(app) {
    this.app = app;
    this.isAuthenticated = false;
    this.email = null;
    this.authToken = null;
    this.syncIntervalId = null;

    // Initialize authentication-related DOM elements
    this.loginOverlay = document.getElementById('login-overlay');
    this.loginForm = document.getElementById('login-form');
    this.emailInput = document.getElementById('email-input');
    this.loginButton = document.getElementById('login-button');
    this.loginStatus = document.getElementById('login-status');
    this.logoutButton = document.getElementById('logout-button');

    this.bindEvents();
    this.checkForExistingSession();
    this.checkForMagicLinkToken();
  }

  /**
   * Bind event listeners to DOM elements
   */
  bindEvents() {
    // Login form submission
    this.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.requestMagicLink();
    });

    // Logout button click
    this.logoutButton.addEventListener('click', () => {
      this.logout();
    });
  }

  /**
   * Check for existing auth session in localStorage
   */
  checkForExistingSession() {
    const token = localStorage.getItem('authToken');
    const email = localStorage.getItem('userEmail');

    if (token && email) {
      this.verifyToken(token, email);
    } else {
      this.showLoginForm();
    }
  }

  /**
   * Check URL for magic link token parameter
   */
  checkForMagicLinkToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const email = urlParams.get('email');

    if (token && email) {
      // Remove token from URL (for security)
      window.history.replaceState({}, document.title, window.location.pathname);

      // Save token and authenticate
      this.authToken = token;
      this.email = email;
      this.authenticateUser(token, email);
    }
  }

  /**
   * Show the login form overlay
   */
  showLoginForm() {
    // Do not reset app data here as it would wipe out existing data
    // when logging in from a new browser
    
    // Show login overlay
    this.loginOverlay.style.display = 'flex';
    this.isAuthenticated = false;
  }

  /**
   * Hide the login form overlay
   */
  hideLoginForm() {
    this.loginOverlay.style.display = 'none';
  }

  /**
   * Request a magic link for the provided email
   */
  async requestMagicLink() {
    const email = this.emailInput.value.trim();

    if (!email || !email.includes('@')) {
      this.loginStatus.textContent = 'Please enter a valid email address';
      this.loginStatus.className = 'status-error';
      return;
    }

    this.loginButton.disabled = true;
    this.loginStatus.textContent = 'Sending login link...';
    this.loginStatus.className = 'status-info';

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        this.loginStatus.textContent = 'Check your email for a login link!';
        this.loginStatus.className = 'status-success';

        // For development, show the magic link
        if (data.magicLink) {
          console.log('Magic link (for development):', data.magicLink);
          // Add a clickable link for development
          this.loginStatus.innerHTML = `Check your email for a login link!<br><a href="${data.magicLink}" style="color:#fff">Click here to login (dev only)</a>`;
        }
      } else {
        this.loginStatus.textContent = data.message || 'Login failed. Please try again.';
        this.loginStatus.className = 'status-error';
      }
    } catch (error) {
      console.error('Login error:', error);
      this.loginStatus.textContent = 'Login failed. Please try again.';
      this.loginStatus.className = 'status-error';
    } finally {
      this.loginButton.disabled = false;
    }
  }

  /**
   * Verify a JWT token with the server
   */
  async verifyToken(token, email) {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'valid' && data.email === email) {
          this.authenticateUser(token, email);
          return;
        }
      }

      // If we get here, token verification failed
      this.logout();
    } catch (error) {
      console.error('Token verification error:', error);
      this.logout();
    }
  }

  /**
   * Authenticate the user and set up the authenticated session
   */
  authenticateUser(token, email) {
    this.authToken = token;
    this.email = email;
    this.isAuthenticated = true;

    // Store auth data in localStorage
    localStorage.setItem('authToken', token);
    localStorage.setItem('userEmail', email);

    // Update UI for authenticated state
    this.hideLoginForm();
    document.getElementById('user-email').textContent = email;
    document.querySelector('.user-info').style.display = 'flex';

    // Fetch user data from server
    this.fetchUserData().then(() => {
      // Start periodic data sync after initial fetch
      this.startDataSync();
    });
  }

  /**
   * Fetch user data from the server
   */
  async fetchUserData() {
    if (!this.isAuthenticated) return;

    try {
      console.log('Fetching user data from server...');
      // First, get server data without sending local data
      const response = await fetch('/api/data/get', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.ok) {
        const body = await response.json();
        
        if (body.data) {
          console.log('Received data from server:', body.data);
          // Update app data with server data
          this.app.data = body.data;
          localStorage.setItem('kanbanData', JSON.stringify(body.data));
          console.log('Rendering board with data from server');
          this.app.renderBoard();
          console.log('Data loaded from server');
        } else {
          console.log('No data found on server');
          // No data on server, use what's in localStorage if available
          const savedData = localStorage.getItem('kanbanData');
          if (savedData && savedData !== JSON.stringify(this.app.data)) {
            // If there's different data in localStorage, sync it to server
            console.log('Syncing local data to server');
            this.syncData();
          }
        }
      } else if (response.status === 401) {
        // Token expired or invalid
        console.log('Authentication token expired or invalid');
        this.logout();
      } else {
        console.warn('Server returned error during data fetch:', response.status);
        // Try to parse error message if available
        try {
          const errorBody = await response.json();
          console.warn('Server error details:', errorBody);
        } catch (e) {
          // Ignore parsing errors
        }
      }
    } catch (error) {
      console.error('Data fetch error:', error);
      // Continue using local data if fetch fails
    }
  }

  /**
   * Log the user out
   */
  logout() {
    // Clear auth data
    this.authToken = null;
    this.email = null;
    this.isAuthenticated = false;

    // Close WebSocket connection
    this.closeWebSocket();
    
    // Stop sync interval
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    // Clear all localStorage data for security
    localStorage.clear();

    // Update UI
    document.querySelector('.user-info').style.display = 'none';
    
    // Show login form and reset app data
    this.app.data = {
      columns: [],
      tasks: [],
      unassignedCollapsed: true
    };
    this.app.renderBoard();
    this.loginOverlay.style.display = 'flex';
  }

  /**
   * Start periodic data synchronization
   */
  startDataSync() {
    // Clear any existing interval
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    // Initial sync
    this.syncData().then(() => {
      // Setup WebSocket after initial sync
      this.setupWebSocket();
    });
    
    // Setup sync interval as a fallback (60 seconds)
    this.syncIntervalId = setInterval(() => {
      this.syncData();
    }, 60000); // 60 seconds (longer interval since we have WebSockets)
  }

  /**
   * Synchronize data with the server
   */
  async syncData() {
    if (!this.isAuthenticated) return;

    try {
      console.log('Syncing data with server...');
      const response = await fetch('/api/data/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(this.app.data)
      });

      if (response.ok) {
        const body = await response.json();
        
        // Update localStorage and app data with merged data from server
        if (body.data) {
          console.log('Received merged data from server');
          
          // Store in localStorage
          localStorage.setItem('kanbanData', JSON.stringify(body.data));
          
          // Update app data with merged data
          this.app.data = body.data;
          
          // Re-render board with updated data
          console.log('Rendering board with updated data from sync');
          this.app.renderBoard();
        } else {
          console.warn('Server returned success but no data');
        }
        
        console.log('Data synchronized with server (two-way sync)');
        
        // Note: The server will broadcast changes to all other clients automatically
        // via the handlers.go SyncData function's call to hub.Broadcast
      } else if (response.status === 401) {
        // Token expired or invalid
        console.log('Authentication token expired or invalid');
        this.logout();
      } else {
        console.warn('Server returned error during sync:', response.status);
        // Try to parse error message if available
        try {
          const errorBody = await response.json();
          console.warn('Server error details:', errorBody);
        } catch (e) {
          // Ignore parsing errors
        }
      }
    } catch (error) {
      console.error('Data sync error:', error);
      // Continue using local data if sync fails
    }
  }
  
  /**
   * Setup WebSocket connection for real-time updates
   */
  setupWebSocket() {
    if (!this.isAuthenticated) {
      console.log('Cannot setup WebSocket: Not authenticated');
      return;
    }
    
    // If WebSocket exists and is connecting or open, don't create a new one
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('WebSocket already connected or connecting');
      return;
    }
    
    // Close existing connection if in closing or closed state
    this.closeWebSocket();
    
    try {
      // Create new WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      
      console.log('Attempting to connect WebSocket to:', wsUrl);
      
      // Create WebSocket with Authorization header in the URL
      this.ws = new WebSocket(`${wsUrl}?token=${this.authToken}`);
      
      // Handle connection open
      this.ws.onopen = () => {
        console.log('WebSocket connected successfully');
        
        // Send a ping message to verify connection is working
        const pingMessage = {
          type: 'ping',
          user: this.email,
          data: { timestamp: new Date().toISOString() }
        };
        
        console.log('Sending ping to verify connection:', pingMessage);
        this.ws.send(JSON.stringify(pingMessage));
        
        // Request latest data on connection to ensure we're in sync
        console.log('Requesting data sync after WebSocket connection');
        this.syncData();
      };
      
      // Handle messages
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received WebSocket message:', message.type);
          
          if (message.type === 'sync') {
            console.log('Received sync update from server');
            // Server is the source of truth - always apply its data
            this.app.data = message.data;
            localStorage.setItem('kanbanData', JSON.stringify(message.data));
            console.log('Rendering board with data from server');
            this.app.renderBoard();
          } else if (message.type === 'taskMove') {
            console.log('Received task move update:', message.data);
            
            // Handle the specific task move locally for faster response
            if (message.data && message.data.taskId) {
              // Find the task in our local data
              const taskId = message.data.taskId;
              const taskIndex = this.app.data.tasks.findIndex(t => t.id === taskId);
              
              if (taskIndex !== -1) {
                // Update the task's columnId (null for unassigned)
                const columnId = message.data.columnId;
                console.log(`Updating task ${taskId} columnId to ${columnId === null ? "null (unassigned)" : columnId}`);
                this.app.data.tasks[taskIndex].columnId = columnId;
                
                // Save to local storage
                localStorage.setItem('kanbanData', JSON.stringify(this.app.data));
                
                // Render the board with the updated task
                this.app.renderBoard();
              }
            }
            
            // After quick local update, still do a full sync to ensure consistency
            console.log('Requesting full data sync after taskMove message');
            this.syncData();
          } else if (message.type === 'pong') {
            console.log('Received pong from server');
          } else {
            console.log('Unhandled message type:', message.type);
            // For unknown message types, do a full sync to ensure consistency
            this.syncData();
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
          // Request a full sync if we encounter an error
          this.syncData();
        }
      };
      
      // Handle errors
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Trigger a sync after an error to ensure data consistency
        console.log('Triggering data sync after WebSocket error');
        setTimeout(() => this.syncData(), 1000);
      };
      
      // Handle disconnection
      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
        
        // Only attempt to reconnect if still authenticated and not a normal closure
        if (this.isAuthenticated && event.code !== 1000) {
          console.log('Attempting to reconnect in 3 seconds...');
          // Clear any existing reconnection timer
          if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
          }
          
          // Set up reconnection timer
          this.wsReconnectTimer = setTimeout(() => {
            console.log('Reconnecting WebSocket now');
            this.setupWebSocket();
            
            // Perform a sync after reconnection to catch any missed updates
            setTimeout(() => {
              console.log('Syncing data after WebSocket reconnection');
              this.syncData();
            }, 1000);
          }, 3000);
        }
      };
      
      // Set up a heartbeat to keep the connection alive and detect stale connections
      this.heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({
              type: 'ping',
              user: this.email,
              data: { timestamp: new Date().toISOString() }
            }));
          } catch (error) {
            console.error('Error sending heartbeat:', error);
            this.closeWebSocket();
            this.setupWebSocket();
          }
        }
      }, 15000); // Send heartbeat every 15 seconds for more responsive connection maintenance
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
    }
  }
  
  /**
   * Close WebSocket connection
   */
  closeWebSocket() {
    // Clear any reconnection timer
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Close WebSocket if it exists
    if (this.ws) {
      // Only attempt to close if not already closed
      if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
        this.ws.onclose = null; // Disable the reconnection
        this.ws.onerror = null; // Disable error handler during manual closing
        try {
          this.ws.close(1000, "Normal closure");
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
      }
      this.ws = null;
    }
  }
}

export default AuthManager;
