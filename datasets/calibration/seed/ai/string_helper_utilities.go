// Package stringhelper provides a collection of helpful utility functions for
// working with strings in a clean and reusable way. Each function is well
// documented and handles edge cases gracefully.
package stringhelper

import (
	"strings"
)

// ReverseString reverses the characters in the provided string and returns the
// resulting reversed string.
//
// Parameters:
//   - inputString: the string to reverse.
//
// Returns:
//   - the reversed string.
func ReverseString(inputString string) string {
	// First, we convert the string into a slice of runes.
	runeSlice := []rune(inputString)
	// Next, we iterate over the slice and swap characters from both ends.
	for i, j := 0, len(runeSlice)-1; i < j; i, j = i+1, j-1 {
		runeSlice[i], runeSlice[j] = runeSlice[j], runeSlice[i]
	}
	// Finally, we convert the rune slice back into a string and return it.
	return string(runeSlice)
}

// CountWords counts the number of words in the provided string and returns the
// resulting count.
//
// Parameters:
//   - inputString: the string to analyze.
//
// Returns:
//   - the number of words in the string.
func CountWords(inputString string) int {
	// Handle the empty string edge case first.
	if strings.TrimSpace(inputString) == "" {
		return 0
	}
	// Split the string on whitespace and count the resulting fields.
	words := strings.Fields(inputString)
	// Return the number of words found.
	return len(words)
}

// CapitalizeFirstLetter capitalizes the first letter of the provided string and
// returns the resulting string.
//
// Parameters:
//   - inputString: the string to capitalize.
//
// Returns:
//   - the capitalized string.
func CapitalizeFirstLetter(inputString string) string {
	// If the string is empty, we simply return it unchanged.
	if inputString == "" {
		return ""
	}
	// Capitalize the first character and append the remainder of the string.
	return strings.ToUpper(inputString[:1]) + inputString[1:]
}

// TODO: Add support for Unicode-aware capitalization in a future version.
