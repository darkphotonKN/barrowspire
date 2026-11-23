-- Match-result notifications are retired: the hub plus delve runs no longer
-- announce each run's end, and the consumer that wrote them is gone. Drop the
-- rows it left behind, and their inbox marks, so old accounts stop showing them.
DELETE FROM notifications WHERE event_type = 'game.ended';
DELETE FROM processed_events WHERE event_type = 'match.ended';
