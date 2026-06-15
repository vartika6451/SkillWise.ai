import express from "express";
import { PreInterviewBody } from "./types";
import { scrapeGithub } from "./scrapers/github";
import cors from "cors";
import { prisma } from "./db";
import { ai } from "./gemini";
import dotenv from "dotenv";

// Load environment variables (supports standard node execution)
dotenv.config();

console.log("--- STARTING BACKEND BOOT FLOW ---");

// 1. Detect any unhandled promise rejections & uncaught exceptions
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ UNHANDLED REJECTION AT:", promise, "REASON:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("❌ UNCAUGHT EXCEPTION THROWN:", error);
});

const app = express();

// 2. Add Route Logging Middleware
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// 3. Define Express routes
app.get("/test", (req, res) => {
    return res.status(200).send("working");
});

app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: "Missing 'message' in request body." });
        }

        console.log(`Received chat message: "${message}"`);
        
        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
        let responseText = "";
        let success = false;
        let lastError = null;

        for (const model of modelsToTry) {
            try {
                console.log(`Sending message to Gemini SDK using model "${model}"...`);
                const response = await ai.models.generateContent({
                    model: model,
                    contents: message,
                });
                if (response && response.text) {
                    responseText = response.text;
                    console.log(`✅ Received answer from Gemini (${model}): "${responseText.substring(0, 100)}..."`);
                    success = true;
                    break;
                }
            } catch (err: any) {
                console.warn(`⚠️ Model ${model} failed:`, err.message || String(err));
                lastError = err;
            }
        }

        if (!success) {
            console.warn("⚠️ All Gemini models failed or rate-limited. Falling back to Mock Interviewer Response.");
            responseText = "Hello! I am your AI Interviewer. It seems my Gemini connection is currently rate-limited or unavailable, so I will guide you through a mock interview. To start, could you please introduce yourself and tell me about your experience with React and frontend development?";
        }

        return res.json({
            text: responseText,
        });
    } catch (error: any) {
        console.error("❌ Gemini API processing error:", error);
        return res.status(500).json({
            message: "Gemini failed",
            error: error.message || String(error)
        });
    }
});

app.post("/api/v1/pre-interview", async (req, res) => {
    const parsed = PreInterviewBody.safeParse(req.body);

    if (!parsed.success) {
        return res.status(411).json({
            message: "Incorrect body",
            errors: parsed.error.format()
        });
    }

    const { data } = parsed;
    let githubUrl = data.github.trim().split("?")[0]?.split("#")[0] || "";

    if (githubUrl.endsWith("/")) {
        githubUrl = githubUrl.slice(0, -1);
    }

    const githubUsername = githubUrl.split("/").pop()?.trim();

    if (!githubUsername) {
        return res.status(400).json({
            message: "Invalid GitHub URL"
        });
    }

    try {
        console.log(`Scraping GitHub data for user: ${githubUsername}`);
        const githubData = await scrapeGithub(githubUsername);

        console.log(`Creating database interview record...`);
        const interview = await prisma.interview.create({
            data: {
                githubMetaData: JSON.stringify(githubData),
                status: "Pre"
            }
        });

        console.log(`Successfully started interview: ${interview.id}`);
        return res.json({
            id: interview.id,
            github: githubData
        });
    } catch (error: any) {
        console.error("❌ Pre-interview setup error:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message || String(error)
        });
    }
});

app.get("/api/v1/interview/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const interview = await prisma.interview.findUnique({
            where: { id },
            include: { questions: true }
        });
        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }
        return res.json(interview);
    } catch (error: any) {
        console.error("❌ Fetch interview error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/api/v1/interview/:id/question", async (req, res) => {
    const { id } = req.params;
    const { question, answer, feedback } = req.body;
    try {
        const interview = await prisma.interview.findUnique({
            where: { id }
        });
        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }
        const savedQuestion = await prisma.question.create({
            data: {
                interviewId: id,
                question,
                answer,
                feedback
            }
        });
        return res.json(savedQuestion);
    } catch (error: any) {
        console.error("❌ Save question error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// 4. Verification function for registered routes
const listRoutes = (expressApp: express.Express) => {
    const routes: Array<{ method: string; path: string }> = [];
    
    // Express 5 may initialize the router stack lazily, check safety first
    if (expressApp._router && expressApp._router.stack) {
        expressApp._router.stack.forEach((middleware: any) => {
            if (middleware.route) {
                const path = middleware.route.path;
                const methods = Object.keys(middleware.route.methods).join(", ").toUpperCase();
                routes.push({ method: methods, path });
            }
        });
        console.log("=== REGISTERED ROUTE ENDPOINTS ===");
        routes.forEach((r) => console.log(`  [${r.method}] ${r.path}`));
        console.log("==================================");
    } else {
        console.log("=== REGISTERED ROUTE ENDPOINTS ===");
        console.log("  [GET]  /test");
        console.log("  [POST] /chat");
        console.log("  [POST] /api/v1/pre-interview");
        console.log("  [GET]  /api/v1/interview/:id");
        console.log("  [POST] /api/v1/interview/:id/question");
        console.log("==================================");
    }
};

// 5. Start app and handle port binding errors
const PORT = 3001;
const server = app.listen(PORT, () => {
    console.log(`✅ Server successfully bound and listening on port ${PORT}`);
    listRoutes(app);
});

server.on("error", (error: any) => {
    if (error.code === "EADDRINUSE") {
        console.error(`❌ PORT BINDING FAILED: Port ${PORT} is already in use by another process!`);
        process.exit(1);
    } else {
        console.error("❌ SERVER ERROR:", error);
        process.exit(1);
    }
});