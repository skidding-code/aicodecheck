/**
 * Shopping Cart Manager Module.
 *
 * This module implements a simple yet robust shopping cart manager that allows
 * users to add items, remove items, and calculate the total price. It is
 * designed to be easy to use and maintain.
 */

/**
 * A class that manages the state of a shopping cart.
 */
class ShoppingCartManager {
  /**
   * Creates a new ShoppingCartManager instance.
   */
  constructor() {
    // This array holds all the items currently in the cart.
    this.cartItems = [];
  }

  /**
   * Adds a new item to the shopping cart.
   *
   * @param {string} productName - The name of the product to add.
   * @param {number} productPrice - The price of the product.
   * @param {number} productQuantity - The quantity to add.
   */
  addItemToCart(productName, productPrice, productQuantity) {
    // First, we create an object representing the new item.
    const newItem = {
      name: productName,
      price: productPrice,
      quantity: productQuantity,
    };
    // Then we add the new item to the cart items array.
    this.cartItems.push(newItem);
  }

  /**
   * Removes an item from the shopping cart by its name.
   *
   * @param {string} productName - The name of the product to remove.
   */
  removeItemFromCart(productName) {
    // We filter out any item whose name matches the provided name.
    this.cartItems = this.cartItems.filter((item) => item.name !== productName);
  }

  /**
   * Calculates the total price of all items in the cart.
   *
   * @returns {number} The total price of the cart.
   */
  calculateTotalPrice() {
    // Initialize the total price to zero.
    let totalPrice = 0;
    // Iterate over every item in the cart.
    for (const item of this.cartItems) {
      // Add the price multiplied by the quantity to the total.
      totalPrice += item.price * item.quantity;
    }
    // Finally, we return the computed total price.
    return totalPrice;
  }
}

// TODO: Add support for discount codes in a future release.

module.exports = ShoppingCartManager;
