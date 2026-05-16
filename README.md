# Health Vitals Tracker

Health Vitals Tracker is a production-ready application for parsing, extracting, and securely tracking clinical lab measurements from your medical reports. It processes PDF, CSV, XLSX, DOCX, and image files to build a comprehensive history of your health metrics.

**Deployed URL:** [https://vitals-tracker-353564299092.us-central1.run.app](https://vitals-tracker-353564299092.us-central1.run.app)

## Features

- **Multi-format Support:** Upload lab reports via PDF, CSV, Excel, Word, or plain text.
- **OCR Integration:** Automatically reads text from image files (PNG, JPG, WebP) using Tesseract.js.
- **Smart Date Extraction:** Intelligently extracts the test or sample collection date directly from your reports.
- **Interactive UI:** Smooth Drag & Drop upload experience with an integrated side-by-side file viewer when manual date verification is needed.
- **Secure Persistent Storage:** Backed by Google Cloud SQL (PostgreSQL) for relational data and Google Cloud Storage (GCS) for securely keeping uploaded files.
- **Authentication:** Integrated Google Sign-In with NextAuth (Auth.js) edge-compatible setup.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React, Tailwind CSS, FontAwesome
- **Backend/API:** Next.js Server Actions & API Routes, Node.js Runtime
- **Database:** PostgreSQL (Google Cloud SQL), Prisma ORM
- **File Storage:** Google Cloud Storage
- **Parsing Engines:** `pdfjs-dist` (Layout-aware), `mammoth`, `csv-parse`, `xlsx`, `tesseract.js`
- **Deployment:** Docker, Google Cloud Run

## Architecture Overview

```mermaid
graph TD
    User([User]) -->|Authenticates via Google| Auth[NextAuth.js edge middleware]
    User -->|Drags & Drops Report| UI[Upload UI - Next.js]
    
    UI -->|Sends Form Data| API[API Route: /api/reports/upload]
    
    API -->|1. Parse Document| Parser[Ingest Engine]
    Parser -->|Regex/Heuristics| DateExtractor[Extract Test Date]
    Parser -.->|Uses| Tesseract(OCR for Images)
    Parser -.->|Uses| PDFParse(PDF Extraction)
    
    API -->|2. Check Date| DateCheck{Date Found?}
    DateCheck -->|No| Prompt[Return requiresDate:true]
    Prompt --> UI
    
    DateCheck -->|Yes| Storage[Save to GCS]
    Storage --> DB[Save to Cloud SQL]
    
    DB --> CloudSQL[(PostgreSQL Database)]
    Storage --> GCS[(Cloud Storage Bucket)]
```

## Setup & Deployment
*This application is deployed on Google Cloud Run and is not intended for local self-hosting.*
