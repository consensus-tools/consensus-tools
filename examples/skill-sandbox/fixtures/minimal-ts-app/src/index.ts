import express from "express";
import Database from "better-sqlite3";

const app = express();
app.use(express.json());

const db = new Database("tasks.db");
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  dueDate TEXT,
  completed INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
)`);

app.get("/tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY createdAt DESC").all();
  res.json(tasks);
});

app.post("/tasks", (req, res) => {
  const { title, priority, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const result = db.prepare("INSERT INTO tasks (title, priority, dueDate) VALUES (?, ?, ?)").run(title, priority || "medium", dueDate || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  res.json(task);
});

app.put("/tasks/:id", (req, res) => {
  const { title, priority, dueDate, completed } = req.body;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  db.prepare("UPDATE tasks SET title=?, priority=?, dueDate=?, completed=? WHERE id=?")
    .run(title ?? task.title, priority ?? task.priority, dueDate ?? task.dueDate, completed ?? task.completed, req.params.id);
  res.json({ ok: true });
});

app.delete("/tasks/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.listen(3000, () => console.log("Task Manager API on :3000"));
