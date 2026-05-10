import { z } from "@hono/zod-openapi";

export const NoteBody = z
  .object({
    url: z
      .string()
      .url()
      .openapi({ example: "https://example.com/article" }),
    body: z
      .string()
      .min(1)
      .max(500)
      .openapi({ example: "This article contains misleading statistics." }),
  })
  .openapi("NoteBody");

export const NoteOut = z
  .object({
    id: z.number().openapi({ example: 1 }),
    url: z.string().openapi({ example: "https://example.com/article" }),
    body: z
      .string()
      .openapi({ example: "This article contains misleading statistics." }),
    authorId: z.number().openapi({ example: 2 }),
    authorEmail: z.string().openapi({ example: "student@uni.edu" }),
    createdAt: z
      .string()
      .openapi({ example: "2024-01-15T10:00:00.000Z" }),
    score: z.number().openapi({ example: 3 }),
  })
  .openapi("Note");

export const VoteBody = z
  .object({
    value: z
      .union([z.literal(1), z.literal(-1)])
      .openapi({ example: 1 }),
  })
  .openapi("VoteBody");

export const VoteOut = z
  .object({
    noteId: z.number().openapi({ example: 1 }),
    value: z.number().openapi({ example: 1 }),
  })
  .openapi("VoteOut");

export const RegisterBody = z
  .object({
    email: z.string().email().openapi({ example: "student@uni.edu" }),
    password: z.string().min(8).openapi({ example: "supersecret" }),
  })
  .openapi("RegisterBody");

export const UserOut = z
  .object({
    id: z.number().openapi({ example: 1 }),
    email: z.string().openapi({ example: "student@uni.edu" }),
  })
  .openapi("User");

export const AuthResponse = z
  .object({
    token: z.string().openapi({ example: "eyJhbGci..." }),
    user: UserOut,
  })
  .openapi("AuthResponse");

export const LoginBody = z
  .object({
    email: z.string().email().openapi({ example: "student@uni.edu" }),
    password: z.string().min(1).openapi({ example: "supersecret" }),
  })
  .openapi("LoginBody");

export const ErrorResponse = z
  .object({
    error: z.string().openapi({ example: "Email already in use" }),
  })
  .openapi("ErrorResponse");

export const MessageResponse = z
  .object({
    message: z.string().openapi({ example: "Signed out" }),
  })
  .openapi("MessageResponse");
