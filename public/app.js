// Main application file for Kanban Todo App
import { generateId } from "./utils.js";
import TaskHandler from "../task-handler.js";
import ColumnHandler from "./column-handler.js";
import AuthManager from "./auth-components.js";

class KanbanApp {
  constructor() {
    this.data = {
      columns: [],
      tasks: [],
      unassignedCollapsed: true, // New property to track collapsed state
    };

    // Initialize handlers
    this.taskHandler = new TaskHandler(this);
    this.columnHandler = new ColumnHandler(this);

    // Initialize DOM elements
    this.boardElement = document.getElementById("kanban-board");
    this.unassignedContainer = document.querySelector(".unassigned-container");
    this.unassignedTasksElement = document.querySelector(".unassigned-tasks");
    this.unassignedTitleElement = document.querySelector(".unassigned-title");
    this.collapseIcon = document.querySelector(".collapse-icon");

    // Initialize buttons
    this.addColumnBtn = document.getElementById("add-column-btn");
    this.addUnassignedTaskBtn = document.getElementById("add-unassigned-task");

    // Initialize modals
    this.taskModalOverlay = document.getElementById("task-modal-overlay");
    this.columnModalOverlay = document.getElementById("column-modal-overlay");
    this.closeTaskModalBtn = document.getElementById("close-modal");
    this.closeColumnModalBtn = document.getElementById("close-column-modal");

    // Initialize forms
    this.taskForm = document.getElementById("task-form");
    this.columnForm = document.getElementById("column-form");
    this.deleteTaskBtn = document.getElementById("delete-task-btn");

    // Bind event listeners
    this.bindEvents();

    // Initialize auth manager
    this.authManager = new AuthManager(this);

    // Load data from local storage
    this.loadFromLocalStorage();

    // Render initial board
    this.renderBoard();

    // Apply collapsed state
    this.applyCollapsedState();
  }

  /**
   * Bind event listeners to DOM elements
   */
  bindEvents() {
    // Column events
    this.addColumnBtn.addEventListener("click", () => this.openColumnModal());
    this.closeColumnModalBtn.addEventListener("click", () =>
      this.closeColumnModal()
    );
    this.columnForm.addEventListener("submit", (e) => this.saveColumn(e));

    // Task events
    this.addUnassignedTaskBtn.addEventListener("click", () =>
      this.openTaskModal("unassigned")
    );
    this.closeTaskModalBtn.addEventListener("click", () =>
      this.closeTaskModal()
    );
    this.taskForm.addEventListener("submit", (e) => this.saveTask(e));
    this.deleteTaskBtn.addEventListener("click", () => this.deleteTask());

    // Collapsible unassigned tasks
    this.unassignedTitleElement.addEventListener("click", () =>
      this.toggleUnassignedCollapse()
    );

    // Ensure dragover events are always handled to allow drops
    document.addEventListener("dragover", (e) => e.preventDefault());
  }

  /**
   * Toggle collapsed state of unassigned tasks
   */
  toggleUnassignedCollapse() {
    this.data.unassignedCollapsed = !this.data.unassignedCollapsed;
    this.applyCollapsedState();
    this.saveToLocalStorage();
  }

  /**
   * Apply the collapsed state to the UI
   */
  applyCollapsedState() {
    if (this.data.unassignedCollapsed) {
      this.unassignedContainer.classList.add("collapsed");
    } else {
      this.unassignedContainer.classList.remove("collapsed");
    }
  }

  /**
   * Load data from localStorage
   */
  loadFromLocalStorage() {
    const savedData = localStorage.getItem("kanbanData");

    if (savedData) {
      this.data = JSON.parse(savedData);

      // Add unassignedCollapsed property if it doesn't exist (for backward compatibility)
      if (this.data.unassignedCollapsed === undefined) {
        this.data.unassignedCollapsed = true; // Default to collapsed
      }
    } else {
      // Use default empty data if nothing in localStorage
      this.data = {
        columns: [],
        tasks: [],
        unassignedCollapsed: true,
      };
    }

    // Initialize with order if needed
    if (this.data.columns.length > 0) {
      // Sort columns by order if they have order property
      if (this.data.columns[0].hasOwnProperty("order")) {
        this.data.columns.sort((a, b) => a.order - b.order);
      } else {
        // Add order property if it doesn't exist
        this.data.columns.forEach((column, index) => {
          column.order = index;
        });
      }
    }
  }

  /**
   * Save data to localStorage and trigger sync if authenticated
   */
  saveToLocalStorage() {
    localStorage.setItem("kanbanData", JSON.stringify(this.data));

    // Trigger sync with server if authenticated
    if (this.authManager && this.authManager.isAuthenticated) {
      // Use debounced sync to avoid excessive server calls
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }

      this.syncTimeout = setTimeout(() => {
        // This will sync to the server and broadcast to all connected clients
        this.authManager.syncData();
        this.syncTimeout = null;
      }, 300); // Reduced debounce to 300ms for more responsive real-time updates
    }
  }

  /**
   * Render the entire board
   */
  renderBoard() {
    console.log("Setting up drag and drop");

    // Clear existing board
    this.boardElement.innerHTML = "";

    // Sort columns by order
    this.data.columns.sort((a, b) => a.order - b.order);

    // Render columns (only non-deleted ones)
    this.data.columns
      .filter((column) => !column.deleted && !column.hidden)
      .forEach((column) => {
        const columnElement = this.columnHandler.createColumnElement(column);
        this.boardElement.appendChild(columnElement);
      });

    // Render unassigned tasks
    this.renderUnassignedTasks();

    // Apply collapsed state
    this.applyCollapsedState();

    // Set up drag and drop after rendering
    this.setupDragAndDrop();
  }

  /**
   * Render unassigned tasks
   */
  renderUnassignedTasks() {
    this.unassignedTasksElement.innerHTML = "";

    // Get and sort unassigned tasks (exclude deleted/hidden tasks)
    // Make sure to check for null or undefined columnId to catch tasks that should be in unassigned
    const unassignedTasks = this.data.tasks.filter(
      (task) =>
        (task.columnId === null || task.columnId === undefined) &&
        !task.deleted &&
        !task.hidden
    );

    console.log(`Found ${unassignedTasks.length} unassigned tasks`);

    const sortedUnassignedTasks = this.columnHandler.sortTasks(unassignedTasks);

    sortedUnassignedTasks.forEach((task) => {
      const taskElement = this.taskHandler.createTaskElement(task);
      this.unassignedTasksElement.appendChild(taskElement);
    });

    // Update unassigned tasks count in the header
    const taskCount = unassignedTasks.length;
    if (taskCount > 0) {
      document.querySelector(".unassigned-title h3").textContent =
        `Unassigned Tasks (${taskCount})`;
    } else {
      document.querySelector(".unassigned-title h3").textContent =
        "Unassigned Tasks";
    }
  }

  /**
   * Set up drag and drop events after rendering
   */
  setupDragAndDrop() {
    // Set up task drag and drop
    this.taskHandler.setupTaskDragEvents();

    // Set up column drag and drop
    this.columnHandler.setupColumnDragEvents();
  }

  /**
   * Open column modal for adding or editing
   * @param {string} columnId - The ID of the column to edit (optional)
   */
  openColumnModal(columnId = null) {
    const modalTitle = document.getElementById("column-modal-title");
    const columnTitleInput = document.getElementById("column-title");
    const columnFormId = document.getElementById("column-form-id");

    if (columnId) {
      // Edit existing column
      const column = this.data.columns.find((col) => col.id === columnId);
      if (!column) return;

      modalTitle.textContent = "Edit Column";
      columnTitleInput.value = column.title;
      columnFormId.value = columnId;
    } else {
      // Add new column
      modalTitle.textContent = "Add Column";
      columnTitleInput.value = "";
      columnFormId.value = "";
    }

    this.columnModalOverlay.style.display = "flex";
  }

  /**
   * Close column modal
   */
  closeColumnModal() {
    this.columnModalOverlay.style.display = "none";
    this.columnForm.reset();
  }

  /**
   * Save column from form data
   * @param {Event} e - The form submit event
   */
  saveColumn(e) {
    e.preventDefault();

    const columnTitle = document.getElementById("column-title").value;
    const columnId = document.getElementById("column-form-id").value;

    if (columnId) {
      // Update existing column
      const column = this.data.columns.find((col) => col.id === columnId);
      if (column) {
        column.title = columnTitle;
      }
    } else {
      // Add new column
      const highestOrder =
        this.data.columns.length > 0
          ? Math.max(...this.data.columns.map((c) => c.order))
          : -1;

      const newColumn = {
        id: generateId(),
        title: columnTitle,
        order: highestOrder + 1,
      };

      this.data.columns.push(newColumn);
    }

    this.saveToLocalStorage();
    this.renderBoard();
    this.closeColumnModal();
  }

  /**
   * Open task modal for adding or editing
   * @param {string} columnId - The column ID for the task
   * @param {string} taskId - The ID of the task to edit (optional)
   */
  openTaskModal(columnId, taskId = null) {
    const modalTitle = document.getElementById("modal-title");
    const taskTitleInput = document.getElementById("task-title");
    const taskDescriptionInput = document.getElementById("task-description");
    const taskDueDateInput = document.getElementById("task-due-date");
    const taskPrioritySelect = document.getElementById("task-priority");
    const taskColumnSelect = document.getElementById("task-column");
    const taskIdInput = document.getElementById("task-id");
    const columnIdInput = document.getElementById("column-id");

    // Populate column dropdown
    this.populateColumnDropdown(taskColumnSelect);

    if (taskId) {
      // Find the task
      const task = this.data.tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Edit existing task
      modalTitle.textContent = "Edit Task";
      taskTitleInput.value = task.title;
      taskDescriptionInput.value = task.description || "";
      taskDueDateInput.value = task.dueDate || "";
      taskPrioritySelect.value = task.priority || "";
      taskIdInput.value = taskId;
      columnIdInput.value = task.columnId || "unassigned";

      // Set the dropdown value to match the current column
      taskColumnSelect.value = task.columnId || "unassigned";

      // Show delete button for existing tasks
      this.deleteTaskBtn.classList.remove("hidden");
    } else {
      // Add new task
      modalTitle.textContent = "Add Task";
      taskTitleInput.value = "";
      taskDescriptionInput.value = "";
      taskDueDateInput.value = "";
      taskPrioritySelect.value = ""; // No default priority
      taskIdInput.value = "";
      columnIdInput.value = columnId;

      // Set the dropdown value to match the selected column
      taskColumnSelect.value = columnId;

      // Hide delete button for new tasks
      this.deleteTaskBtn.classList.add("hidden");
    }

    this.taskModalOverlay.style.display = "flex";
  }

  /**
   * Close task modal
   */
  closeTaskModal() {
    this.taskModalOverlay.style.display = "none";
    this.taskForm.reset();
  }

  /**
   * Populate the column dropdown in the task modal
   * @param {HTMLSelectElement} selectElement - The select element to populate
   */
  populateColumnDropdown(selectElement) {
    // Clear existing options except the first one (Unassigned)
    while (selectElement.options.length > 1) {
      selectElement.remove(1);
    }

    // Add options for each column (only non-deleted ones)
    this.data.columns
      .filter((column) => !column.deleted && !column.hidden)
      .sort((a, b) => a.order - b.order)
      .forEach((column) => {
        const option = document.createElement("option");
        option.value = column.id;
        option.textContent = column.title;
        selectElement.appendChild(option);
      });
  }

  /**
   * Save task from form data
   * @param {Event} e - The form submit event
   */
  saveTask(e) {
    e.preventDefault();

    const taskId = document.getElementById("task-id").value;
    const selectedColumnId = document.getElementById("task-column").value;
    const isUnassigned = selectedColumnId === "unassigned";

    // Get priority (may be empty string if not selected)
    const priority = document.getElementById("task-priority").value;

    const taskData = {
      title: document.getElementById("task-title").value,
      description: document.getElementById("task-description").value,
      dueDate: document.getElementById("task-due-date").value,
      priority: priority || null, // Use null if priority is empty
      columnId: isUnassigned ? null : selectedColumnId,
    };

    if (taskId) {
      // Update existing task
      const taskIndex = this.data.tasks.findIndex((t) => t.id === taskId);
      if (taskIndex !== -1) {
        this.data.tasks[taskIndex] = {
          ...this.data.tasks[taskIndex],
          ...taskData,
          id: taskId,
        };
      }

      // Auto-expand unassigned section if moving a task to unassigned
      if (isUnassigned && this.data.unassignedCollapsed) {
        this.data.unassignedCollapsed = false;
        this.applyCollapsedState();
      }
    } else {
      // Add new task
      const newTask = {
        id: generateId(),
        ...taskData,
      };

      this.data.tasks.push(newTask);

      // Auto-expand unassigned section when adding a new unassigned task
      if (isUnassigned && this.data.unassignedCollapsed) {
        this.data.unassignedCollapsed = false;
        this.applyCollapsedState();
      }
    }

    this.saveToLocalStorage();
    this.renderBoard();
    this.closeTaskModal();
  }

  /**
   * Delete task from modal
   */
  deleteTask() {
    const taskId = document.getElementById("task-id").value;
    if (
      taskId &&
      confirm(
        "Tasks cannot be permanently deleted due to database sync. The task will be marked as deleted instead. Continue?"
      )
    ) {
      this.taskHandler.markTaskAsDeleted(taskId);
      this.closeTaskModal();
    }
  }
}

export default KanbanApp;
