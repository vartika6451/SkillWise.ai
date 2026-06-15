# SkillWise.ai - AI Technical Interviewer

SkillWise.ai is a premium, real-time, sandbox-driven AI Technical Interviewer that simulates a live engineering panel interview. By combining GitHub metadata extraction, voice recognition, and real-time facial expression tracking, it evaluates software engineering candidates on coding correctness, communication clarity, pacing, stress handling, and system design.

## 🖥️ Screen Previews

| Landing Page | Live Interview Room |
| :---: | :---: |
| ![SkillWise.ai Landing Screen](./assets/landing_page.png) | ![SkillWise.ai Live Interview Room](./assets/interview_page.png) |

---

## 🚀 Key Features

* **GitHub Portfolio Customization**: Input your GitHub profile URL to scrape active bios, pinned repositories, and languages, tailoring the interview prompts to your real-world coding style.
* **Speech & Voice Synthesis**:
  * **Speech-to-Text**: Voice capture powered by browser Web Speech API.
  * **Text-to-Speech**: Speech synthesis utilizing natural-sounding assistant voice profiles.
  * *Text Fallback overrides are supported for quiet environments.*
* **Speech & Tempo Analytics**: Tracks speech duration, words per minute (WPM), and counts filler word hesitations (*um, uh, like, actually*).
* **AI Facial Expression HUD & Vibe Coaching**:
  * Uses the client camera stream (with local mirrored 4:3 grid scaling) to monitor candidate visibility.
  * Animates a cybernetic real-time HUD showing eye-contact consistency, stress levels, and attentiveness.
  * Captures frame snapshots during answers and runs multimodal Gemini evaluation to detect expressions (*Confident, Nervous, Puzzled*).
  * Adapts the interviewer's guiding tone dynamically based on candidate body language.
  * *Mock representation of HUD interface metrics:*
    ![SkillWise.ai HUD Mockup](./assets/dashboard_hud_mockup.png)
* **Hiring Panel Deliberation**: Concludes interviews (5-question limit) by simulating a panel evaluation from three distinct AI personas:
  1. **Tech Lead**: Evaluates React/frontend coding depth and TypeScript correct patterns.
  2. **System Architect**: Analyzes scaling, API layouts, performance, and caching.
  3. **Engineering Manager**: Assesses communication pacing, collaboration, and readiness.

---

## 🔍 Detailed Feature Analysis & Implementation

### 1. GitHub Portfolio Scraper & Prompt Customization
* **Scraper Module (`apps/backend/scrapers/github.ts`)**: Connects to the GitHub API/HTML Scraper to fetch user details (Bio, public repo count, follower count, and language distribution).
* **Contextual Interview Prompts**: The parsed profile data is injected as state context directly into the AI prompts. The interviewer references actual repository names, languages, and technical frameworks found in the candidate's GitHub profile to initiate realistic technical follow-ups.

### 2. Conversational Voice Engine (STT & TTS)
* **Speech-to-Text (`SpeechRecognition`)**: Implemented client-side in the React client. Captures continuous speech, streams interim translation results live to the HUD, and pauses input automatically during candidate pauses.
* **Text-to-Speech (`SpeechSynthesis`)**: Speaks the AI technical interviewer's follow-up questions aloud. Custom voice selections are configured using high-fidelity natural assistant options (e.g. Google Premium or Natural voices) with complete mute controls.

### 3. Speech Speed & Pacing Metrics
* **WPM (Words Per Minute)**: Calculates the length of the string response split by space, divided by the active capture duration, mapping standard verbal pacing rates.
* **Filler Word Tracking**: Uses string matching regular expressions (`/\b(um|uh|like|so|actually|you know)\b/gi`) to count filler words and flag nervous speech pacing.

### 4. Multimodal Face Tracking & Visual Vibe Coaching
* **Video Feed & Mirror Styling**: Requests camera media feed at 400x300 canvas capture resolution. Rendered with custom CSS retro CRT styling and scanlines, mirrored horizontally to match natural physical movements.
* **Mirrored Snapshot Canvas**: Extracts a canvas snapshot as a base64 string on answer submissions:
  ```typescript
  ctx.translate(320, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoRef.current, 0, 0, 320, 240);
  const base64Data = canvas.toDataURL("image/jpeg", 0.7);
  ```
* **Gemini Multimodal Vibe Detection**: Transmits the base64 snapshot to the backend where the Gemini model detects candidate expressions (e.g. *Confident, Nervous, Puzzled*), eye contact focus state, and applies real-time coaching corrections.
* **Vibe Feedback UI HUD**: Updates eye contact indexes, visual stance metrics, and presents visual coaching guidance advice natively in the Left Panel card.

### 5. Multi-Persona Hiring Panel Deliberation
At the end of the 5-question limit, the interview status is updated to `COMPLETED` and the frontend triggers the deliberation assessment:
* **Tech Lead (Code Depth)**: Assesses react lifecycles, ts syntax depth, hooks performance.
* **System Architect (Scalability)**: Assesses scalability, API routing, query caching, DB transaction bounds.
* **Engineering Manager (Soft Skills)**: Assesses composure, verbal tempo, visual cues, collaborative tone.
* All deliberations output clean JSON mapping panel opinions, strengths list, and scores.

---

## 🔄 System Flow & User Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate (Browser)
    participant Client as Frontend SPA (React)
    participant Server as Backend API (Express)
    participant Database as Database (Prisma / PostgreSQL)
    participant Gemini as Multimodal AI (Gemini 2.5-Flash)

    Candidate->>Client: Input GitHub URL & Grant Camera/Mic Perms
    Client->>Server: POST /api/v1/pre-interview { github }
    Server->>Server: Scrape GitHub Username Profile
    Server->>Database: Create Interview Record (Status: Pre)
    Server-->>Client: Return Profile Data & Interview ID
    
    Candidate->>Client: Click "Start Voice Interview"
    Client->>Client: Play welcome speech & Start voice capture

    loop For Questions 1 to 5
        Candidate->>Client: Answer Question (Voice / Type)
        Client->>Client: Capture webcam canvas frame (base64)
        Client->>Server: POST /chat { message, image }
        Server->>Gemini: Multimodal analysis (Image + Conversation Prompt)
        Gemini-->>Server: Return structured JSON { text, emotion, eyeContact, guidance }
        Server-->>Client: Return JSON payload
        Client->>Database: POST /api/v1/interview/:id/question (transcripts + metrics)
        Client->>Client: Update Vibe HUD & Speak next question
    end

    Candidate->>Client: Finish Interview
    Client->>Server: POST /api/v1/interview/:id/assess
    Server->>Database: Query all interview questions + visual metrics
    Server->>Gemini: Deliberate hiring scorecard
    Gemini-->>Server: Return detailed scorecard JSON
    Server->>Database: Save panel evaluation & status = COMPLETED
    Server-->>Client: Return final assessment data
    Client->>Candidate: Render detailed hiring panel dashboard
```

---

## 📁 Repository Structure

This monorepo is managed by [Turborepo](https://turbo.build/) and [Bun](https://bun.sh/):

```
├── apps/
│   ├── backend/          # Express + Prisma + Gemini API SDK
│   └── frontend/         # React + TailwindCSS + Web Speech + Camera canvas
├── packages/             # Shared configs (ESlint, TypeScript)
├── turbo.json            # Monorepo build and pipeline cache
└── package.json          # Root configuration
```

---

## 🛠️ Tech Stack

* **Frontend**: React (v19), React Router (v7), TailwindCSS, Radix UI primitives, Lucide Icons.
* **Backend**: Express, TypeScript, Bun, Prisma ORM, PostgreSQL.
* **Artificial Intelligence**: Google Gemini API via the official `@google/genai` SDK (`gemini-2.5-flash`, `gemini-2.0-flash`).

---

## ⚙️ Local Setup

### 1. Prerequisites
Ensure you have [Bun](https://bun.sh/) installed on your machine.

### 2. Environment Variables
Create a `.env` file inside the `apps/backend/` directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/ai_interviewer?schema=public"
GEMINI_API_KEY="your-gemini-api-key-here"
```

### 3. Install Dependencies
Run the following command in the root folder of the repository:

```bash
bun install
```

### 4. Database Initialization
Run Prisma migrations to set up the PostgreSQL database schemas for `Interview` and `Question` records:

```bash
cd apps/backend
bunx prisma db push
```

### 5. Running the Application
From the repository root, start both the backend and frontend dev servers concurrently:

```bash
bun run dev
```

* **Frontend** runs on: `http://localhost:5173`
* **Backend API** runs on: `http://localhost:3001`

---

## 🔍 Verification & Testing

Verify that everything builds successfully before pushing:

```bash
# Build both monorepo applications
bun run build
```
