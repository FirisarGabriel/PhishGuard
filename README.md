# PhishGuard – Part II (UI-Only Prototype)

High-fidelity **UI prototype** for the **authentication and onboarding flows**.  
The app is built with **Expo (managed)** and runs entirely in **Expo Go**, with no backend logic — only user interface and mock interactions.

---

## Requirements

- Node.js LTS (>= 18)
- A mobile device with **Expo Go** installed (Android / iOS)
- Internet connection (recommended: use `--tunnel` mode for Expo)
- Optional: Android Emulator or Web Preview for local testing

---

## Installation & Run

```bash
cd ui
npm install
npm start -- --tunnel
```

## Project Structure

```
ui/
├─ app/
│  ├─ _layout.tsx                # Root layout with Stack + SafeArea
│  ├─ index.tsx                  # Redirects to biometric login if enabled
│  ├─ home.tsx                   # Main screen (three-button pyramid layout)
│  ├─ settings.tsx               # Toggle for biometric login (mock)
│  ├─ (auth)/
│  │  ├─ login.tsx               # Email/password form, validation, errors (mock)
│  │  ├─ signup.tsx              # Account creation + password strength indicator
│  │  ├─ forgot.tsx              # Reset password (mock)
│  │  ├─ biometric-enable.tsx    # Prompt to enable biometrics after first login
│  │  └─ biometric-login.tsx     # Biometric authentication screen (mock)
│  └─ (mock)/
│     ├─ training.tsx
│     ├─ classic-quiz.tsx
│     └─ visual-quiz.tsx
├─ src/
│  ├─ secure.ts                  # Stores biometricEnabled flag (SecureStore)
│  ├─ ProviderButton.tsx         # Branded buttons (Google, Apple, Guest)
│  ├─ Feedback.tsx               # Error banners + loading overlays
│  ├─ theme.ts                   # Global colors, fonts, spacing
│  └─ PasswordStrength.tsx       # Password strength meter component
└─ package.json / app.json
```