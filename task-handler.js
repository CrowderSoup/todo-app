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

      // Auto-expand unassigned section if dragging over it while collapsed
      if (e.currentTarget.dataset.columnId === 'unassigned' &&
        this.app.unassignedContainer.classList.contains('collapsed')) {
        this.app.toggleUnassignedCollapse();
      }
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

    // Find the task
    const task = this.app.data.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    console.log(`Moving task ${taskId} to ${columnId === 'unassigned' ? 'unassigned' : columnId} (from ${task.columnId === null ? 'unassigned' : task.columnId})`);
    
    // Check if task is already in this column 
    // Always allow moving FROM unassigned TO another column
    if ((columnId === 'unassigned' && task.columnId === null) ||
      (columnId !== 'unassigned' && task.columnId === columnId && task.columnId !== null)) {
      console.log('Task already in destination column, skipping');
      return;
    }

    // Update columnId - if unassigned, set to null, otherwise use columnId
    if (columnId === 'unassigned') {
      task.columnId = null;
      console.log('Set task.columnId to null for unassigned column');
    } else {
      task.columnId = columnId;
      console.log(`Set task.columnId to ${columnId}`);
    }
    
    // Auto-expand unassigned section if dropping to unassigned while collapsed
    if (columnId === 'unassigned' && this.app.data.unassignedCollapsed) {
      this.app.data.unassignedCollapsed = false;
      this.app.applyCollapsedState();
    }

    // Save changes to local storage
    this.app.saveToLocalStorage();
    
    // Send update to server immediately - the server is the source of truth
    if (this.app.authManager && this.app.authManager.isAuthenticated) {
      // Don't wait for interval - sync immediately to server
      this.app.authManager.syncData();
      
      // Also send WebSocket message if available
      if (this.app.authManager.ws && this.app.authManager.ws.readyState === WebSocket.OPEN) {
        const message = {
          type: 'taskMove',
          data: {
            taskId: taskId,
            columnId: columnId === 'unassigned' ? null : columnId,
            task: task
          },
          user: this.app.authManager.email
        };
        console.log('Sending WebSocket taskMove message:', message);
        this.app.authManager.ws.send(JSON.stringify(message));
      } else {
        console.log('WebSocket not in OPEN state, initiating reconnect');
        // Attempt to reconnect the WebSocket
        this.app.authManager.setupWebSocket();
      }
    }
    
    // Render the board after sending the update
    this.app.renderBoard();
  }

  /**
   * Confirms task deletion with the user
   * @param {string} taskId - The ID of the task to delete
   */
  confirmDeleteTask(taskId) {
    if (confirm('Tasks cannot be permanently deleted due to database sync. The task will be marked as deleted instead. Continue?')) {
      this.markTaskAsDeleted(taskId);
    }
  }

  /**
   * Marks a task as deleted instead of actually deleting it
   * @param {string} taskId - The ID of the task to mark as deleted
   */
  markTaskAsDeleted(taskId) {
    // Find the task
    const taskIndex = this.app.data.tasks.findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      // Add deleted flag and hide it from UI
      this.app.data.tasks[taskIndex].deleted = true;
      this.app.data.tasks[taskIndex].hidden = true;
    }

    this.app.saveToLocalStorage();
    this.app.renderBoard();
  }
  
  // deleteTaskById method is kept for backward compatibility
  deleteTaskById(taskId) {
    // Redirect to the new method
    this.markTaskAsDeleted(taskId);
  }
}

export default TaskHandler;
