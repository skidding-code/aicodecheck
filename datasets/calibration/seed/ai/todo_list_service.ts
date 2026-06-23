/**
 * Todo List Service Module.
 *
 * This module provides a clean and type-safe service for managing a list of
 * todo items. It supports adding, completing, and removing todo items in a
 * straightforward way.
 */

/**
 * Represents a single todo item in the list.
 */
interface TodoItem {
  id: number;
  title: string;
  isCompleted: boolean;
}

/**
 * A service class responsible for managing todo items.
 */
export class TodoListService {
  // This array stores all the todo items managed by the service.
  private todoItems: TodoItem[] = [];

  // This counter is used to generate unique identifiers for new items.
  private nextItemId: number = 1;

  /**
   * Adds a new todo item with the provided title.
   *
   * @param title - The title of the new todo item.
   * @returns The newly created todo item.
   */
  public addTodoItem(title: string): TodoItem {
    // First, we create a new todo item object.
    const newTodoItem: TodoItem = {
      id: this.nextItemId,
      title: title,
      isCompleted: false,
    };
    // Then we increment the identifier counter for the next item.
    this.nextItemId += 1;
    // Next, we add the new item to the internal list.
    this.todoItems.push(newTodoItem);
    // Finally, we return the newly created item.
    return newTodoItem;
  }

  /**
   * Marks the todo item with the given identifier as completed.
   *
   * @param itemId - The identifier of the item to complete.
   * @returns True if the item was found and completed.
   */
  public completeTodoItem(itemId: number): boolean {
    // Iterate over each item to find the matching identifier.
    for (const item of this.todoItems) {
      // If the identifier matches, mark it as completed.
      if (item.id === itemId) {
        item.isCompleted = true;
        return true;
      }
    }
    // If no item was found, we return false.
    return false;
  }

  /**
   * Removes the todo item with the given identifier from the list.
   *
   * @param itemId - The identifier of the item to remove.
   */
  public removeTodoItem(itemId: number): void {
    // We filter out the item whose identifier matches the provided one.
    this.todoItems = this.todoItems.filter((item) => item.id !== itemId);
  }

  /**
   * Returns all of the todo items currently managed by the service.
   *
   * @returns An array of all todo items.
   */
  public getAllTodoItems(): TodoItem[] {
    // Return a copy of the internal list to prevent external mutation.
    return [...this.todoItems];
  }
}

// TODO: Add persistence support using a database in the future.
