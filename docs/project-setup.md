# WorthIT – Project Setup

## 🎯 Overview

WorthIT is an AI-powered system that analyzes second-hand deals and determines whether they are worth it.

Users can paste a product listing (text or link), and the system will:

* Extract product details (name, price, condition)
* Perform market research using external data sources
* Calculate a deal score
* Return a verdict (Good / Fair / Bad)
* Generate an AI-based explanation

---

## 🏗️ Project Structure

The project is divided into 3 main parts:

### 1. Frontend

* React + TypeScript
* Simple UI:

  * Input (paste deal)
  * Button (analyze)
  * Result display

### 2. Backend

* Node.js + TypeScript (Express or similar)
* Responsibilities:

  * Parse user input
  * Extract product & price
  * Fetch market data (initially mocked)
  * Calculate deal score
  * Call LLM for explanation

### 3. Docs

* All features are documented before implementation
* Each feature has its own `.md` file
* Cursor will generate code based on docs

---

## 📁 Folder Structure

root/
├── frontend/
├── backend/
├── docs/
│   ├── project-setup.md
│   ├── features/
│   └── architecture/
├── README.md

---

## ⚙️ Tech Stack

### Frontend

* React
* TypeScript
* (Optional: Tailwind / MUI)

### Backend

* Node.js
* TypeScript
* Express

### AI

* OpenAI API (LLM for explanation)

---

## 🚀 MVP Definition

The first version of WorthIT should support:

1. User inputs a product description
2. System extracts:

   * Product name
   * Price
3. System uses mock market data
4. System calculates:

   * Median price
   * Deal score
5. System returns:

   * Score (0–100)
   * Verdict
   * Explanation

---

## 🧠 Development Philosophy

* Build fast, iterate later
* No over-engineering
* Each feature starts with a doc file
* Code is generated via Cursor from docs

---

## 📌 Next Steps

1. Create project structure (frontend/backend/docs)
2. Initialize frontend (React + TS)
3. Initialize backend (Node + TS)
4. Implement first feature: `analyzeDeal`
