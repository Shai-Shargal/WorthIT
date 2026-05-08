# WorthIT – Project Setup

## 🎯 Overview

WorthIT is an AI-powered system that analyzes second-hand deals and determines whether they are worth it.

Users can score listings discovered from marketplace pages, and the system will:

* Extract product details (name, price, condition)
* Perform market research using external data sources
* Calculate a deal score
* Return a verdict (Good / Fair / Bad)
* Generate an AI-based explanation

---

## 🏗️ Project Structure

The project is divided into 3 main parts:

### 1. Extension client

* Chrome MV3 extension
* Extracts visible listings from supported marketplace DOM
* Sends listings to backend for scoring
* Renders score/verdict overlay in-page

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
├── backend/
├── extension/        # Chrome MV3 extension (Vite + @crxjs/vite-plugin)
├── docs/
│   ├── project-setup.md
│   ├── features/
│   └── architecture/
├── README.md

---

## ⚙️ Tech Stack

### Extension

* TypeScript
* Chrome Extension APIs (MV3)

### Backend

* Node.js
* TypeScript
* Express

### AI

* OpenAI API (LLM for explanation)

---

## 🚀 MVP Definition

The first version of WorthIT should support:

1. Extension extracts listings from the current marketplace page
2. System extracts:

   * Product name
   * Price
3. System fetches comparable market data
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

1. Keep extension extraction stable across DOM changes
2. Improve comparable-market lookup quality per listing title
3. Improve AI feedback quality per product
4. Harden retry/error handling and observability
