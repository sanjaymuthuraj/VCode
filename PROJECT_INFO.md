# VCode Collaborative Web App

Welcome to **VCode Collaborative**, a real-time pair programming web application featuring collaborative code editing, group chat, and WebRTC video calling. 

The application is structured as two separated components:
1. **Frontend (Browser UI)**: Built with Webpack 5, Monaco Editor, and Vanilla CSS.
2. **Backend (API & WebSockets)**: A Java Spring Boot application handling room states, messaging, and WebRTC peer signaling.

---

## 1. Prerequisites

Before running the application, make sure you have the following installed:
* **Java Development Kit (JDK 17 or higher)**
* **Node.js (v16.0 or higher) and npm**

---

## 2. Running the Backend Server

The backend runs on port **`8080`** by default.

1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Build and run the Spring Boot application using Maven:
   * **If Maven (`mvn`) is installed globally:**
     ```bash
     mvn spring-boot:run
     ```
   * **Using the portable Maven wrapper provided in the root directory:**
     ```bash
     ..\maven\apache-maven-3.9.6\bin\mvn.cmd spring-boot:run
     ```

The server is up when you see the log:
`Tomcat started on port 8080 (http) with context path '/'`

---

## 3. Building and Running the Frontend

The frontend is served separately on port **`8081`**.

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies (if not already done):
   ```bash
   npm install
   ```
3. Compile the production bundles:
   ```bash
   npm run build
   ```
   *This compiles the source files (`renderer.js`, `index.html`, `style.css`) and Monaco workers into the `frontend/dist/` directory.*
4. Start a local HTTP server to host the static files:
   ```bash
   npx http-server dist -p 8081
   ```

---

## 4. Using the Application

1. Open your browser and navigate to:
   ```
   http://localhost:8081
   ```
2. Enter your display name.
3. Choose either:
   * **Create New Room**: Generates a 6-character room code and opens a new workspace.
   * **Join Room**: Enter an existing room code to join other developers.
4. **Chat & Cursors**: Send messages in the sidebar chat. You will see remote cursor coordinates in real-time as other users join the room and write code.
5. **Video Call**: Click "Join Video Call" in the sidebar to stream your webcam. The application uses full-mesh WebRTC to connect active users.