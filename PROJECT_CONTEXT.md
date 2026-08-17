# Project Context

## Purpose
This document tracks the project's stack, requirements, and implementation rules.

## Current Tech Stack
1. Frontend + Backend: Next.js App Router + Tailwind CSS (single Next.js app with API routes)
2. Database: PostgreSQL (local)
3. ORM: Drizzle ORM (+ Drizzle Kit)
4. Authentication: NextAuth (credentials + mobile OTP flow APIs)
5. UI + Utilities: Radix UI, Framer Motion, TanStack Table

## Product Requirements
- Login and signup flows for user access.
- Support email + password account creation.
- Support mobile number entry and OTP verification.
- Check if mobile number account already exists.
- For new users, collect name, email, password, and required details.
- For existing users, route to home screen after successful verification.
- Forgot password flow must support mobile + OTP + password reset.
- Show clear invalid login messages for wrong credentials or invalid state.
- Request location access after successful authentication to support pickup and nearby driver experience.
- Home screen should expose core travel actions.

## Engineering Rules
- Keep route handlers in src/app/api.
- Keep database schema in src/lib/schema.ts and connection in src/lib/db.ts.
- Validate request payloads with zod before DB/auth logic.
- Hash all passwords with bcrypt before storing.
- Never expose raw OTP in production logs or API responses.
- Use environment variables for secrets and database connection strings.

## Notes
- OTP implementation in this phase is local-development friendly and should be connected to an SMS provider before production.
