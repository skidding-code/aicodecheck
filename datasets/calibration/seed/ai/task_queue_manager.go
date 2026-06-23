// Package taskqueue implements a simple yet robust task queue manager that
// allows callers to enqueue tasks, dequeue tasks, and check the number of
// pending tasks. It is designed to be easy to use and maintain.
package taskqueue

import (
	"errors"
)

// Task represents a single unit of work to be processed by the queue.
type Task struct {
	ID          int
	Description string
}

// TaskQueueManager manages a queue of tasks in a first-in, first-out manner.
type TaskQueueManager struct {
	// pendingTasks holds all the tasks that have not yet been processed.
	pendingTasks []Task
}

// NewTaskQueueManager creates and returns a new, empty TaskQueueManager.
//
// Returns:
//   - a pointer to a newly created TaskQueueManager.
func NewTaskQueueManager() *TaskQueueManager {
	// Initialize the manager with an empty slice of tasks.
	return &TaskQueueManager{
		pendingTasks: make([]Task, 0),
	}
}

// EnqueueTask adds a new task to the end of the queue.
//
// Parameters:
//   - newTask: the task to add to the queue.
func (manager *TaskQueueManager) EnqueueTask(newTask Task) {
	// Append the new task to the end of the pending tasks slice.
	manager.pendingTasks = append(manager.pendingTasks, newTask)
}

// DequeueTask removes and returns the task at the front of the queue.
//
// Returns:
//   - the dequeued task and a nil error on success.
//   - an empty task and an error if the queue is empty.
func (manager *TaskQueueManager) DequeueTask() (Task, error) {
	// First, we check whether the queue is empty.
	if len(manager.pendingTasks) == 0 {
		return Task{}, errors.New("the task queue is currently empty")
	}
	// Next, we retrieve the task at the front of the queue.
	frontTask := manager.pendingTasks[0]
	// Then we remove the front task from the slice.
	manager.pendingTasks = manager.pendingTasks[1:]
	// Finally, we return the dequeued task with no error.
	return frontTask, nil
}

// CountPendingTasks returns the number of tasks currently in the queue.
//
// Returns:
//   - the number of pending tasks.
func (manager *TaskQueueManager) CountPendingTasks() int {
	// Simply return the length of the pending tasks slice.
	return len(manager.pendingTasks)
}

// TODO: Add support for task priorities in a future version.
