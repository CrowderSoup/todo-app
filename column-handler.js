// Column handling functionality for the Kanban App

class ColumnHandler {
  constructor(app) {
    this.app = app;
    this.draggedColumnId = null;
  }

  /**
   * Creates a column element for display
   * @param {Object} column - The column data 
   * @returns {HTMLElement} The created column element
   */
  createColumnElement(column) {
    const columnElement = document.createElement('div');
    columnElement.className = 'column';
    columnElement.dataset.columnId = column.id;
    columnElement.dataset.columnOrder = column.order;
    columnElement.setAttribute('draggable', 'true');

    const headerElement = document.createElement('div');
    headerElement.className = 'column-header';

    const titleInput = document.createElement('input');
    titleInput.value = column.title;
    titleInput.placeholder = 'Enter column title';
    titleInput.dataset.columnId = column.id;
    titleInput.addEventListener('blur', (e) => this.updateColumnTitle(column.id, e.target.value));
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '×';
    deleteButton.title = 'Delete column';
    deleteButton.addEventListener('click', () => this.deleteColumn(column.id));

    headerElement.appendChild(titleInput);
    headerElement.appendChild(deleteButton);

    const tasksElement = document.createElement('div');
    tasksElement.className = 'tasks';
    tasksElement.dataset.columnId = column.id;

    // Get tasks in this column
    let columnTasks = this.app.data.tasks.filter(task => task.columnId === column.id);

    // Sort tasks by due date first, then by priority
    columnTasks = this.sortTasks(columnTasks);

    // Render the sorted tasks
    columnTasks.forEach(task => {
      const taskElement = this.app.taskHandler.createTaskElement(task);
      tasksElement.appendChild(taskElement);
    });

    const addTaskElement = document.createElement('div');
    addTaskElement.className = 'add-task';

    const addTaskButton = document.createElement('button');
    addTaskButton.textContent = '+ Add Task';
    addTaskButton.addEventListener('click', () => this.app.openTaskModal(column.id));

    addTaskElement.appendChild(addTaskButton);

    columnElement.appendChild(headerElement);
    columnElement.appendChild(tasksElement);
    columnElement.appendChild(addTaskElement);

    return columnElement;
  }

  /**
   * Sort tasks by due date and priority
   * @param {Array} tasks - The tasks to sort
   * @returns {Array} Sorted tasks
   */
  sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
      // Priority weight map (higher value = higher priority)
      const priorityWeight = {
        'high': 3,
        'medium': 2,
        'low': 1,
        null: 0,
        undefined: 0
      };

      // First sort by due date (tasks with due dates come first)
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      // If both have due dates, compare them
      if (a.dueDate && b.dueDate) {
        const dateA = new Date(a.dueDate);
        const dateB = new Date(b.dueDate);

        // If dates are different, sort by date
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA - dateB;
        }
      }

      // If dates are the same or both missing, sort by priority
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });
  }

  /**
   * Initialize event listeners for column drag and drop
   */
  setupColumnDragEvents() {
    // Set up column drag events
    document.querySelectorAll('.column').forEach(column => {
      // Make column elements draggable
      column.setAttribute('draggable', 'true');

      // Add dragstart event directly to column
      column.addEventListener('dragstart', e => {
        console.log('Column dragstart event fired');
        this.columnDragStart(e);
      });

      column.addEventListener('dragend', e => this.columnDragEnd(e));
      column.addEventListener('dragenter', e => this.columnDragEnter(e));
      column.addEventListener('dragleave', e => this.columnDragLeave(e));
      column.addEventListener('dragover', e => e.preventDefault());
      column.addEventListener('drop', e => this.columnDrop(e));
    });
  }

  /**
   * Handles dragstart event for columns
   * @param {DragEvent} e - The drag event
   */
  columnDragStart(e) {
    console.log('Inside columnDragStart', e.target);
    const column = e.target.closest('.column');
    if (!column) {
      console.log('No column found in dragstart');
      return;
    }

    try {
      const columnId = column.dataset.columnId;
      console.log('Starting drag for column ID:', columnId);
      this.draggedColumnId = columnId;
      e.dataTransfer.setData('text/plain', columnId);
      e.dataTransfer.effectAllowed = 'move';

      column.classList.add('dragging');

      // Set a custom drag image showing just the header
      const header = column.querySelector('.column-header');
      if (header) {
        const rect = header.getBoundingClientRect();
        e.dataTransfer.setDragImage(header, rect.width / 2, 20);
      }
    } catch (error) {
      console.error('Error in columnDragStart:', error);
    }
  }

  /**
   * Handles dragend event for columns
   * @param {DragEvent} e - The drag event
   */
  columnDragEnd(e) {
    const column = e.target.closest('.column');
    if (!column) return;

    column.classList.remove('dragging');
    this.draggedColumnId = null;

    // Remove indicators from all columns
    document.querySelectorAll('.column').forEach(col => {
      col.classList.remove('drag-over-column-left');
      col.classList.remove('drag-over-column-right');
    });
  }

  /**
   * Handles dragenter event for columns
   * @param {DragEvent} e - The drag event
   */
  columnDragEnter(e) {
    e.preventDefault();

    // Only respond if we're dragging a column
    if (!this.draggedColumnId) return;

    const column = e.currentTarget;

    // Determine left/right position
    const mouseX = e.clientX;
    const rect = column.getBoundingClientRect();
    const isLeftHalf = mouseX < rect.left + rect.width / 2;

    column.classList.remove('drag-over-column-right');
    column.classList.remove('drag-over-column-left');

    if (isLeftHalf) {
      column.classList.add('drag-over-column-left');
    } else {
      column.classList.add('drag-over-column-right');
    }
  }

  /**
   * Handles dragleave event for columns
   * @param {DragEvent} e - The drag event
   */
  columnDragLeave(e) {
    const column = e.currentTarget;
    if (!e.relatedTarget || !column.contains(e.relatedTarget)) {
      column.classList.remove('drag-over-column-left');
      column.classList.remove('drag-over-column-right');
    }
  }

  /**
   * Handles drop event for columns
   * @param {DragEvent} e - The drop event
   */
  columnDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const targetColumn = e.currentTarget;

    // Clear indicators
    targetColumn.classList.remove('drag-over-column-left');
    targetColumn.classList.remove('drag-over-column-right');

    try {
      // Try to get the column ID from dataTransfer first
      let columnId = null;

      if (e.dataTransfer) {
        columnId = e.dataTransfer.getData('text/plain');
      }

      // Fall back to the stored ID if dataTransfer failed
      if (!columnId && this.draggedColumnId) {
        columnId = this.draggedColumnId;
      }

      if (columnId) {
        this.handleColumnDrop(e, columnId, targetColumn);
      }
    } catch (error) {
      console.error('Error in columnDrop:', error);
    }
  }

  /**
   * Processes a column drop operation
   * @param {DragEvent} e - The drop event
   * @param {string} columnId - The ID of the column being dropped
   * @param {HTMLElement} targetColumn - The column element receiving the drop
   */
  handleColumnDrop(e, columnId, targetColumn) {
    // Get target column id
    const targetColumnId = targetColumn.dataset.columnId;
    if (!targetColumnId || targetColumnId === columnId) return;

    // Find the source and target columns
    const sourceColumn = this.app.data.columns.find(c => c.id === columnId);
    const targetColumnObj = this.app.data.columns.find(c => c.id === targetColumnId);

    if (!sourceColumn || !targetColumnObj) return;

    const sourceOrder = sourceColumn.order;
    const targetOrder = targetColumnObj.order;

    // Determine drop position (left or right of target column)
    const mouseX = e.clientX;
    const rect = targetColumn.getBoundingClientRect();
    const dropBeforeTarget = mouseX < rect.left + rect.width / 2;

    // Calculate the new order for the source column
    let newOrder;

    if (dropBeforeTarget) {
      // Dropping to the left of target
      newOrder = targetOrder;

      // Shift all columns between target and source
      this.app.data.columns.forEach(column => {
        if (sourceOrder > targetOrder) {
          // Moving left
          if (column.order >= targetOrder && column.order < sourceOrder) {
            column.order++;
          }
        }
      });
    } else {
      // Dropping to the right of target
      newOrder = targetOrder + 1;

      // Shift all columns between source and target
      this.app.data.columns.forEach(column => {
        if (sourceOrder < targetOrder) {
          // Moving right
          if (column.order > sourceOrder && column.order <= targetOrder) {
            column.order--;
          }
        } else {
          // Moving left but drop after target
          if (column.order > targetOrder && column.order < sourceOrder) {
            column.order++;
          }
        }
      });
    }

    // Set the new order for the source column
    sourceColumn.order = newOrder;

    // Sort columns by order
    this.app.data.columns.sort((a, b) => a.order - b.order);

    this.app.saveToLocalStorage();
    this.app.renderBoard();
  }

  /**
   * Updates a column's title
   * @param {string} columnId - The ID of the column to update
   * @param {string} newTitle - The new title for the column
   */
  updateColumnTitle(columnId, newTitle) {
    const column = this.app.data.columns.find(col => col.id === columnId);
    if (column) {
      column.title = newTitle;
      this.app.saveToLocalStorage();
    }
  }

  /**
   * Deletes a column
   * @param {string} columnId - The ID of the column to delete
   */
  deleteColumn(columnId) {
    if (!confirm('Are you sure you want to delete this column? All tasks in this column will be moved to unassigned tasks.')) {
      return;
    }

    // Get column order before removing
    const columnToDelete = this.app.data.columns.find(col => col.id === columnId);
    if (!columnToDelete) return;
    const deletedOrder = columnToDelete.order;

    // Move tasks in this column to unassigned
    const columnTasks = this.app.data.tasks.filter(task => task.columnId === columnId);

    columnTasks.forEach(task => {
      task.columnId = null;
      this.app.data.unassignedTasks.push(task);
    });

    // Remove tasks from main tasks array
    this.app.data.tasks = this.app.data.tasks.filter(task => task.columnId !== columnId);

    // Remove column
    this.app.data.columns = this.app.data.columns.filter(col => col.id !== columnId);

    // Update order of remaining columns
    this.app.data.columns.forEach(column => {
      if (column.order > deletedOrder) {
        column.order--;
      }
    });

    this.app.saveToLocalStorage();
    this.app.renderBoard();
  }
}

export default ColumnHandler;
