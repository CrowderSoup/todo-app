// Task handling functionality for the Kanban App
import { formatDate } from './utils.js';

class TaskHandler {
  constructor(app) {
    this.app = app;
    this.draggedTaskId = null;
  }

  /**
   * Creates a task element for display
   * @param {Object} task - The task data
   * @returns {HTMLElement} The created task element
   */
  createTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = 'task';
    taskElement.draggable = true;
    taskElement.dataset.taskId = task.id;

    // Add priority class to the task element
    if (task.priority) {
      taskElement.classList.add(`priority-${task.priority}-task`);
    }

    // Add due-soon class if the task is due within 3 days
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const today = new Date();
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        taskElement.classList.add('overdue');
      } else if (diffDays <= 3) {
        taskElement.classList.add('due-soon');
      }
    }

    const titleElement = document.createElement('div');
    titleElement.className = 'task-title';
    titleElement.textContent = task.title;

    const contentElement = document.createElement('div');
    contentElement.className = 'task-content';

    // Show brief description if available (limit to 256 characters)
    if (task.description) {
      const briefDesc = task.description.length > 256
        ? task.description.substring(0, 256) + '...'
        : task.description;
      contentElement.textContent = briefDesc;
    }

    const metaElement = document.createElement('div');
    metaElement.className = 'task-meta';

    // Show due date if available
    if (task.dueDate) {
      const dueElement = document.createElement('span');
      dueElement.textContent = `Due: ${formatDate(task.dueDate)}`;
      metaElement.appendChild(dueElement);
    }

    // Show priority if available
    if (task.priority) {
      const priorityElement = document.createElement('span');
      priorityElement.className = `task-priority priority-${task.priority}`;
      priorityElement.textContent = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
      metaElement.appendChild(priorityElement);
    }

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-task';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete task';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmDeleteTask(task.id);
    });

    taskElement.appendChild(titleElement);
    taskElement.appendChild(contentElement);
    taskElement.appendChild(metaElement);
    taskElement.appendChild(deleteBtn);

    // Add click event to open task modal
    taskElement.addEventListener('click', () => this.app.openTaskModal(task.columnId, task.id));

    return taskElement;
  }

  /**
   * Initialize event listeners for task drag and drop
   */
  setupTaskDragEvents() {
    // Find all task elements and attach drag event listeners
    document.querySelectorAll('.task').forEach(task => {
      task.addEventListener('dragstart', e => {
        // Stop event propagation to prevent column drag from firing
        e.stopPropagation();
        this.taskDragStart(e);
      });
      task.addEventListener('dragend', e => this.taskDragEnd(e));
    });

    // Find all task containers and attach drop event listeners
    document.querySelectorAll('.tasks').forEach(container => {
      container.addEventListener('dragenter', e => this.taskContainerDragEnter(e));
      container.addEventListener('dragleave', e => this.taskContainerDragLeave(e));
      container.addEventListener('dragover', e => e.preventDefault());
      container.addEventListener('drop', e => this.taskContainerDrop(e));
    });
  }

  /**
   * Handles dragstart event for tasks
   * @param {DragEvent} e - The drag event
   */
  taskDragStart(e) {
    if (!e.target.classList.contains('task')) return;

    try {
      const taskId = e.target.dataset.taskId;
      this.draggedTaskId = taskId;
      e.dataTransfer.setData('text/plain', taskId);
      e.target.classList.add('dragging');

      // Set a custom drag image that properly reflects the task
      const rect = e.target.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left);
      const offsetY = (e.clientY - rect.top);
      e.dataTransfer.setDragImage(e.target, offsetX, offsetY);
    } catch (error) {
      console.error('Error in taskDragStart:', error);
    }
  }

  /**
   * Handles dragend event for tasks
   * @param {DragEvent} e - The drag event
   */
  taskDragEnd(e) {
    if (!e.target.classList.contains('task')) return;

    e.target.classList.remove('dragging');
    this.draggedTaskId = null;

    // Remove drag-over class from all task containers
    document.querySelectorAll('.tasks').forEach(container => {
      container.classList.remove('drag-over');
    });
  }

  /**
   * Handles dragenter event for task containers
   * @param {DragEvent} e - The drag event
   */
  taskContainerDragEnter(e) {
    e.preventDefault();
    // Only add drag-over if we're dragging a task (not a column)
    if (this.draggedTaskId) {
      e.currentTarget.classList.add('drag-over');
    }
  }

  /**
   * Handles dragleave event for task containers
   * @param {DragEvent} e - The drag event
   */
  taskContainerDragLeave(e) {
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.classList.remove('drag-over');
    }
  }

  /**
   * Handles drop event for task containers
   * @param {DragEvent} e - The drop event
   */
  taskContainerDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const container = e.currentTarget;
    container.classList.remove('drag-over');

    try {
      // Try to get the task ID from dataTransfer first
      let taskId = null;

      if (e.dataTransfer) {
        taskId = e.dataTransfer.getData('text/plain');
      }

      // Fall back to the stored ID if dataTransfer failed
      if (!taskId && this.draggedTaskId) {
        taskId = this.draggedTaskId;
      }

      if (taskId) {
        this.handleTaskDrop(container, taskId);
      }
    } catch (error) {
      console.error('Error in taskContainerDrop:', error);
    }
  }

  /**
   * Processes a task drop operation
   * @param {HTMLElement} container - The container receiving the drop
   * @param {string} taskId - The ID of the task being dropped
   */
  handleTaskDrop(container, taskId) {
    // Get destination column id
    const columnId = container.dataset.columnId;
    if (!columnId) return;

    // Find the task in either tasks or unassignedTasks
    let task = this.app.data.tasks.find(t => t.id === taskId);
    let isUnassigned = false;

    if (!task) {
      task = this.app.data.unassignedTasks.find(t => t.id === taskId);
      isUnassigned = true;
    }

    if (!task) return;

    // Check if task is already in this column
    if ((columnId === 'unassigned' && isUnassigned) ||
      (columnId !== 'unassigned' && task.columnId === columnId)) {
      return;
    }

    // Handle moving between columns or to/from unassigned
    if (columnId === 'unassigned') {
      // Move to unassigned
      const updatedTask = { ...task, columnId: null };
      this.app.data.unassignedTasks.push(updatedTask);
      this.app.data.tasks = this.app.data.tasks.filter(t => t.id !== taskId);
    } else if (isUnassigned) {
      // Move from unassigned to column
      const updatedTask = { ...task, columnId };
      this.app.data.tasks.push(updatedTask);
      this.app.data.unassignedTasks = this.app.data.unassignedTasks.filter(t => t.id !== taskId);
    } else {
      // Move between columns
      task.columnId = columnId;
    }

    this.app.saveToLocalStorage();
    this.app.renderBoard();
  }

  /**
   * Confirms task deletion with the user
   * @param {string} taskId - The ID of the task to delete
   */
  confirmDeleteTask(taskId) {
    if (confirm('Are you sure you want to delete this task?')) {
      this.deleteTaskById(taskId);
    }
  }

  /**
   * Deletes a task by its ID
   * @param {string} taskId - The ID of the task to delete
   */
  deleteTaskById(taskId) {
    // Remove from tasks array
    this.app.data.tasks = this.app.data.tasks.filter(task => task.id !== taskId);

    // Remove from unassigned tasks array
    this.app.data.unassignedTasks = this.app.data.unassignedTasks.filter(task => task.id !== taskId);

    this.app.saveToLocalStorage();
    this.app.renderBoard();
  }
}

export default TaskHandler;
