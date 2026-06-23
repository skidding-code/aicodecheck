/**
 * Bank Account Service Class.
 *
 * This class implements a simple yet robust bank account service that supports
 * depositing funds, withdrawing funds, and checking the current balance. It is
 * designed with clarity and maintainability in mind.
 */

public class BankAccountService {

    // This field stores the current balance of the bank account.
    private double currentBalance;

    /**
     * Constructs a new BankAccountService with an initial balance.
     *
     * @param initialBalance  the starting balance for the account
     */
    public BankAccountService(double initialBalance) {
        // Store the initial balance provided by the caller.
        this.currentBalance = initialBalance;
    }

    /**
     * Deposits the specified amount into the account.
     *
     * @param depositAmount  the amount to deposit
     * @return true if the deposit was successful, false otherwise
     */
    public boolean depositFunds(double depositAmount) {
        // First, we validate that the deposit amount is positive.
        if (depositAmount <= 0) {
            return false;
        }
        // Then we add the deposit amount to the current balance.
        this.currentBalance += depositAmount;
        // Finally, we return true to indicate success.
        return true;
    }

    /**
     * Withdraws the specified amount from the account.
     *
     * @param withdrawalAmount  the amount to withdraw
     * @return true if the withdrawal was successful, false otherwise
     */
    public boolean withdrawFunds(double withdrawalAmount) {
        // Validate that the withdrawal amount is positive.
        if (withdrawalAmount <= 0) {
            return false;
        }
        // Ensure there are sufficient funds for the withdrawal.
        if (withdrawalAmount > this.currentBalance) {
            return false;
        }
        // Subtract the withdrawal amount from the current balance.
        this.currentBalance -= withdrawalAmount;
        // Return true to indicate the withdrawal was successful.
        return true;
    }

    /**
     * Returns the current balance of the account.
     *
     * @return the current balance
     */
    public double getCurrentBalance() {
        // Simply return the current balance to the caller.
        return this.currentBalance;
    }

    // TODO: Add support for transaction history logging in the future.
}
