# PhishGuard Mobile App

PhishGuard is a React Native mobile application built with Expo and Expo Router.
It provides phishing-awareness training flows, quiz-based learning, achievement tracking,
and authentication screens with biometric support.

This README is designed for developers who want to run, test, and extend the app locally.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Detailed Setup](#detailed-setup)
6. [Environment and Secrets](#environment-and-secrets)
7. [Run Targets](#run-targets)
8. [Project Structure](#project-structure)
9. [Troubleshooting](#troubleshooting)
10. [Build and Release Notes](#build-and-release-notes)

## Overview

Main functional areas:

- Authentication flows (login, signup, forgot password, OAuth callback)
- Optional biometric login using secure local storage
- Classic and visual phishing quizzes
- Training modules and progression
- Achievement catalog and toast notifications
- Local mobile-first UI with Expo Router navigation

## Tech Stack

- React 19
- React Native 0.81
- Expo SDK 54 (managed workflow)
- Expo Router (file-based routing)
- TypeScript
- Supabase JS client (auth/data integration points)
- AsyncStorage, SecureStore, SQLite and supporting Expo modules

## Prerequisites

Install the following tools before setup:

- Node.js LTS (recommended: 18.x or 20.x)
- npm (bundled with Node.js)
- Git
- Expo Go on a physical device (Android or iOS), optional but recommended

Platform-specific requirements:

- Android local build/emulator:
	- Android Studio
	- Android SDK and at least one emulator image
- iOS local build (macOS only):
	- Xcode
	- CocoaPods

Optional but useful:

- EAS CLI for cloud builds and internal distribution

## Quick Start

Run these commands from the project root:

```bash
npm install
npm run start
```

Then:

1. Open the QR code in Expo Go on your phone, or
2. Press `a` for Android emulator, or
3. Press `w` for web preview.

## Detailed Setup

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd PHISHGUARD
```

### 2. Install dependencies

```bash
npm install
```

This installs runtime and development dependencies defined in `package.json`.

### 3. Start the Expo development server

```bash
npm run start
```

By default this project uses tunnel mode:

- Script value: `expo start --tunnel`
- Best for physical-device testing across different networks

### 4. Verify the app launches

When Metro starts, test at least one target:

- Expo Go scan (recommended first run)
- Android emulator
- Web preview

If the app fails to boot, check the troubleshooting section below.

## Environment and Secrets

The app currently reads Supabase configuration from Expo extra config values
inside `app.json`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The Supabase client initialization throws an error if these values are missing.

Recommended team workflow:

1. Do not keep production secrets in versioned config files.
2. Move environment-specific values to secure environment management.
3. Keep separate values for local, preview, and production builds.

## Run Targets

Available scripts:

- `npm run start`:
	- Starts Expo with tunnel networking.
- `npm run start:local`:
	- Starts dev-client mode with localhost host strategy.
- `npm run android`:
	- Runs native Android build and launches on connected device/emulator.
- `npm run ios`:
	- Runs native iOS build (macOS only).
- `npm run web`:
	- Starts web target in browser.

### Expo Go flow (fastest iteration)

1. Run `npm run start`.
2. Open Expo Go on your mobile device.
3. Scan the QR code shown in terminal/DevTools.
4. Wait for bundle compilation.

### Android emulator flow

1. Start an emulator from Android Studio Device Manager.
2. Run `npm run start` or `npm run android`.
3. If using Expo start, press `a` in terminal.

### iOS simulator flow (macOS)

1. Start iOS Simulator from Xcode.
2. Run `npm run ios`.

### Web flow

1. Run `npm run web`.
2. Open the local URL shown in the terminal.

## Project Structure

High-level structure:

```text
PHISHGUARD/
|- app/                    # Expo Router routes (screens and navigation)
|  |- (auth)/              # Authentication-related screens
|  |- (mock)/              # Mock/demo routes
|  |- classic-quiz/        # Classic quiz flow routes
|  |- training/            # Training routes
|  |- visual-quiz/         # Visual quiz flow routes
|  |- _layout.tsx          # Root layout and navigation container
|  |- index.tsx            # Entry route
|  |- home.tsx             # Main user landing screen
|- src/
|  |- achievements/        # Achievement domain logic and providers
|  |- auth/                # Auth provider, Supabase wiring, role logic
|  |- db/                  # Local database schema and seed utilities
|  |- repos/               # Data access repositories
|  |- types/               # Shared TypeScript models/types
|  |- theme.ts             # Theme tokens
|  |- ui.ts                # UI helpers/constants
|- assets/                 # Static app assets
|- docs/                   # Supporting project documentation
|- android/                # Native Android project (generated/maintained)
|- app.json                # Expo app configuration
|- eas.json                # EAS build profiles
|- package.json            # Scripts and dependency manifest
```

## Troubleshooting

Common issues and fixes:

1. Metro cache issues
	 - Run: `npx expo start -c`

2. Dependency mismatch after SDK changes
	 - Delete `node_modules` and lockfile
	 - Reinstall with `npm install`

3. Android build failures
	 - Confirm Android SDK path and emulator setup
	 - Run from root: `npm run android`

4. iOS build failures (macOS)
	 - Ensure Xcode command line tools are installed
	 - Re-run `npm run ios`

5. Supabase initialization error at startup
	 - Confirm both required Expo extra values exist in `app.json`

## Build and Release Notes

This repository includes `eas.json` profiles:

- `development`: development client, internal distribution
- `preview`: internal distribution builds
- `production`: production build profile with auto-incrementing version

Typical EAS workflow:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

Adjust platform/profile according to your release pipeline.