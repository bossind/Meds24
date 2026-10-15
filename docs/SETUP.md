# Meds24 Setup Guide

Welcome to Meds24 — Your Trusted Healthcare Partner.

## Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## Installation Steps

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure Environment Variables:
   Copy `.env.example` to `.env` and fill in your configuration:
   ```bash
   cp .env.example .env
   ```
   Set your PostgreSQL connection string in `DATABASE_URL`.

3. Initialize Database:
   The backend automatically runs schema initialization and seeds initial categories and products on startup. You can also run schema queries manually using `database/schema.sql`.

4. Run Development Server:
   ```bash
   npm run dev
   ```
   This starts the Express server and Vite middleware on `http://localhost:3000`.
