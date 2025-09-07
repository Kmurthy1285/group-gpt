# Multi-Person GPT Chat — Next.js Starter

## What you get
- Next.js 14 (App Router) full-stack app
- Room links you can share (anyone with the URL can join)
- Realtime multi-user messaging via Supabase Realtime
- GPT replies per room using OpenAI's Responses/Conversations APIs
- Server-side streaming to clients (EventSource)
- Minimal UX: set a display name, create/join room, chat with friends + GPT

## Quick start

1) **Create a Supabase project** (free tier is fine): https://supabase.com

2) **In the Supabase SQL editor, run the schema** in `supabase/schema.sql`

3) **Create an `.env.local`** (copy `env.example`) and fill:
   - `OPENAI_API_KEY=<your key>`
   - `OPENAI_MODEL=gpt-4o-mini`
   - `SUPABASE_URL=https://YOUR.supabase.co`
   - `SUPABASE_ANON_KEY=...` (anon public key)
   - `SUPABASE_SERVICE_ROLE=...` (service role) // used only in server routes

4) **Install dependencies and run**:
   ```bash
   npm install
   npm run dev
   ```

5) **Create a room at `/` and share the URL**

## Notes
- This starter uses the OpenAI Responses API by default (simple, future-proof), but you can switch to the Conversations API by toggling `USE_CONVERSATIONS` in `lib/ai.ts`
- No authentication: users set a display name saved in localStorage
- GPT is a virtual participant named "ChatGPT"
- Safety: never expose your service role key to the client. It is used only in server actions/API routes

