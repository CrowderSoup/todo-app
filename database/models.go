package database

type KanbanData struct {
	Columns             []Column `json:"columns"`
	Tasks               []Task   `json:"tasks"`
	UnassignedTasks     []Task   `json:"unassignedTasks,omitempty"` // For backward compatibility
	UnassignedCollapsed bool     `json:"unassignedCollapsed"`
}

type Column struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Order   int    `json:"order"`
	Deleted bool   `json:"deleted,omitempty"`
	Hidden  bool   `json:"hidden,omitempty"`
}

type Task struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	DueDate     string  `json:"dueDate"`
	Priority    *string `json:"priority"`
	ColumnID    *string `json:"columnId"`
	Deleted     bool    `json:"deleted,omitempty"`
	Hidden      bool    `json:"hidden,omitempty"`
}
