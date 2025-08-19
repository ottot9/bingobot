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
          const goalName = row.Name.trim().toLowerCase();
          goals[goalName] = {
            name: row.Name.trim(),
            description: row.Description.trim(),
            levels: row["Level(s)"] ? row["Level(s)"].trim() : "",
            difficulty: row.Difficulty ? row.Difficulty.trim() : "",
            videoLink: row["Video Link"] ? row["Video Link"].trim() : ""
          };
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return goals;
}

// Search for goals with fuzzy matching
function searchGoals(goals, query) {
  const queryLower = query.toLowerCase();
  
  // Exact match first
  if (goals[queryLower]) {
    return [goals[queryLower]];
  }
  
  // Partial matches
  const matches = [];
  for (const [key, goal] of Object.entries(goals)) {
    if (key.includes(queryLower) || 
        queryLower.split(' ').every(word => key.includes(word))) {
      matches.push(goal);
    }
  }
  
  return matches;
}

// Format goal information for response
function formatGoal(goal, includeAll = true) {
  let response = `**${goal.name}**: ${goal.description}`;
  
  if (includeAll) {
    if (goal.levels) {
      response += `\n📍 **Level(s):** ${goal.levels}`;
    }
    if (goal.difficulty) {
      response += `\n⭐ **Difficulty:** ${goal.difficulty}`;
    }
    if (goal.videoLink) {
      response += `\n🎥 **Video:** ${goal.videoLink}`;
    }
  }
  
  return response;
}

// Get a single goal
app.get("/goal", async (req, res) => {
  const query = (req.query.name || "").trim();
  if (!query) {
    return res.status(400).send("Please provide a goal name (?name=...)");
  }

  try {
    const goals = await loadGoals();
    const matches = searchGoals(goals, query);
    
    if (matches.length === 0) {
      return res.status(404).send(`Goal "${req.query.name}" not found. Check spelling or try another goal.`);
    }
    
    if (matches.length === 1) {
      const formatted = formatGoal(matches[0]);
      return res.send(formatted);
    }
    
    // Multiple matches - show options
    const matchNames = matches.slice(0, 5).map(g => g.name).join(', ');
    return res.send(`Multiple goals found: ${matchNames}. Please be more specific!`);
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching goals from Google Sheets.");
  }
});

// Get goal with compact format (for StreamElements)
app.get("/goal/compact", async (req, res) => {
  const query = (req.query.name || "").trim();
  if (!query) {
    return res.status(400).send("Please provide a goal name (?name=...)");
  }

  try {
    const goals = await loadGoals();
    const matches = searchGoals(goals, query);
    
    if (matches.length === 0) {
      return res.status(404).send(`Goal "${req.query.name}" not found.`);
    }
    
    if (matches.length === 1) {
      const goal = matches[0];
      let response = `${goal.name}: ${goal.description}`;
      
      if (goal.levels) response += ` | ${goal.levels}`;
      if (goal.difficulty) response += ` | ${goal.difficulty}`;
      
      return res.send(response);
    }
    
    // Multiple matches
    const matchNames = matches.slice(0, 3).map(g => g.name).join(', ');
    return res.send(`Multiple found: ${matchNames}. Be specific!`);
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching goals.");
  }
});

// Get all goals (useful for debugging or listing)
app.get("/goals", async (req, res) => {
  try {
    const goals = await loadGoals();
    const goalList = Object.values(goals).map(goal => ({
      name: goal.name,
      description: goal.description.substring(0, 100) + "...", // Truncate for overview
      levels: goal.levels,
      difficulty: goal.difficulty,
      hasVideo: !!goal.videoLink
    }));
    
    res.json({
      totalGoals: goalList.length,
      goals: goalList
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching goals from Google Sheets.");
  }
});

// Get goals by difficulty
app.get("/goals/difficulty/:level", async (req, res) => {
  const difficultyLevel = req.params.level;
  
  try {
    const goals = await loadGoals();
    const filteredGoals = Object.values(goals).filter(goal => 
      goal.difficulty.includes(difficultyLevel)
    );
    
    if (filteredGoals.length === 0) {
      return res.status(404).send(`No goals found with difficulty "${difficultyLevel}"`);
    }
    
    const goalNames = filteredGoals.map(g => g.name);
    res.json({
      difficulty: difficultyLevel,
      count: goalNames.length,
      goals: goalNames
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching goals.");
  }
});

// Get random goal
app.get("/goal/random", async (req, res) => {
  try {
    const goals = await loadGoals();
    const goalArray = Object.values(goals);
    const randomGoal = goalArray[Math.floor(Math.random() * goalArray.length)];
    
    const formatted = formatGoal(randomGoal);
    res.send(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching goals.");
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.send("Bingo bot is running!");
});

// Root endpoint with usage info
app.get("/", (req, res) => {
  res.send(`
    <h1>Rayman 2 Bingo Goals API</h1>
    <h2>Endpoints:</h2>
    <ul>
      <li><strong>GET /goal?name=[goal_name]</strong> - Get detailed goal information</li>
      <li><strong>GET /goal/compact?name=[goal_name]</strong> - Get compact goal info (for StreamElements)</li>
      <li><strong>GET /goal/random</strong> - Get a random goal</li>
      <li><strong>GET /goals</strong> - List all goals</li>
      <li><strong>GET /goals/difficulty/[level]</strong> - Get goals by difficulty (★, ★★, ★★★)</li>
      <li><strong>GET /health</strong> - Health check</li>
    </ul>
    <h2>Examples:</h2>
    <ul>
      <li>/goal?name=jano skip</li>
      <li>/goal/compact?name=flame skip</li>
      <li>/goals/difficulty/★★★</li>
    </ul>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /goal?name=[goal_name] - Get detailed goal');
  console.log('  GET /goal/compact?name=[goal_name] - Get compact goal');
  console.log('  GET /goal/random - Random goal');
  console.log('  GET /goals - List all goals');
  console.log('  GET /goals/difficulty/[level] - Filter by difficulty');
});