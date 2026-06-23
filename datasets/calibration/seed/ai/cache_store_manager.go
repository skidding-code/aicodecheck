// Package cachestore implements a simple yet robust in-memory cache store
// manager that allows callers to set values, retrieve values, and delete
// values. It is designed to be easy to use and maintain.
package cachestore

import (
	"sync"
)

// CacheStoreManager manages a thread-safe in-memory cache of key-value pairs.
type CacheStoreManager struct {
	// mutex protects concurrent access to the internal cache map.
	mutex sync.RWMutex
	// cachedValues holds the cached key-value pairs.
	cachedValues map[string]string
}

// NewCacheStoreManager creates and returns a new, empty CacheStoreManager.
//
// Returns:
//   - a pointer to a newly created CacheStoreManager.
func NewCacheStoreManager() *CacheStoreManager {
	// Initialize the manager with an empty cache map.
	return &CacheStoreManager{
		cachedValues: make(map[string]string),
	}
}

// SetValue stores the provided value under the given key in the cache.
//
// Parameters:
//   - key: the key under which to store the value.
//   - value: the value to store in the cache.
func (manager *CacheStoreManager) SetValue(key string, value string) {
	// First, we acquire a write lock to ensure exclusive access.
	manager.mutex.Lock()
	// We make sure to release the lock when the function returns.
	defer manager.mutex.Unlock()
	// Then we store the value under the given key.
	manager.cachedValues[key] = value
}

// GetValue retrieves the value associated with the given key from the cache.
//
// Parameters:
//   - key: the key to look up in the cache.
//
// Returns:
//   - the cached value and a boolean indicating whether it was found.
func (manager *CacheStoreManager) GetValue(key string) (string, bool) {
	// First, we acquire a read lock to allow concurrent reads.
	manager.mutex.RLock()
	// We make sure to release the lock when the function returns.
	defer manager.mutex.RUnlock()
	// Then we look up the value and return it along with the found flag.
	value, found := manager.cachedValues[key]
	return value, found
}

// DeleteValue removes the value associated with the given key from the cache.
//
// Parameters:
//   - key: the key whose value should be removed.
func (manager *CacheStoreManager) DeleteValue(key string) {
	// Acquire a write lock for exclusive access.
	manager.mutex.Lock()
	// Release the lock when the function returns.
	defer manager.mutex.Unlock()
	// Delete the value associated with the given key.
	delete(manager.cachedValues, key)
}

// TODO: Add support for time-based expiration of cached values.
