-- 20260514000000_automated_recurring_trigger.sql
-- Automated generation of transactions from recurring_transactions

CREATE OR REPLACE FUNCTION public.process_recurring_transactions()
RETURNS void AS $$
DECLARE
    rec RECORD;
    v_next_date DATE;
BEGIN
    FOR rec IN 
        SELECT * FROM public.recurring_transactions 
        WHERE is_active = true 
        AND (next_date IS NULL OR next_date <= CURRENT_DATE)
    LOOP
        -- 1. Insert the transaction
        INSERT INTO public.transactions (
            user_id,
            amount,
            type,
            category_name,
            notes,
            occurred_at,
            metadata
        ) VALUES (
            rec.user_id,
            rec.amount,
            rec.type,
            rec.category_name,
            'Automated recurring transaction: ' || rec.name,
            COALESCE(rec.next_date, CURRENT_DATE),
            jsonb_build_object('recurring_id', rec.id)
        );

        -- 2. Calculate next date
        v_next_date := COALESCE(rec.next_date, CURRENT_DATE);
        
        CASE rec.frequency
            WHEN 'daily' THEN v_next_date := v_next_date + INTERVAL '1 day';
            WHEN 'weekly' THEN v_next_date := v_next_date + INTERVAL '1 week';
            WHEN 'monthly' THEN v_next_date := v_next_date + INTERVAL '1 month';
            WHEN 'yearly' THEN v_next_date := v_next_date + INTERVAL '1 year';
            ELSE v_next_date := v_next_date + INTERVAL '1 month';
        END CASE;

        -- 3. Update the recurring record
        UPDATE public.recurring_transactions 
        SET next_date = v_next_date 
        WHERE id = rec.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: In a real production environment, you would call this function via pg_cron:
-- SELECT cron.schedule('0 0 * * *', 'SELECT public.process_recurring_transactions()');
