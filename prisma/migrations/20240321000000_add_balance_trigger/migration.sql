-- Create a function to handle balance updates
DELIMITER //
CREATE FUNCTION update_order_balance(order_id INT) 
RETURNS BOOLEAN
DETERMINISTIC
BEGIN
    DECLARE client_id INT;
    DECLARE total_amount DECIMAL(11,2);
    DECLARE amount_paid DECIMAL(11,2);
    DECLARE current_balance DECIMAL(11,2);
    DECLARE new_balance DECIMAL(11,2);
    
    -- Get order details
    SELECT clientId, totalAmount, amountPaid 
    INTO client_id, total_amount, amount_paid
    FROM MyOrder 
    WHERE id = order_id;
    
    -- Get current order balance
    SELECT COALESCE(balance, 0) 
    INTO current_balance
    FROM MyOrder 
    WHERE id = order_id;
    
    -- Calculate new balance
    SET new_balance = GREATEST(0, current_balance - (total_amount - amount_paid));
    
    -- Update order balance
    UPDATE MyOrder 
    SET balance = new_balance 
    WHERE id = order_id;
    
    RETURN TRUE;
END //
DELIMITER ;

-- Create trigger to update balance when amountPaid changes
DELIMITER //
CREATE TRIGGER after_amount_paid_update
AFTER UPDATE ON MyOrder
FOR EACH ROW
BEGIN
    IF NEW.amountPaid != OLD.amountPaid THEN
        CALL update_order_balance(NEW.id);
    END IF;
END //
DELIMITER ; 