import express from "express";
import fetch from "node-fetch";
import csv from "csv-parser";
import { Readable } from "stream";

const app = express();
const PORT = process.env.PORT || 3000;

// Public CSV export of your sheet
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1A3MsvJuBJtAnVzaFrm46sF0BqY7wfQ9b4CyUNtJzWug/gviz/tq?tqx=out:csv&sheet=Sheet1";

async function loadGoals() {
  const response = await fetch(SHEET_CSV_URL);
  const text = await response.text();

  const goals = {};
  await new Promise((resolve, reject) => {
    Readable.from(text)
      .pipe(csv())
      .on("data", (row) => {
        if (row.Name && row.Description) {
          goals[row.Name.trim().toLowerCase()] = row.Description.trim();
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return goals;
}

app.get("/goal", async (req, res) => {
  const query = (req.query.name || "").trim().toLowerCase();
  if (!query) {
    return res.status(400).send("Please provide a goal name (?name=...)");
  }

  try {
    const goals = await loadGoals();
    if (goals[query]) {
      res.send(goals[query]);
    } else {
      res.status(404).send(`Goal '${query}' not found.`);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching goals from Google Sheets.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});