import z from "zod";

export const PreInterviewBody = z.object({
    github: z.string(),
    selectedRepos: z.array(z.string()).optional(),
    resume: z.object({
        base64: z.string().optional(),
        fileName: z.string().optional(),
        fileType: z.string().optional()
    }).optional()
})