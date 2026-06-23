/**
 * Inventory Manager Class.
 *
 * This class provides a clean and robust implementation of an inventory
 * manager that allows users to add products, remove products, and check the
 * available quantity of a product. It is designed to be easy to use and
 * maintain.
 */

import java.util.HashMap;
import java.util.Map;

public class InventoryManager {

    // This map stores the quantity of each product keyed by its name.
    private Map<String, Integer> productInventory;

    /**
     * Constructs a new InventoryManager with an empty inventory.
     */
    public InventoryManager() {
        // Initialize the internal inventory map.
        this.productInventory = new HashMap<>();
    }

    /**
     * Adds a specified quantity of a product to the inventory.
     *
     * @param productName     the name of the product to add
     * @param quantityToAdd   the quantity of the product to add
     */
    public void addProduct(String productName, int quantityToAdd) {
        // First, we retrieve the current quantity, defaulting to zero.
        int currentQuantity = this.productInventory.getOrDefault(productName, 0);
        // Then we compute the updated quantity.
        int updatedQuantity = currentQuantity + quantityToAdd;
        // Finally, we store the updated quantity in the inventory.
        this.productInventory.put(productName, updatedQuantity);
    }

    /**
     * Removes a specified quantity of a product from the inventory.
     *
     * @param productName       the name of the product to remove
     * @param quantityToRemove  the quantity of the product to remove
     * @return true if the removal was successful, false otherwise
     */
    public boolean removeProduct(String productName, int quantityToRemove) {
        // Check whether the product actually exists in the inventory.
        if (!this.productInventory.containsKey(productName)) {
            return false;
        }
        // Retrieve the current quantity of the product.
        int currentQuantity = this.productInventory.get(productName);
        // If there is not enough quantity, we cannot remove it.
        if (currentQuantity < quantityToRemove) {
            return false;
        }
        // Compute and store the updated quantity.
        int updatedQuantity = currentQuantity - quantityToRemove;
        this.productInventory.put(productName, updatedQuantity);
        // Return true to indicate the removal was successful.
        return true;
    }

    /**
     * Returns the available quantity of the specified product.
     *
     * @param productName  the name of the product to check
     * @return the available quantity of the product
     */
    public int getAvailableQuantity(String productName) {
        // Return the quantity, defaulting to zero if not present.
        return this.productInventory.getOrDefault(productName, 0);
    }

    // TODO: Add support for product categories in a future version.
}
