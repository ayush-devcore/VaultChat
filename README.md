# 🔐 VaultChat
### Zero-Trust, End-to-End Encrypted Real-Time Messaging Platform

![VaultChat Architecture](https://img.shields.io/badge/Architecture-Zero%20Trust-black?style=for-the-badge&logo=security)
![Encryption](https://img.shields.io/badge/Encryption-ECDH%20%2B%20AES--256--GCM-pink?style=for-the-badge)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite%20PWA-yellow?style=for-the-badge&logo=react)
![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)
![Database](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql)

VaultChat is a high-performance, production-ready secure messaging platform designed with a strict **Zero-Trust Architecture**. The server never sees your plaintext messages, never derives your shared secrets, and never has access to your private keys. 

Wrapped in a striking, uncompromising **Neo-Brutalist design system** and built as an installable **Progressive Web App (PWA)**, VaultChat brings enterprise-grade cryptography to a consumer-grade UX.

---

## 🔥 Key Features

- **End-to-End Encryption (E2EE)**: Powered by the native Web Crypto API (`window.crypto.subtle`). Every message and file is encrypted client-side using AES-256-GCM.
- **Automated ECDH Key Exchange**: Seamless Diffie-Hellman P-256 key exchange. Public keys are shared via the server, shared secrets are derived locally.
- **💀 The "Void" Timer (Ephemeral Messaging)**: Synchronized, aggressive self-destruct mechanism. Messages are permanently wiped from the React state and DOM after 10 or 30 seconds.
- **Encrypted Media Payloads**: Securely transmit images and documents. Files are read as `ArrayBuffer`s, encrypted locally, relayed as opaque Base64 blobs, and reconstructed via `ObjectURLs` on the recipient's machine.
- **Neo-Brutalist PWA**: Fully installable native-like experience on iOS, Android, and Desktop. High-contrast typography, harsh shadows, and stark colors.

---

## 🏗️ Architecture & Threat Model

VaultChat operates on a relay model. The FastAPI server acts purely as a dumb pipe and offline storage queue.

1. **Key Generation**: Upon registration, the browser generates a P-256 key pair. The private key never leaves `IndexedDB`. The public key is uploaded to PostgreSQL.
2. **The Handshake**: When Alice messages Bob, her browser fetches Bob's public key and derives a shared AES-256-GCM secret locally.
3. **The Transmission**: Alice's browser generates a random 12-byte IV, encrypts the payload, and sends `{ciphertext, iv}` over WebSockets.
4. **The Relay**: The server routes the JSON blob to Bob. If Bob is offline, the server queues the blob. **The server cannot decrypt the blob.**

---

## 🚀 Deployment Guide (Zero-Cost Stack)

This repository is pre-configured for instant, free deployment using **Netlify** (Frontend), **Koyeb** (Backend), and **Neon.tech** (PostgreSQL).

### Step 1: PostgreSQL on Neon.tech
1. Create a free account on [Neon.tech](https://neon.tech).
2. Create a new project and database (`vaultchat`).
3. Copy the provided connection string. It will look like:
   `postgres://user:password@ep-cool-name.neon.tech/vaultchat`

### Step 2: FastAPI Backend on Koyeb
1. Create a free account on [Koyeb](https://www.koyeb.com/).
2. Click **Create Service** and connect your GitHub repository.
3. Set the **Run Command** to use the provided `Procfile` or explicitly set:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Under **Environment Variables**, add:
   - `DATABASE_URL`: Your Neon connection string (the app will automatically upgrade `postgres://` to `postgresql+asyncpg://`).
   - `JWT_SECRET_KEY`: A random cryptographic string (e.g., `openssl rand -hex 32`).
   - `ALLOWED_ORIGINS`: `https://your-frontend-name.netlify.app`
5. Deploy. Koyeb will automatically install dependencies from `backend/requirements.txt`.

### Step 3: React PWA on Netlify
1. Log into [Netlify](https://www.netlify.com/) and click **Add new site** -> **Import an existing project**.
2. Connect your GitHub repository.
3. Set the **Base directory** to `frontend`.
4. Set the **Build command** to `npm run build`.
5. Set the **Publish directory** to `frontend/dist`.
6. Under **Environment variables**, add:
   - `VITE_API_URL`: `https://your-backend-app.koyeb.app`
   - `VITE_WS_URL`: `wss://your-backend-app.koyeb.app`
7. Deploy. Your Neo-Brutalist, E2EE Progressive Web App is now live.

---

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- Python 3.10+

### Start the Backend (SQLite)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Start the Frontend (Vite)
```bash
cd frontend
npm install
npm run dev
```

*VaultChat uses Vite's proxy to route `/api` and `/ws` to `localhost:8000` during development, avoiding CORS issues.*

---
*Built with zero trust. Stay secure.*
