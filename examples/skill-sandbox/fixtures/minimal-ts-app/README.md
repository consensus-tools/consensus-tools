# Task Manager API

A simple REST API for managing tasks, built with TypeScript and Express.

## Features
- Create, read, update, delete tasks
- Task priorities (low, medium, high)
- Due date tracking
- SQLite database

## Setup
npm install && npm run dev

## API Endpoints
- GET /tasks — list all tasks
- POST /tasks — create task (body: { title, priority?, dueDate? })
- GET /tasks/:id — get task by ID
- PUT /tasks/:id — update task
- DELETE /tasks/:id — delete task
